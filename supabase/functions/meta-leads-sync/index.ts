// Pulls Meta Lead Ads (Lead Gen Forms) leads for every active connection.
// For each ad account, lists lead-gen forms and fetches recent leads,
// then upserts them into meta_leads. If the access token lacks
// leads_retrieval permission the call will return an error and we just skip
// that account/form (the aggregated lead counts remain available).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let workspaceFilter: string | null = null;
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    workspaceFilter = body.workspaceId ?? null;
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let connQ = admin
    .from("meta_connections")
    .select("id, workspace_id, access_token, status, token_expires_at")
    .eq("status", "active");
  if (workspaceFilter) connQ = connQ.eq("workspace_id", workspaceFilter);
  const { data: connections, error: connErr } = await connQ;
  if (connErr) return json({ error: connErr.message }, 500);

  let totalLeads = 0;
  const errors: any[] = [];

  for (const conn of connections ?? []) {
    if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) continue;

    const { data: accounts } = await admin
      .from("meta_ad_accounts")
      .select("id, act_id, workspace_id, client_id")
      .eq("connection_id", conn.id)
      .eq("is_active", true);

    for (const acc of accounts ?? []) {
      try {
        // Lead-gen forms live on Pages, not ad accounts. We discover the
        // forms used by this ad account by listing its lead-gen ads, then
        // fetch leads from each unique form id.
        // Filter to ads with objective LEAD_GENERATION when possible; fall
        // back to all ads (cheap, the form list is what matters).
        const since = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);

        const adsUrl =
          `https://graph.facebook.com/v21.0/${acc.act_id}/ads` +
          `?fields=id,name,adset_id,campaign_id,campaign{name},adset{name},leadgen_form{id,name}` +
          `&limit=500&access_token=${encodeURIComponent(conn.access_token)}`;

        const adsRes = await fetch(adsUrl);
        const adsJson = await adsRes.json();
        if (!adsRes.ok) {
          errors.push({ act_id: acc.act_id, scope: "ads", error: adsJson });
          continue;
        }

        // Build form_id -> { name, ads: [{id,name,adset,campaign}] }
        const formMap = new Map<string, {
          name: string | null;
          ads: { id: string; name: string | null; adset_id: string | null; adset_name: string | null; campaign_id: string | null; campaign_name: string | null }[];
        }>();

        for (const ad of (adsJson.data ?? []) as any[]) {
          const f = ad.leadgen_form;
          if (!f?.id) continue;
          if (!formMap.has(f.id)) formMap.set(f.id, { name: f.name ?? null, ads: [] });
          formMap.get(f.id)!.ads.push({
            id: ad.id,
            name: ad.name ?? null,
            adset_id: ad.adset_id ?? null,
            adset_name: ad.adset?.name ?? null,
            campaign_id: ad.campaign_id ?? null,
            campaign_name: ad.campaign?.name ?? null,
          });
        }

        for (const [formId, info] of formMap.entries()) {
          const url =
            `https://graph.facebook.com/v21.0/${formId}/leads` +
            `?fields=id,created_time,field_data,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,form_id` +
            `&filtering=[{"field":"time_created","operator":"GREATER_THAN","value":${since}}]` +
            `&limit=200&access_token=${encodeURIComponent(conn.access_token)}`;

          const leadsRes = await fetch(url);
          const leadsJson = await leadsRes.json();
          if (!leadsRes.ok) {
            errors.push({ form: formId, act_id: acc.act_id, error: leadsJson });
            continue;
          }
          const leads = leadsJson.data ?? [];
          if (!leads.length) continue;

          const adById = new Map(info.ads.map((a) => [a.id, a]));

          const rows = leads.map((l: any) => {
            const fd = (l.field_data ?? []) as { name: string; values: string[] }[];
            const find = (keys: string[]) => {
              const item = fd.find((f) =>
                keys.some((k) => f.name?.toLowerCase().includes(k))
              );
              return item?.values?.[0] ?? null;
            };
            const adRef = l.ad_id ? adById.get(l.ad_id) : undefined;
            return {
              workspace_id: acc.workspace_id,
              ad_account_id: acc.id,
              client_id: acc.client_id,
              lead_id: l.id,
              form_id: l.form_id ?? formId,
              form_name: info.name,
              campaign_id: l.campaign_id ?? adRef?.campaign_id ?? null,
              campaign_name: l.campaign_name ?? adRef?.campaign_name ?? null,
              adset_id: l.adset_id ?? adRef?.adset_id ?? null,
              adset_name: l.adset_name ?? adRef?.adset_name ?? null,
              ad_id: l.ad_id ?? null,
              ad_name: l.ad_name ?? adRef?.name ?? null,
              created_time: l.created_time ?? null,
              full_name: find(["full_name", "name"]),
              email: find(["email"]),
              phone: find(["phone"]),
              field_data: fd,
              raw: l,
            };
          });

          const { error: upErr } = await admin
            .from("meta_leads")
            .upsert(rows, { onConflict: "ad_account_id,lead_id" });
          if (upErr) {
            errors.push({ form: formId, error: upErr.message });
          } else {
            totalLeads += rows.length;
          }
        }
      } catch (e) {
        errors.push({ act_id: acc.act_id, error: String(e) });
      }
    }
  }

  return json({ ok: true, leadsSynced: totalLeads, errors });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
