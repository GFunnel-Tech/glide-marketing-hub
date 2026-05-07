// GHL MCP proxy: forwards JSON-RPC / MCP requests to services.leadconnectorhq.com/mcp/
// using the workspace's stored PIT (integration_configs.ghl_api_key) and a locationId.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MCP_URL = "https://services.leadconnectorhq.com/mcp/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { workspaceId, locationId, mcpRequest } = body as {
      workspaceId?: string;
      locationId?: string;
      mcpRequest?: unknown;
    };

    if (!workspaceId) return json({ error: "workspaceId is required" }, 400);
    if (!locationId) return json({ error: "locationId is required" }, 400);
    if (!mcpRequest || typeof mcpRequest !== "object") {
      return json({ error: "mcpRequest (JSON-RPC payload) is required" }, 400);
    }

    // Use service role to fetch the PIT after confirming user is a workspace member
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: member } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!member) {
      // allow super_admin
      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);
      const isSuper = (roles ?? []).some((r) => r.role === "super_admin");
      if (!isSuper) return json({ error: "Not a workspace member" }, 403);
    }

    const { data: cfg, error: cfgErr } = await admin
      .from("integration_configs")
      .select("ghl_api_key")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (cfgErr) return json({ error: "Failed to load integration config", detail: cfgErr.message }, 500);
    const pit = cfg?.ghl_api_key?.trim();
    if (!pit) {
      return json({
        error: "No GHL token configured",
        hint: "Add a GHL Private Integration Token (PIT) in Settings → Integrations.",
      }, 400);
    }
    if (!pit.startsWith("pit-")) {
      return json({
        error: "Stored GHL token is not a Private Integration Token",
        hint: "The MCP endpoint requires a PIT (starts with 'pit-'). Update the token in Settings → Integrations.",
      }, 400);
    }

    const upstream = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${pit}`,
        "locationId": locationId,
        "Content-Type": "application/json",
        // MCP Streamable HTTP requires both content types in Accept
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify(mcpRequest),
    });

    const contentType = upstream.headers.get("content-type") ?? "";
    const text = await upstream.text();

    if (!upstream.ok) {
      return json({
        error: "GHL MCP request failed",
        status: upstream.status,
        contentType,
        body: text.slice(0, 4000),
      }, 502);
    }

    // SSE: parse last `data:` JSON event; otherwise return JSON as-is
    if (contentType.includes("text/event-stream")) {
      const events = text
        .split(/\n\n/)
        .map((chunk) =>
          chunk
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("")
        )
        .filter(Boolean);
      const last = events[events.length - 1];
      try {
        return json({ result: JSON.parse(last) }, 200);
      } catch {
        return json({ result: last, raw: true }, 200);
      }
    }

    try {
      return json({ result: JSON.parse(text) }, 200);
    } catch {
      return json({ result: text, raw: true }, 200);
    }
  } catch (e) {
    return json({ error: "Proxy error", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
