import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: workspaces, error: wsErr } = await supabase
    .from("workspaces").select("id");
  if (wsErr) {
    return new Response(JSON.stringify({ error: wsErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Record<string, number | string> = {};
  for (const ws of workspaces ?? []) {
    const { data: ids } = await supabase
      .from("clients").select("id").eq("workspace_id", ws.id);
    let updated = 0;
    for (const c of ids ?? []) {
      const { data: newStatus } = await supabase.rpc("compute_client_status" as any, { _client_id: c.id });
      if (!newStatus) continue;
      const { data: cur } = await supabase.from("clients").select("status").eq("id", c.id).single();
      if (cur?.status !== newStatus) {
        await supabase.from("clients").update({ status: newStatus }).eq("id", c.id);
        updated++;
      }
    }
    results[ws.id] = updated;
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
