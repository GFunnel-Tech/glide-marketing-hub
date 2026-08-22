// Scheduled incremental GHL sync — walks every workspace with a GHL key and
// invokes ghl-full-sync (contacts, notes, tasks, pipelines) plus appointments.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function invoke(name: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text.slice(0, 300) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({} as any));
    const withAppointments = body?.appointments !== false;

    const workspaces = new Set<string>();
    const { data: cfgs } = await admin.from("integration_configs")
      .select("workspace_id, ghl_api_key").not("ghl_api_key", "is", null);
    for (const c of cfgs ?? []) if (c.workspace_id) workspaces.add(c.workspace_id as string);
    const { data: locs } = await admin.from("ghl_locations")
      .select("workspace_id").not("location_api_key", "is", null);
    for (const l of locs ?? []) if (l.workspace_id) workspaces.add(l.workspace_id as string);

    const results: any[] = [];
    for (const ws of workspaces) {
      const sync = await invoke("ghl-full-sync", { workspaceId: ws });
      let appts: any = null;
      if (withAppointments) appts = await invoke("ghl-appointments-sync", { workspaceId: ws });
      results.push({ workspace_id: ws, sync, appointments: appts });
    }

    return json({ ok: true, workspaces: results.length, results });
  } catch (e: any) {
    console.error("[ghl-full-sync-cron] fatal", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
