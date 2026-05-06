// Scans Meta leads aged between 4h and 24h, checks if each one made it into
// GoHighLevel by email or phone, and creates a ClickUp task for any that didn't.
// Triggered hourly by pg_cron, or on-demand with { workspaceId } in body.
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

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let q = admin
    .from("meta_leads")
    .select("id, workspace_id, client_id, full_name, email, phone, campaign_name, form_name, created_time")
    .or("ghl_check_status.is.null,ghl_check_status.eq.pending")
    .gte("created_time", oneDayAgo)
    .lte("created_time", fourHoursAgo)
    .limit(500);
  if (workspaceFilter) q = q.eq("workspace_id", workspaceFilter);

  const { data: leads, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const stats = { checked: 0, found: 0, missing: 0, flagged: 0, errors: [] as any[] };

  // Group leads by workspace so we fetch credentials once per workspace
  const byWs = new Map<string, typeof leads>();
  for (const l of leads ?? []) {
    if (!byWs.has(l.workspace_id)) byWs.set(l.workspace_id, []);
    byWs.get(l.workspace_id)!.push(l);
  }

  for (const [wsId, wsLeads] of byWs) {
    const { data: cfg } = await admin
      .from("integration_configs")
      .select("ghl_api_key, clickup_api_token, clickup_default_list_id")
      .eq("workspace_id", wsId)
      .maybeSingle();

    if (!cfg?.ghl_api_key) {
      // Skip — no GHL configured for this workspace
      continue;
    }

    // Cache client info
    const clientIds = Array.from(new Set(wsLeads.map(l => l.client_id).filter(Boolean)));
    const { data: clientRows } = await admin
      .from("clients")
      .select("id, name, brand, ghl_location_id, clickup_list_id")
      .in("id", clientIds.length ? clientIds : [-1]);
    const clientMap = new Map((clientRows ?? []).map(c => [c.id, c]));

    for (const lead of wsLeads) {
      stats.checked++;
      try {
        const client = lead.client_id ? clientMap.get(lead.client_id) : null;
        const locationId = client?.ghl_location_id;

        const found = await searchGhlContact(cfg.ghl_api_key, locationId, lead.email, lead.phone);

        if (found) {
          await admin.from("meta_leads").update({
            ghl_check_status: "found",
            ghl_checked_at: new Date().toISOString(),
          }).eq("id", lead.id);
          stats.found++;
        } else {
          // Missing — create ClickUp task if configured
          let taskId: string | null = null;
          const listId = client?.clickup_list_id || cfg.clickup_default_list_id;
          if (cfg.clickup_api_token && listId) {
            taskId = await createClickupTask(cfg.clickup_api_token, listId, lead, client);
          }

          await admin.from("meta_leads").update({
            ghl_check_status: taskId ? "flagged" : "missing",
            ghl_checked_at: new Date().toISOString(),
            clickup_task_id: taskId,
          }).eq("id", lead.id);

          // In-app notification for workspace members
          await admin.from("notifications").insert({
            user_id: null,
            workspace_id: wsId,
            type: "info",
            title: `Lead missing from GHL${client ? ` — ${client.name}` : ""}`,
            body: `${lead.full_name || lead.email || lead.phone || "Unknown lead"} did not appear in GoHighLevel within 4 hours.`,
            link: lead.client_id ? `/client/${lead.client_id}` : "/leads",
            meta: { lead_id: lead.id, clickup_task_id: taskId },
          }).select(); // ignore failure (user_id null may violate; handled below)

          taskId ? stats.flagged++ : stats.missing++;
        }
      } catch (e) {
        stats.errors.push({ lead_id: lead.id, error: String(e) });
        await admin.from("meta_leads").update({
          ghl_check_status: "pending",
          ghl_checked_at: new Date().toISOString(),
        }).eq("id", lead.id);
      }
    }
  }

  return json({ ok: true, ...stats });
});

async function searchGhlContact(
  apiKey: string,
  locationId: string | undefined | null,
  email: string | null,
  phone: string | null,
): Promise<boolean> {
  if (!email && !phone) return false;

  // GHL v1 API — /contacts/lookup supports email & phone query
  const tryLookup = async (param: string, value: string) => {
    const url = `https://rest.gohighlevel.com/v1/contacts/lookup?${param}=${encodeURIComponent(value)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return false;
    const j = await res.json();
    const contacts = j.contacts ?? [];
    if (!locationId) return contacts.length > 0;
    return contacts.some((c: any) => c.locationId === locationId);
  };

  if (email && await tryLookup("email", email)) return true;
  if (phone && await tryLookup("phone", phone)) return true;
  return false;
}

async function createClickupTask(
  token: string,
  listId: string,
  lead: any,
  client: any,
): Promise<string | null> {
  const name = `🚨 Missing GHL lead — ${client?.name ?? "Unknown client"} — ${lead.full_name ?? lead.email ?? lead.phone ?? "Unknown"}`;
  const description = [
    `**Client:** ${client?.name ?? "—"} (${client?.brand ?? "—"})`,
    `**Lead name:** ${lead.full_name ?? "—"}`,
    `**Email:** ${lead.email ?? "—"}`,
    `**Phone:** ${lead.phone ?? "—"}`,
    `**Campaign:** ${lead.campaign_name ?? "—"}`,
    `**Form:** ${lead.form_name ?? "—"}`,
    `**Created:** ${lead.created_time ?? "—"}`,
    ``,
    `This Meta lead did not appear in GoHighLevel within 4 hours of submission.`,
  ].join("\n");

  const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ name, markdown_description: description, priority: 2 }),
  });
  if (!res.ok) {
    console.error("ClickUp error", res.status, await res.text());
    return null;
  }
  const j = await res.json();
  return j.id ?? null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
