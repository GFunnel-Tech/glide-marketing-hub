// Cron orchestrator: enumerates workspaces with a GHL key and invokes
// ghl-locations-sync for each one, passing the service-role bearer so the
// per-workspace function skips the user-membership check.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: configs } = await admin
      .from("integration_configs")
      .select("workspace_id, ghl_api_key");
    const workspaces = (configs ?? []).filter((c) => c.ghl_api_key && c.ghl_api_key.length > 10);

    const results: Array<{ workspace_id: string; ok: boolean; locations?: number; linked?: number; suggested?: number; error?: string }> = [];

    for (const c of workspaces) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/ghl-locations-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
          },
          body: JSON.stringify({ workspace_id: c.workspace_id, autoLink: true, threshold: 0.9 }),
        });
        const j = await r.json().catch(() => ({}));
        results.push({ workspace_id: c.workspace_id, ok: r.ok, ...j });
      } catch (e) {
        results.push({ workspace_id: c.workspace_id, ok: false, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, workspaces: workspaces.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
