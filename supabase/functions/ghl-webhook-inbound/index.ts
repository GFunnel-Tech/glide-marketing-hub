// Inbound webhook receiver for GoHighLevel.
// GHL workflows POST status changes here so MetaHub can update lead stages.
//
// URL format (paste in GHL workflow):
//   https://<project>.supabase.co/functions/v1/ghl-webhook-inbound?secret=<workspace_secret>
//
// Supported event types (best-effort — GHL workflows send freeform JSON):
//   - OpportunityStatusUpdate / OpportunityStageUpdate / OpportunityUpdate
//   - ContactTagUpdate / ContactUpdate / ContactStageUpdate
//
// Lookup priority: opportunityId → contactId → email/phone.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map GHL opportunity status / contact stage strings to our lead_stage enum.
function mapStage(input: string | null | undefined): "intake" | "in_progress" | "converted" | null {
  if (!input) return null;
  const s = input.toLowerCase();
  if (/(won|converted|customer|closed[\s_-]?won|client)/.test(s)) return "converted";
  if (/(new|intake|untouched|fresh)/.test(s)) return "intake";
  if (/(open|working|contacted|qualified|nurtur|appointment|booked|in[\s_-]?progress|follow)/.test(s)) return "in_progress";
  if (/(lost|abandon|disqualified|unqualified|closed[\s_-]?lost)/.test(s)) return "intake";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });

  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? "";
  if (!secret || secret.length < 16) {
    return new Response(JSON.stringify({ error: "missing or invalid secret" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve workspace from secret
  const { data: cfg } = await supabase
    .from("integration_configs")
    .select("workspace_id")
    .eq("ghl_webhook_secret", secret)
    .maybeSingle();
  if (!cfg?.workspace_id) {
    return new Response(JSON.stringify({ error: "unknown secret" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const workspaceId = cfg.workspace_id as string;

  let body: any = {};
  try { body = await req.json(); } catch { /* tolerate empty */ }

  const eventType =
    body.type ?? body.event ?? body.eventType ?? "unknown";
  const contactId =
    body.contactId ?? body.contact_id ?? body.contact?.id ?? null;
  const opportunityId =
    body.opportunityId ?? body.opportunity_id ?? body.opportunity?.id ?? null;
  const locationId =
    body.locationId ?? body.location_id ?? body.location?.id ?? null;
  const status =
    body.status ?? body.opportunity?.status ?? body.contact?.status ?? null;
  const stageName =
    body.stageName ?? body.stage_name ?? body.pipelineStageName ??
    body.opportunity?.stageName ?? body.contact?.stageName ?? null;
  const email = body.email ?? body.contact?.email ?? null;
  const phone = body.phone ?? body.contact?.phone ?? null;

  // Locate matching meta_lead
  const leadQuery = supabase.from("meta_leads").select("id, stage").eq("workspace_id", workspaceId);
  let matched: any = null;

  if (opportunityId) {
    const { data } = await leadQuery.eq("ghl_opportunity_id", opportunityId).maybeSingle();
    matched = data;
  }
  if (!matched && contactId) {
    const { data } = await supabase.from("meta_leads")
      .select("id, stage").eq("workspace_id", workspaceId)
      .eq("ghl_contact_id", contactId).maybeSingle();
    matched = data;
  }
  if (!matched && (email || phone)) {
    let q = supabase.from("meta_leads").select("id, stage").eq("workspace_id", workspaceId);
    q = email ? q.eq("email", email) : q.eq("phone", phone);
    const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    matched = data;
  }

  const newStage = mapStage(status) ?? mapStage(stageName);
  let applied = false;
  let errorMsg: string | null = null;

  if (matched && newStage) {
    const patch: Record<string, unknown> = {
      ghl_stage: stageName ?? status ?? null,
      ghl_status_updated_at: new Date().toISOString(),
    };
    if (contactId && !matched.ghl_contact_id) patch.ghl_contact_id = contactId;
    if (opportunityId) patch.ghl_opportunity_id = opportunityId;
    if (newStage !== matched.stage) patch.stage = newStage;

    const { error } = await supabase.from("meta_leads").update(patch).eq("id", matched.id);
    if (error) errorMsg = error.message;
    else applied = true;
  } else if (!matched) {
    errorMsg = "no matching lead";
  } else {
    errorMsg = "no stage mapping";
  }

  await supabase.from("ghl_webhook_events").insert({
    workspace_id: workspaceId,
    event_type: String(eventType),
    ghl_contact_id: contactId,
    ghl_opportunity_id: opportunityId,
    location_id: locationId,
    matched_lead_id: matched?.id ?? null,
    applied,
    payload: body,
    error: errorMsg,
  });

  return new Response(
    JSON.stringify({ ok: true, applied, matched_lead_id: matched?.id ?? null, stage: newStage }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
