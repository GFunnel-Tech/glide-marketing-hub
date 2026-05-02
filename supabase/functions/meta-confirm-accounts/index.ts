// Activates the user-selected Meta ad accounts after the OAuth picker step.
// Marks selected accounts is_active=true, deselected ones is_active=false,
// and writes a meta_sync_log row indicating the connection is ready to sync.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "missing auth" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "invalid auth" }, 401);

    const body = await req.json();
    const connectionId: string | undefined = body?.connectionId;
    const selectedActIds: string[] | undefined = body?.selectedActIds;
    if (!connectionId || !Array.isArray(selectedActIds)) {
      return json({ error: "connectionId and selectedActIds required" }, 400);
    }

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Look up the connection and verify the caller is a workspace member
    const { data: conn, error: connErr } = await admin
      .from("meta_connections")
      .select("id,workspace_id")
      .eq("id", connectionId)
      .maybeSingle();
    if (connErr || !conn) return json({ error: "connection not found" }, 404);

    const { data: member } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", conn.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return json({ error: "not a workspace member" }, 403);

    // Pull all accounts for this connection
    const { data: allAccounts } = await admin
      .from("meta_ad_accounts")
      .select("id,act_id")
      .eq("connection_id", connectionId)
      .eq("workspace_id", conn.workspace_id);

    const selectedSet = new Set(selectedActIds);
    const toActivate = (allAccounts ?? []).filter((a) => selectedSet.has(a.act_id)).map((a) => a.id);
    const toDeactivate = (allAccounts ?? []).filter((a) => !selectedSet.has(a.act_id)).map((a) => a.id);

    if (toActivate.length) {
      await admin
        .from("meta_ad_accounts")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .in("id", toActivate);
    }
    if (toDeactivate.length) {
      await admin
        .from("meta_ad_accounts")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("id", toDeactivate);
    }

    await admin.from("meta_sync_log").insert({
      workspace_id: conn.workspace_id,
      connection_id: conn.id,
      trigger: "account_selection",
      status: "success",
      rows_synced: toActivate.length,
      finished_at: new Date().toISOString(),
    });

    return json({
      ok: true,
      activated: toActivate.length,
      deactivated: toDeactivate.length,
      syncStartsAt: new Date(Date.now() + 60_000).toISOString(),
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
