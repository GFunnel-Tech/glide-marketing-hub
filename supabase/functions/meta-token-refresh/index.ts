// Refreshes Meta long-lived user tokens before they expire.
// Scheduled daily via pg_cron. Finds active connections whose
// token_expires_at is within the next 14 days and exchanges the
// current token for a new ~60-day long-lived token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const appId = Deno.env.get("META_APP_ID")!;
  const appSecret = Deno.env.get("META_APP_SECRET")!;

  // Connections expiring within 14 days OR missing expiry (legacy rows)
  const cutoff = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: conns, error } = await admin
    .from("meta_connections")
    .select("id, workspace_id, access_token, token_expires_at, connection_type, status")
    .eq("status", "active")
    .or(`token_expires_at.is.null,token_expires_at.lte.${cutoff}`);

  if (error) {
    return json({ ok: false, error: error.message }, 500);
  }

  const results: any[] = [];
  for (const c of conns ?? []) {
    try {
      const url = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
      url.searchParams.set("grant_type", "fb_exchange_token");
      url.searchParams.set("client_id", appId);
      url.searchParams.set("client_secret", appSecret);
      url.searchParams.set("fb_exchange_token", c.access_token);
      const res = await fetch(url.toString());
      const data = await res.json();
      if (!res.ok || !data.access_token) {
        await admin.from("meta_connections").update({
          status: "error",
          last_error: data?.error?.message || "Token refresh failed",
          updated_at: new Date().toISOString(),
        }).eq("id", c.id);
        results.push({ id: c.id, ok: false, error: data?.error?.message });
        continue;
      }
      const expiresAt = data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null;
      await admin.from("meta_connections").update({
        access_token: data.access_token,
        token_expires_at: expiresAt,
        status: "active",
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", c.id);
      results.push({ id: c.id, ok: true, expiresAt });
    } catch (e) {
      results.push({ id: c.id, ok: false, error: String(e) });
    }
  }

  return json({ ok: true, checked: conns?.length ?? 0, results });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
