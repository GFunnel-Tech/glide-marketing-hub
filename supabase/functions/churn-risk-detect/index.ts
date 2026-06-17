// AI-driven churn-risk detection.
// Gathers performance, spend, engagement, and billing signals for every client
// in a workspace, then asks Lovable AI to score each one and explain why.
// Results are upserted into public.client_churn_risk and high-risk clients
// optionally seed Daily Focus items for workspace owners/admins.
//
// POST { workspace_id, client_id? }  → scopes the scan
//   (client_id omitted = whole workspace)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const AI_MODEL = "google/gemini-3-flash-preview";

const AI_SYSTEM = `You are a customer-success analyst for a Meta Ads agency.
For each client you receive, decide how likely they are to churn in the next
30 days based on the signals provided.

Weigh four signal families:
  1. Performance decay — rising CPL, falling leads, slipping status.
  2. Spend drop / pause — daily spend collapsing, campaigns paused, no
     spend in the last 7 days, status BLOCKED/PAUSED.
  3. Engagement / ops — stalled onboarding, no recent notes/messages,
     missed approvals, very old last_audit.
  4. Billing health — failed payments, low/negative wallet balance,
     PENDING_CANCELLATION status.

Return ONLY JSON of shape:
{ "results": [
    { "client_id": 123,
      "risk_level": "low" | "medium" | "high",
      "score": 0-100,
      "reasons": ["short bullet", "another bullet"],
      "suggested_actions": ["concrete next step", "..."],
      "summary": "1-2 sentence plain English explanation for an account manager"
    }
] }
- Score 0-39 = low, 40-69 = medium, 70-100 = high.
- Keep reasons concrete and metric-grounded ("CPL up 87% over 14d").
- 2-4 reasons and 2-3 suggested actions per client.
- If a client looks healthy, still return them with low risk and an empty reasons array.`;

