// Portfolio-aware AI Ops chat.
// Same contract as ai-agent (Body: {messages, workspaceId, clientId?}; Returns: {reply, toolEvents}).
// Tools query the new portfolio views/RPCs and existing tables so the assistant can answer
// cross-client questions, forecast, detect anomalies, and benchmark.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { anthropicCompatMessages, getDeepseekKey } from "../_shared/deepseek.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const AI_API_KEY = getDeepseekKey();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MODEL = Deno.env.get("AI_OPS_MODEL") ?? Deno.env.get("DEEPSEEK_MODEL") ?? "deepseek-chat";

const TOOLS = [
  {
    name: "portfolio_snapshot",
    description: "Workspace-wide rollup: total clients by health (RED/YELLOW/GREEN), 30-day spend, leads, portfolio CPL, median and P90 CPL across clients.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_client_kpis",
    description:
      "Per-client KPI snapshot for ALL clients (7d/30d spend, leads, CPL with WoW % change, frequency). Use this to rank clients, find biggest spenders, biggest movers, worst CPL, etc. Returns up to 200 clients.",
    input_schema: {
      type: "object",
      properties: {
        sort_by: { type: "string", enum: ["cpl_7d", "spend_7d", "leads_7d", "cpl_wow_pct"], description: "Sort field. Defaults to spend_7d desc." },
        only_status: { type: "string", description: "Filter to clients in one status like 'RED' or 'GREEN'." },
      },
    },
  },
  {
    name: "forecast_eom",
    description: "Project a client's end-of-month spend, leads, and CPL from the last 14 days of insights, plus how that compares to active guarantees.",
    input_schema: {
      type: "object",
      properties: { client_id: { type: "number" } },
      required: ["client_id"],
    },
  },
  {
    name: "detect_anomalies",
    description: "Statistical anomalies (z-score on 14d baseline excluding the last 3d) for a client's CPL, CPM, CTR, frequency, and leads. Returns only metrics outside ±1.5σ.",
    input_schema: {
      type: "object",
      properties: { client_id: { type: "number" } },
      required: ["client_id"],
    },
  },
  {
    name: "compare_to_peers",
    description: "Compare a client to other clients in the same workspace. Returns the client's metrics alongside the workspace median, P25, and P75 for spend/leads/CPL (30d).",
    input_schema: {
      type: "object",
      properties: { client_id: { type: "number" } },
      required: ["client_id"],
    },
  },
  {
    name: "list_open_insights",
    description: "Recent open AI insights (anomalies, forecasts, recommendations) across the workspace, newest first. Use to recall what the background scan flagged.",
    input_schema: {
      type: "object",
      properties: {
        severity: { type: "string", enum: ["info", "warn", "critical"] },
        client_id: { type: "number" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "list_clients",
    description: "Lookup table of clients with id, name, brand, current status. Use to resolve a name → client_id before calling other tools.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "propose_pause_ad",
    description: "Queue a pause action for human approval. Use when an anomaly + ad-level data justifies pausing a specific ad.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "number" },
        ad_ids: { type: "array", items: { type: "string" } },
        reason: { type: "string" },
      },
      required: ["client_id", "ad_ids", "reason"],
    },
  },
];

async function runTool(
  admin: ReturnType<typeof createClient>,
  workspaceId: string,
  userId: string | null,
  tool: string,
  args: any,
): Promise<any> {
  if (tool === "portfolio_snapshot") {
    const { data, error } = await admin.from("v_portfolio_snapshot").select("*").eq("workspace_id", workspaceId).maybeSingle();
    if (error) throw new Error(error.message);
    return { result: data };
  }
  if (tool === "list_client_kpis") {
    let q = admin.from("v_client_kpi_snapshot").select("*").eq("workspace_id", workspaceId).limit(200);
    if (args.only_status) q = q.eq("status", args.only_status);
    const sortBy = args.sort_by ?? "spend_7d";
    q = q.order(sortBy, { ascending: sortBy === "cpl_7d" ? true : false, nullsFirst: false });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { result: { clients: data ?? [] } };
  }
  if (tool === "forecast_eom") {
    const { data, error } = await admin.rpc("forecast_client_eom", { _client_id: args.client_id });
    if (error) throw new Error(error.message);
    const { data: g } = await admin
      .from("client_guarantees")
      .select("id,name,criteria,deadline,status")
      .eq("workspace_id", workspaceId)
      .eq("client_id", args.client_id)
      .eq("status", "active");
    return { result: { forecast: data, guarantees: g ?? [] } };
  }
  if (tool === "detect_anomalies") {
    const { data, error } = await admin.rpc("detect_client_anomalies", { _client_id: args.client_id });
    if (error) throw new Error(error.message);
    return { result: { anomalies: data ?? [] } };
  }
  if (tool === "compare_to_peers") {
    const { data: me } = await admin.from("v_client_kpi_snapshot").select("*").eq("client_id", args.client_id).maybeSingle();
    const { data: peers } = await admin.from("v_client_kpi_snapshot").select("cpl_30d,spend_30d,leads_30d").eq("workspace_id", workspaceId);
    const vals = (peers ?? []).map((p: any) => Number(p.cpl_30d ?? 0)).filter((n) => n > 0).sort((a, b) => a - b);
    const pct = (p: number) => (vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : null);
    return {
      result: {
        client: me,
        peer_cpl_p25: pct(0.25),
        peer_cpl_median: pct(0.5),
        peer_cpl_p75: pct(0.75),
        peer_count: vals.length,
      },
    };
  }
  if (tool === "list_open_insights") {
    let q = admin
      .from("ai_insights")
      .select("id,client_id,kind,severity,title,body,metrics,created_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(args.limit ?? 25);
    if (args.severity) q = q.eq("severity", args.severity);
    if (args.client_id) q = q.eq("client_id", args.client_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { result: { insights: data ?? [] } };
  }
  if (tool === "list_clients") {
    const { data, error } = await admin
      .from("clients")
      .select("id,name,brand,status,cpl,leads,spend")
      .eq("workspace_id", workspaceId)
      .order("spend", { ascending: false });
    if (error) throw new Error(error.message);
    return { result: { clients: data ?? [] } };
  }
  if (tool === "propose_pause_ad") {
    const { data, error } = await admin
      .from("ai_pending_actions")
      .insert({
        workspace_id: workspaceId,
        client_id: args.client_id,
        proposed_by: userId,
        action_type: "pause_ads",
        payload: { ad_ids: args.ad_ids },
        reasoning: args.reason,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { queued: true, pendingActionId: data.id };
  }
  throw new Error(`Unknown tool ${tool}`);
}

const SYSTEM = `You are the AI Operations lead for a Meta-ads agency. You have read access to every client's data via tools.

Style:
- Be direct, numerical, and useful. Always cite the numbers (CPL, spend, z-score, % change) you used.
- When asked open-ended questions ("what should I focus on?"), start by calling \`portfolio_snapshot\` and \`list_open_insights\`.
- For a specific client, call \`forecast_eom\` + \`detect_anomalies\` + \`compare_to_peers\` before suggesting actions.
- Only \`propose_pause_ad\` after you've shown the user the ad-level evidence and asked or stated your reasoning clearly.
- Group findings: 🔴 Critical, 🟡 Warnings, 🟢 Healthy. Skip empty groups.
- Use short markdown tables when comparing more than 3 items.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!AI_API_KEY) return json({ error: "DEEPSEEK_API_KEY not configured" }, 500);

  try {
    const { messages, workspaceId } = await req.json();
    if (!workspaceId) return json({ error: "workspaceId required" }, 400);

    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    let userId: string | null = null;
    if (authHeader) {
      const supa = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data } = await supa.auth.getUser();
      userId = data.user?.id ?? null;
    }

    const toolEvents: any[] = [];
    let convo: any[] = messages.map((m: any) => ({ role: m.role, content: m.content }));
    let finalText = "";

    for (let step = 0; step < 12; step++) {
      const { ok, status, data } = await anthropicCompatMessages({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM,
        tools: TOOLS,
        messages: convo,
      });
      if (!ok) throw new Error(data?.error?.message ?? `DeepSeek ${status}`);

      // accumulate any text
      for (const block of data.content ?? []) {
        if (block.type === "text") finalText += block.text;
      }

      if (data.stop_reason !== "tool_use") break;

      // execute tool uses
      const assistantBlocks = data.content;
      convo.push({ role: "assistant", content: assistantBlocks });

      const toolResults: any[] = [];
      for (const block of assistantBlocks) {
        if (block.type !== "tool_use") continue;
        try {
          const out = await runTool(admin, workspaceId, userId, block.name, block.input ?? {});
          toolEvents.push({ tool: block.name, args: block.input, status: "ok", ...out });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(out).slice(0, 8000),
          });
        } catch (e) {
          const msg = (e as Error).message;
          toolEvents.push({ tool: block.name, args: block.input, status: "error", error: msg });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: msg });
        }
      }
      convo.push({ role: "user", content: toolResults });
    }

    return json({ reply: finalText.trim() || "(no reply)", toolEvents });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
