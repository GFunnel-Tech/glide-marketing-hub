// Map a Meta ad account to a client (or unmap by passing clientId: null).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const { adAccountId, clientId } = await req.json();
    if (!adAccountId) return json({ error: "adAccountId required" }, 400);

    // Map the account. When mapping to a client, auto-activate so it's
    // eligible for lead sync. When unmapping (clientId null), deactivate.
    const willMap = clientId !== null && clientId !== undefined;
    const { error } = await supabase
      .from("meta_ad_accounts")
      .update({ client_id: willMap ? clientId : null, is_active: willMap })
      .eq("id", adAccountId);
    if (error) return json({ error: error.message }, 403);

    return json({ ok: true });
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
