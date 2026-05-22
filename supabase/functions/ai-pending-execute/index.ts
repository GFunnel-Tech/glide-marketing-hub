// Approve or reject a queued AI action. Body: { actionId, decision: "approve"|"reject" }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);
    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const { actionId, decision } = await req.json().catch(() => ({}));
    if (!actionId || !["approve", "reject"].includes(decision))
      return json({ error: "actionId + decision required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: action, error: aErr } = await admin
      .from("ai_pending_actions")
      .select("*")
      .eq("id", actionId)
      .maybeSingle();
    if (aErr || !action) return json({ error: "Action not found" }, 404);
    if (action.status !== "pending") return json({ error: `Action already ${action.status}` }, 400);

    if (decision === "reject") {
      await admin
        .from("ai_pending_actions")
        .update({ status: "rejected", approved_by: userData.user.id, approved_at: new Date().toISOString() })
        .eq("id", actionId);
      return json({ ok: true, status: "rejected" });
    }

    // Approve & execute
    const { tool, args, workspaceId } = { tool: action.action_type, args: action.payload, workspaceId: action.workspace_id };
    const base = `${SUPABASE_URL}/functions/v1`;
    let url = "";
    let body: any = {};
    if (tool === "pause_ads" || tool === "resume_ads") {
      url = `${base}/meta-ad-status`;
      body = { workspaceId, adIds: args.ad_ids, status: tool === "pause_ads" ? "PAUSED" : "ACTIVE" };
    } else if (tool === "update_adset_budget") {
      url = `${base}/meta-ad-budget`;
      body = { workspaceId, adsetId: args.adset_id, percent: args.percent, dailyBudget: args.daily_budget };
    } else if (tool === "duplicate_ad") {
      url = `${base}/meta-ad-duplicate`;
      body = { workspaceId, adId: args.ad_id, newName: args.new_name_suffix, targetAdsetId: args.target_adset_id };
    } else {
      return json({ error: `Unknown action type ${tool}` }, 400);
    }

    await admin
      .from("ai_pending_actions")
      .update({ status: "approved", approved_by: userData.user.id, approved_at: new Date().toISOString() })
      .eq("id", actionId);

    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Action failed");
      await admin
        .from("ai_pending_actions")
        .update({ status: "executed", executed_at: new Date().toISOString(), result: j })
        .eq("id", actionId);
      return json({ ok: true, status: "executed", result: j });
    } catch (e: any) {
      await admin
        .from("ai_pending_actions")
        .update({ status: "failed", error_message: e.message })
        .eq("id", actionId);
      return json({ error: e.message, status: "failed" }, 400);
    }
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
