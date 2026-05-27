// Runs daily. For each workspace with GHL 401 lead failures in the last 24h,
// inserts a notification for every workspace owner/admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Find workspaces with 401/invalid-key errors in last 24h
  const { data: failures, error } = await supa
    .from("meta_leads")
    .select("workspace_id, last_sync_error, updated_at")
    .or("last_sync_error.ilike.%401%,last_sync_error.ilike.%Api key is invalid%")
    .gte("updated_at", since);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const counts = new Map<string, number>();
  for (const row of failures ?? []) {
    const wsId = (row as any).workspace_id as string;
    counts.set(wsId, (counts.get(wsId) ?? 0) + 1);
  }

  let inserted = 0;
  for (const [wsId, count] of counts.entries()) {
    // Skip if we already notified this workspace in the last 20h
    const { data: existing } = await supa
      .from("notifications")
      .select("id")
      .eq("workspace_id", wsId)
      .eq("type", "ghl_auth_failed")
      .gte("created_at", new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString())
      .limit(1);
    if (existing && existing.length > 0) continue;

    const { data: members } = await supa
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", wsId)
      .in("role", ["owner", "admin"]);

    const rows = (members ?? []).map((m: any) => ({
      user_id: m.user_id,
      workspace_id: wsId,
      type: "ghl_auth_failed",
      title: "GHL connection failed",
      body: `${count} lead${count === 1 ? "" : "s"} failed to sync to GHL in the last 24h due to an invalid API key. Update the key in Settings.`,
      link: "/settings/integrations",
      meta: { count, since },
    }));

    if (rows.length > 0) {
      const { error: insErr } = await supa.from("notifications").insert(rows);
      if (!insErr) inserted += rows.length;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, workspaces: counts.size, notifications: inserted }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
