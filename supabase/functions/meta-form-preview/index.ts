// Fetch the full Meta Lead Gen Form structure (questions, privacy policy,
// thank-you page) so agency staff can preview exactly what the lead saw.
// Body: { formId: string, workspaceId?: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const META_VER = "v21.0";
const FIELDS = [
  "id",
  "name",
  "status",
  "locale",
  "created_time",
  "page{id,name}",
  "questions",
  "thank_you_page",
  "privacy_policy",
  "context_card",
  "leadgen_export_csv_url",
].join(",");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const formId: string | undefined = body.formId;
    let workspaceId: string | undefined = body.workspaceId;
    if (!formId) return json({ error: "formId required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // If workspace wasn't supplied, resolve it from a stored lead using this form.
    if (!workspaceId) {
      const { data: lead } = await admin.from("meta_leads")
        .select("workspace_id").eq("form_id", formId)
        .order("created_time", { ascending: false }).limit(1).maybeSingle();
      workspaceId = lead?.workspace_id;
    }
    if (!workspaceId) return json({ error: "workspaceId required" }, 400);

    const { data: conn } = await admin.from("meta_connections")
      .select("access_token").eq("workspace_id", workspaceId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!conn) return json({ error: "No active Meta connection" }, 400);
    const token = conn.access_token;

    // Try the user/system token first (works when the connection owns the form's page).
    let r = await fetch(`https://graph.facebook.com/${META_VER}/${formId}?fields=${FIELDS}&access_token=${token}`);
    let j = await r.json();

    // If Meta rejects because a page token is required, resolve one and retry.
    if (!r.ok && j?.error) {
      const pageProbe = await fetch(`https://graph.facebook.com/${META_VER}/${formId}?fields=page{id}&access_token=${token}`);
      const pageProbeJson = await pageProbe.json();
      const pageId = pageProbeJson?.page?.id;
      if (pageId) {
        const pageTokRes = await fetch(`https://graph.facebook.com/${META_VER}/${pageId}?fields=access_token&access_token=${token}`);
        const pageTokJson = await pageTokRes.json();
        if (pageTokRes.ok && pageTokJson.access_token) {
          r = await fetch(`https://graph.facebook.com/${META_VER}/${formId}?fields=${FIELDS}&access_token=${pageTokJson.access_token}`);
          j = await r.json();
        }
      }
    }

    if (!r.ok) return json({ error: j?.error?.message || "Failed to load form" }, 400);
    return json({ form: j });
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});
