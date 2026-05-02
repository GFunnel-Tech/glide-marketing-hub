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
        // List lead gen forms for this ad account
        const formsRes = await fetch(
          `https://graph.facebook.com/v21.0/${acc.act_id}/leadgen_forms?fields=id,name&limit=200&access_token=${encodeURIComponent(conn.access_token)}`
        );
        const formsJson = await formsRes.json();
        if (!formsRes.ok) {
          errors.push({ act_id: acc.act_id, scope: "forms", error: formsJson });
          continue;
        }
        const forms = formsJson.data ?? [];

        for (const form of forms) {
          // last 90 days
          const since = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
          const url =
            `https://graph.facebook.com/v21.0/${form.id}/leads` +
            `?fields=id,created_time,field_data,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,form_id` +
            `&filtering=[{"field":"time_created","operator":"GREATER_THAN","value":${since}}]` +
            `&limit=200&access_token=${encodeURIComponent(conn.access_token)}`;

          const leadsRes = await fetch(url);
          const leadsJson = await leadsRes.json();
          if (!leadsRes.ok) {
            errors.push({ form: form.id, error: leadsJson });
            continue;
          }
          const leads = leadsJson.data ?? [];
          if (!leads.length) continue;

          const rows = leads.map((l: any) => {
            const fd = (l.field_data ?? []) as { name: string; values: string[] }[];
            const find = (keys: string[]) => {
              const item = fd.find((f) =>
                keys.some((k) => f.name?.toLowerCase().includes(k))
              );
              return item?.values?.[0] ?? null;
            };
            return {
              workspace_id: acc.workspace_id,
              ad_account_id: acc.id,
              client_id: acc.client_id,
              lead_id: l.id,
              form_id: l.form_id ?? form.id,
              form_name: form.name ?? null,
              campaign_id: l.campaign_id ?? null,
              campaign_name: l.campaign_name ?? null,
              adset_id: l.adset_id ?? null,
              adset_name: l.adset_name ?? null,
              ad_id: l.ad_id ?? null,
              ad_name: l.ad_name ?? null,
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
            errors.push({ form: form.id, error: upErr.message });
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
