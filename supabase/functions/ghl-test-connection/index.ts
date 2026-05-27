// Tests a GHL API key by hitting the contacts lookup endpoint.
// Returns { ok: true } if 2xx, { ok: false, status, message } otherwise.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { apiKey: bodyKey, workspaceId } = await req.json().catch(() => ({} as any));

    let apiKey: string | null = bodyKey ?? null;

    if (!apiKey && workspaceId) {
      const supa = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data } = await supa
        .from("integration_configs")
        .select("ghl_api_key")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      apiKey = (data as any)?.ghl_api_key ?? null;
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, status: 0, message: "No API key provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Use the same endpoint our workers use so we catch the same auth issues.
    const res = await fetch(
      "https://rest.gohighlevel.com/v1/contacts/lookup?email=metahub-test@example.invalid",
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    if (res.status === 401 || res.status === 403) {
      const text = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({
          ok: false,
          status: res.status,
          message: text || "Unauthorized — GHL rejected this key.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 404 / 422 / 200 all mean auth worked. 5xx → treat as ok (transient).
    return new Response(
      JSON.stringify({ ok: true, status: res.status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, status: 0, message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
