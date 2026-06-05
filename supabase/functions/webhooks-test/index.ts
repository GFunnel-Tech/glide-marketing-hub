// Sends a sample payload to a webhook endpoint, server-side (avoids browser CORS).
// Body: { endpoint_id }  -> loads the saved endpoint and fires a test event.
//   or: { url, secret?, headers? } -> fires against an ad-hoc/unsaved endpoint.
// Returns { ok, status, message } and records the result on the endpoint row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const body = await req.json().catch(() => ({} as any));
    const { endpoint_id } = body as { endpoint_id?: string };

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Identify caller (RLS-scoped client) so we never test endpoints they can't see.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ ok: false, status: 401, message: "Unauthorized" }, 401);

    let url: string | null = body.url ?? null;
    let secret: string | null = body.secret ?? null;
    let headers: Record<string, string> = body.headers ?? {};
    let workspaceId: string | null = null;

    if (endpoint_id) {
      // RLS ensures the caller is a member of the endpoint's workspace.
      const { data: ep, error } = await userClient
        .from("webhook_endpoints")
        .select("url, secret, headers, workspace_id")
        .eq("id", endpoint_id)
        .maybeSingle();
      if (error || !ep) return json({ ok: false, status: 404, message: "Endpoint not found" }, 404);
      url = (ep as any).url;
      secret = (ep as any).secret ?? null;
      headers = (ep as any).headers ?? {};
      workspaceId = (ep as any).workspace_id;
    }

    if (!url) return json({ ok: false, status: 400, message: "No URL provided" }, 400);

    const payload = {
      event: "webhook.test",
      workspace_id: workspaceId,
      timestamp: new Date().toISOString(),
      data: { message: "This is a test delivery from gFunnel.", source: "webhooks-test" },
    };

    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-Event": "webhook.test",
      ...headers,
    };
    if (secret) reqHeaders["X-Webhook-Secret"] = secret;

    let ok = false;
    let status = 0;
    let message = "";
    try {
      const resp = await fetch(url, { method: "POST", headers: reqHeaders, body: JSON.stringify(payload) });
      status = resp.status;
      ok = resp.ok;
      message = ok ? "Delivered" : `Receiver responded ${resp.status}`;
    } catch (err) {
      message = `Request failed: ${String(err)}`;
    }

    // Record the outcome against the saved endpoint (service role, bypasses RLS).
    if (endpoint_id) {
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      await admin
        .from("webhook_endpoints")
        .update({ last_status: ok ? "sent" : "error", last_error: ok ? null : message, last_fired_at: new Date().toISOString() })
        .eq("id", endpoint_id);
      if (workspaceId) {
        await admin.from("webhook_deliveries").insert({
          workspace_id: workspaceId,
          endpoint_id,
          event: "webhook.test",
          payload,
          status: ok ? "sent" : "error",
          error: ok ? null : message,
        });
      }
    }

    return json({ ok, status, message });
  } catch (err) {
    return json({ ok: false, status: 0, message: String(err) }, 500);
  }
});
