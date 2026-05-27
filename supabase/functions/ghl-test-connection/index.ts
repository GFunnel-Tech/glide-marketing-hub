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

    const { testGhlKey } = await import("../_shared/ghlClient.ts");
    const result = await testGhlKey(apiKey);
    return new Response(
      JSON.stringify({ ok: result.ok, status: result.status, message: result.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, status: 0, message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