interface ClientSignals {
  client_id: number;
  name: string;
  status: string;
  launched_at: string | null;
  last_audit: string | null;
  // performance
  cpl: number | null;
  cpm: number | null;
  leads: number | null;
  spend: number | null;
  frequency: number | null;
  // recent trend (last 7d vs prior 7d)
  spend_7d: number;
  spend_prev_7d: number;
  leads_7d: number;
  leads_prev_7d: number;
  spend_last_3d: number;
  days_since_spend: number | null;
  // engagement
  notes_30d: number;
  messages_30d: number;
  onboarding_phase: number | null;
  // billing
  failed_payments_60d: number;
  wallet_balance: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!LOVABLE_KEY) return json({ error: "LOVABLE_API_KEY missing" }, 500);

  const body = await req.json().catch(() => ({}));
  const workspaceId: string | undefined = body.workspace_id;
  const onlyClientId: number | undefined = body.client_id;
  if (!workspaceId) return json({ error: "workspace_id required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 1. Pull clients in scope
  let clientsQ = admin
    .from("clients")
    .select("id, name, status, launched_at, last_audit, cpl, cpm, leads, spend, frequency")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null);
  if (onlyClientId) clientsQ = clientsQ.eq("id", onlyClientId);
  const { data: clients, error: cErr } = await clientsQ;
  if (cErr) return json({ error: cErr.message }, 500);
  if (!clients || clients.length === 0) return json({ scanned: 0, results: [] });

  const clientIds = clients.map((c: any) => c.id);

  // 2. Pull ad-account ids per client (for insights aggregation)
  const { data: accts } = await admin
    .from("meta_ad_accounts")
    .select("id, client_id")
    .in("client_id", clientIds);
  const acctsByClient = new Map<number, string[]>();
  for (const a of (accts ?? []) as any[]) {
    const arr = acctsByClient.get(a.client_id) ?? [];
    arr.push(a.id);
    acctsByClient.set(a.client_id, arr);
  }

  // 3. Pull insights for last 14 days
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const from14 = new Date(today);
  from14.setDate(from14.getDate() - 14);
  const { data: insights } = await admin
    .from("meta_insights_daily")
    .select("ad_account_id, date, spend, leads")
    .gte("date", fmt(from14));

  const insightsByAccount = new Map<string, any[]>();
  for (const r of (insights ?? []) as any[]) {
    const arr = insightsByAccount.get(r.ad_account_id) ?? [];
    arr.push(r);
    insightsByAccount.set(r.ad_account_id, arr);
  }

  // 4. Notes, onboarding, payments, wallets
  const since30 = new Date(today);
  since30.setDate(since30.getDate() - 30);
  const since60 = new Date(today);
  since60.setDate(since60.getDate() - 60);

  const [notesRes, messagesRes, onboardingRes, paymentsRes, walletsRes] = await Promise.all([
    admin.from("client_notes").select("client_id").in("client_id", clientIds).gte("created_at", since30.toISOString()),
    admin.from("messages").select("conversation_id, created_at, conversation_participants:conversations!inner(client_id)" as any).gte("created_at", since30.toISOString()).limit(1).then(() => ({ data: [] })).catch(() => ({ data: [] })),
    admin.from("portal_onboarding").select("client_id, phase").in("client_id", clientIds),
    admin.from("payment_events").select("client_id, status, created_at").in("client_id", clientIds).gte("created_at", since60.toISOString()),
    admin.from("client_wallets").select("client_id, balance").in("client_id", clientIds),
  ]);

  const notesCount = new Map<number, number>();
  for (const n of (notesRes.data ?? []) as any[]) {
    notesCount.set(n.client_id, (notesCount.get(n.client_id) ?? 0) + 1);
  }
  const onboardingPhase = new Map<number, number>();
  for (const o of (onboardingRes.data ?? []) as any[]) {
    onboardingPhase.set(o.client_id, o.phase);
  }
  const failedPayments = new Map<number, number>();
  for (const p of (paymentsRes.data ?? []) as any[]) {
    if (String(p.status || "").toLowerCase().includes("fail")) {
      failedPayments.set(p.client_id, (failedPayments.get(p.client_id) ?? 0) + 1);
    }
  }
  const walletBalance = new Map<number, number>();
  for (const w of (walletsRes.data ?? []) as any[]) {
    walletBalance.set(w.client_id, Number(w.balance ?? 0));
  }

  // 5. Build signal payload per client
  const signals: ClientSignals[] = [];
  const todayStr = fmt(today);
  for (const c of clients as any[]) {
    const acctIds = acctsByClient.get(c.id) ?? [];
    const allRows = acctIds.flatMap((id) => insightsByAccount.get(id) ?? []);
    let spend7 = 0, spendPrev7 = 0, leads7 = 0, leadsPrev7 = 0, spendLast3 = 0;
    let lastSpendDate: string | null = null;
    const cutoff7 = new Date(today); cutoff7.setDate(cutoff7.getDate() - 7);
    const cutoff14 = new Date(today); cutoff14.setDate(cutoff14.getDate() - 14);
    const cutoff3 = new Date(today); cutoff3.setDate(cutoff3.getDate() - 3);
    for (const r of allRows) {
      const d = new Date(r.date + "T00:00:00Z");
      const spend = Number(r.spend ?? 0);
      const leads = Number(r.leads ?? 0);
      if (d >= cutoff7) { spend7 += spend; leads7 += leads; }
      else if (d >= cutoff14) { spendPrev7 += spend; leadsPrev7 += leads; }
      if (d >= cutoff3) spendLast3 += spend;
      if (spend > 0 && (!lastSpendDate || r.date > lastSpendDate)) lastSpendDate = r.date;
    }
    let daysSinceSpend: number | null = null;
    if (lastSpendDate) {
      const diff = (Date.parse(todayStr) - Date.parse(lastSpendDate)) / (1000 * 60 * 60 * 24);
      daysSinceSpend = Math.round(diff);
    }

    signals.push({
      client_id: c.id,
      name: c.name,
      status: c.status,
      launched_at: c.launched_at,
      last_audit: c.last_audit,
      cpl: c.cpl,
      cpm: c.cpm,
      leads: c.leads,
      spend: c.spend,
      frequency: c.frequency,
      spend_7d: Math.round(spend7 * 100) / 100,
      spend_prev_7d: Math.round(spendPrev7 * 100) / 100,
      leads_7d: leads7,
      leads_prev_7d: leadsPrev7,
      spend_last_3d: Math.round(spendLast3 * 100) / 100,
      days_since_spend: daysSinceSpend,
      notes_30d: notesCount.get(c.id) ?? 0,
      messages_30d: 0,
      onboarding_phase: onboardingPhase.get(c.id) ?? null,
      failed_payments_60d: failedPayments.get(c.id) ?? 0,
      wallet_balance: walletBalance.get(c.id) ?? null,
    });
  }

  // 6. Score in batches via Lovable AI
  const allResults: any[] = [];
  const batchSize = 15;
  for (let i = 0; i < signals.length; i += batchSize) {
    const batch = signals.slice(i, i + batchSize);
    try {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
        body: JSON.stringify({
          model: AI_MODEL,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: AI_SYSTEM },
            { role: "user", content: JSON.stringify({ clients: batch }) },
          ],
        }),
      });
      if (!aiRes.ok) {
        const txt = await aiRes.text();
        console.error("Lovable AI error", aiRes.status, txt);
        if (aiRes.status === 429) return json({ error: "Rate limit hit, try again shortly" }, 429);
        if (aiRes.status === 402) return json({ error: "AI credits exhausted" }, 402);
        continue;
      }
      const aiBody = await aiRes.json();
      const content = aiBody?.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed?.results)) allResults.push(...parsed.results);
    } catch (e) {
      console.error("batch failed", e);
    }
  }

  // 7. Upsert into client_churn_risk
  const upserts = allResults
    .filter((r) => typeof r?.client_id === "number")
    .map((r) => {
      const sig = signals.find((s) => s.client_id === r.client_id);
      return {
        client_id: r.client_id,
        workspace_id: workspaceId,
        risk_level: ["low", "medium", "high"].includes(r.risk_level) ? r.risk_level : "low",
        score: Math.max(0, Math.min(100, Number(r.score) || 0)),
        signals: sig ?? {},
        reasons: Array.isArray(r.reasons) ? r.reasons : [],
        suggested_actions: Array.isArray(r.suggested_actions) ? r.suggested_actions : [],
        summary: typeof r.summary === "string" ? r.summary : null,
        model: AI_MODEL,
        computed_at: new Date().toISOString(),
      };
    });

  if (upserts.length > 0) {
    const { error: upErr } = await admin
      .from("client_churn_risk")
      .upsert(upserts, { onConflict: "client_id" });
    if (upErr) console.error("upsert error", upErr);
  }

  // 8. Seed Daily Focus items for newly-High clients (one per owner/admin)
  const highRisk = upserts.filter((u) => u.risk_level === "high");
  if (highRisk.length > 0) {
    const { data: members } = await admin
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", workspaceId)
      .in("role", ["owner", "admin"]);
    const focusRows: any[] = [];
    for (const m of (members ?? []) as any[]) {
      for (const h of highRisk) {
        const sig = signals.find((s) => s.client_id === h.client_id);
        focusRows.push({
          user_id: m.user_id,
          title: `Churn risk: ${sig?.name ?? "Client #" + h.client_id}`,
          notes: h.summary ?? "Review this client — high churn risk detected.",
          is_done: false,
        });
      }
    }
    // De-dupe against existing identical undone titles to avoid spam
    if (focusRows.length > 0) {
      const titles = [...new Set(focusRows.map((r) => r.title))];
      const { data: existing } = await admin
        .from("daily_focus_items")
        .select("user_id, title")
        .in("title", titles)
        .eq("is_done", false);
      const existSet = new Set(((existing ?? []) as any[]).map((e) => `${e.user_id}|${e.title}`));
      const fresh = focusRows.filter((r) => !existSet.has(`${r.user_id}|${r.title}`));
      if (fresh.length > 0) await admin.from("daily_focus_items").insert(fresh);
    }
  }

  return json({ scanned: signals.length, scored: upserts.length, high: highRisk.length });
});
