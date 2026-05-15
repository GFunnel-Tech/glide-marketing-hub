// Scale a Meta ad set's budget. Body: { workspaceId, adsetId, percent?: number, dailyBudget?: number, lifetimeBudget?: number }
// percent applies to the current daily_budget (or lifetime_budget). Amounts are in account currency MAJOR units (e.g. 50.00 USD).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const { workspaceId, adsetId, percent, dailyBudget, lifetimeBudget } = (await req.json().catch(() => ({}))) as any;
    if (!workspaceId || !adsetId) return json({ error: "workspaceId, adsetId required" }, 400);
    if (percent == null && dailyBudget == null && lifetimeBudget == null) return json({ error: "percent, dailyBudget, or lifetimeBudget required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = await getToken(admin, workspaceId);
    if (!token) return json({ error: "No active Meta connection" }, 400);

    const log = await admin.from("ad_action_log").insert({
      workspace_id: workspaceId, channel: "meta", action: "budget_change",
      source_object_id: adsetId, performed_by: userData.user.id, status: "pending",
      meta: { percent, dailyBudget, lifetimeBudget },
    }).select("id").single();

    try {
      // Fetch current budgets if percent
      let newDaily: number | null = dailyBudget != null ? Math.round(dailyBudget * 100) : null;
      let newLifetime: number | null = lifetimeBudget != null ? Math.round(lifetimeBudget * 100) : null;
      if (percent != null) {
        const r = await fetch(`https://graph.facebook.com/v21.0/${adsetId}?fields=daily_budget,lifetime_budget&access_token=${encodeURIComponent(token)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message || "Failed to read ad set");
        if (j.daily_budget) newDaily = Math.round(Number(j.daily_budget) * (1 + percent / 100));
        else if (j.lifetime_budget) newLifetime = Math.round(Number(j.lifetime_budget) * (1 + percent / 100));
      }

      const params = new URLSearchParams();
      if (newDaily != null) params.set("daily_budget", String(newDaily));
      if (newLifetime != null) params.set("lifetime_budget", String(newLifetime));
      params.set("access_token", token);

      const r = await fetch(`https://graph.facebook.com/v21.0/${adsetId}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Meta error");
      await admin.from("ad_action_log").update({ status: "success", result_object_id: adsetId }).eq("id", log.data!.id);
      return json({ ok: true, adsetId, newDaily, newLifetime });
    } catch (e: any) {
      await admin.from("ad_action_log").update({ status: "failed", error_message: e.message }).eq("id", log.data!.id);
      return json({ error: e.message }, 400);
    }
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});

async function getToken(admin: any, workspaceId: string): Promise<string | null> {
  const { data } = await admin.from("meta_connections")
    .select("access_token, token_expires_at").eq("workspace_id", workspaceId).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) return null;
  return data.access_token;
}
