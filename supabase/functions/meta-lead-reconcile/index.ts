// Fast 5-minute Meta → GHL reconciliation worker.
// - Picks up meta_leads where next_check_at <= now() and sync_status in ('pending','missing')
// - Searches GHL by email + phone (scoped to client's ghl_location_id)
// - If found: marks 'synced'
// - If missing: notifies once, POSTs the contact to GHL, marks 'recovered' on success
// - After 3 failed push attempts: marks 'failed', creates a ClickUp task, notifies
// Invoked every minute via pg_cron (configured separately) or on-demand POST.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { searchGhlContact, upsertGhlContact } from "../_shared/ghlClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MIN = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let workspaceFilter: string | null = null;
  let leadIdFilter: string | null = null;
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    workspaceFilter = body.workspaceId ?? null;
    leadIdFilter = body.leadId ?? null;
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let q = admin
    .from("meta_leads")
    .select("id, workspace_id, client_id, full_name, email, phone, campaign_name, campaign_id, ad_name, ad_id, adset_name, adset_id, form_name, form_id, created_time, sync_status, sync_attempts")
    .in("sync_status", ["pending", "missing"])
    .lte("next_check_at", new Date().toISOString())
    .order("next_check_at", { ascending: true })
    .limit(200);
  if (workspaceFilter) q = q.eq("workspace_id", workspaceFilter);
  if (leadIdFilter) q = q.eq("id", leadIdFilter);

  const { data: leads, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const stats = { processed: 0, synced: 0, recovered: 0, missing: 0, failed: 0, errors: [] as any[] };

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

    const clientIds = Array.from(new Set(wsLeads.map(l => l.client_id).filter(Boolean)));
    const { data: clientRows } = await admin
      .from("clients")
      .select("id, name, brand, ghl_location_id, clickup_list_id")
      .in("id", clientIds.length ? clientIds : [-1]);
    const clientMap = new Map((clientRows ?? []).map(c => [c.id, c]));
    const locKeyMap = await fetchLocationKeyMap(admin, wsId);

    if (!cfg?.ghl_api_key && locKeyMap.size === 0) {
      // No GHL set up — push out next_check_at so we don't hot-loop
      await admin.from("meta_leads")
        .update({ next_check_at: new Date(Date.now() + 60 * 60_000).toISOString(), last_sync_error: "No GHL API key configured" })
        .in("id", wsLeads.map(l => l.id));
      continue;
    }

    const { data: members } = await admin
      .from("workspace_members").select("user_id").eq("workspace_id", wsId);
    const memberIds = (members ?? []).map(m => m.user_id);

    for (const lead of wsLeads) {
      stats.processed++;
      const client = lead.client_id ? clientMap.get(lead.client_id) : null;

      try {
        // 1. Look it up in GHL
        const found = await searchGhlContact(cfg.ghl_api_key, client?.ghl_location_id, lead.email, lead.phone);

        if (found) {
          await admin.from("meta_leads").update({
            sync_status: "synced",
            ghl_check_status: "found",
            ghl_checked_at: new Date().toISOString(),
            ghl_contact_id: found.id,
            next_check_at: null,
            last_sync_error: null,
          }).eq("id", lead.id);
          // Auto-resolve any earlier "missing"/"failed" alerts for this lead — it arrived after all.
          await resolveLeadAlerts(admin, lead.id);
          stats.synced++;
          continue;
        }

        // 2. Missing — notify on first miss, then attempt push
        const isFirstMiss = lead.sync_status === "pending";
        if (isFirstMiss) {
          await notify(admin, memberIds, wsId, {
            type: "lead_sync_missing",
            title: `Lead missing from CRM${client ? ` — ${client.name}` : ""}`,
            body: `${describeLead(lead)} did not appear in GoHighLevel after 15 minutes. Attempting automatic push…`,
            link: lead.client_id ? `/client/${lead.client_id}` : "/leads",
            meta: { lead_id: lead.id, stage: "missing" },
          });
        }

        const nextAttempt = (lead.sync_attempts ?? 0) + 1;
        const pushResult = await upsertGhlContact(cfg.ghl_api_key, client?.ghl_location_id, lead);

        if (pushResult.ok) {
          await admin.from("meta_leads").update({
            sync_status: "recovered",
            ghl_check_status: "recovered",
            ghl_checked_at: new Date().toISOString(),
            ghl_contact_id: pushResult.contactId,
            sync_attempts: nextAttempt,
            recovered_at: new Date().toISOString(),
            next_check_at: null,
            last_sync_error: null,
          }).eq("id", lead.id);

          await notify(admin, memberIds, wsId, {
            type: "lead_sync_recovered",
            title: `Lead recovered ✓${client ? ` — ${client.name}` : ""}`,
            body: `${describeLead(lead)} was pushed to GoHighLevel successfully.`,
            link: lead.client_id ? `/client/${lead.client_id}` : "/leads",
            meta: { lead_id: lead.id, ghl_contact_id: pushResult.contactId, stage: "recovered" },
          });
          // Clear the earlier "missing"/"failed" alerts so the bell doesn't keep showing a stale problem.
          await resolveLeadAlerts(admin, lead.id);
          stats.recovered++;
          continue;
        }

        // 3. Push failed — retry or give up
        if (nextAttempt >= MAX_ATTEMPTS) {
          let taskId: string | null = null;
          const listId = client?.clickup_list_id || cfg.clickup_default_list_id;
          if (cfg.clickup_api_token && listId) {
            taskId = await createClickupTask(cfg.clickup_api_token, listId, lead, client, pushResult.error);
          }

          await admin.from("meta_leads").update({
            sync_status: "failed",
            ghl_check_status: taskId ? "flagged" : "missing",
            ghl_checked_at: new Date().toISOString(),
            sync_attempts: nextAttempt,
            last_sync_error: pushResult.error,
            clickup_task_id: taskId,
            next_check_at: null,
          }).eq("id", lead.id);

          await notify(admin, memberIds, wsId, {
            type: "lead_sync_failed",
            title: `Lead failed to sync ✕${client ? ` — ${client.name}` : ""}`,
            body: `${describeLead(lead)} could not be pushed to GoHighLevel after ${MAX_ATTEMPTS} attempts. ${pushResult.error || "Unknown error"}`,
            link: lead.client_id ? `/client/${lead.client_id}` : "/leads",
            meta: { lead_id: lead.id, clickup_task_id: taskId, error: pushResult.error, stage: "failed" },
          });
          stats.failed++;
        } else {
          await admin.from("meta_leads").update({
            sync_status: "missing",
            ghl_check_status: "missing",
            ghl_checked_at: new Date().toISOString(),
            sync_attempts: nextAttempt,
            last_sync_error: pushResult.error,
            next_check_at: new Date(Date.now() + RETRY_DELAY_MIN * 60_000).toISOString(),
          }).eq("id", lead.id);
          stats.missing++;
        }
      } catch (e) {
        const msg = String(e);
        stats.errors.push({ lead_id: lead.id, error: msg });
        await admin.from("meta_leads").update({
          sync_status: "missing",
          last_sync_error: msg,
          next_check_at: new Date(Date.now() + RETRY_DELAY_MIN * 60_000).toISOString(),
        }).eq("id", lead.id);
      }
    }
  }

  return json({ ok: true, ...stats });
});

function describeLead(lead: any): string {
  return lead.full_name || lead.email || lead.phone || "Unknown lead";
}

async function notify(
  admin: any,
  memberIds: string[],
  wsId: string,
  payload: { type: string; title: string; body: string; link: string; meta: Record<string, unknown> },
) {
  if (!memberIds.length) return;
  await admin.from("notifications").insert(
    memberIds.map((uid) => ({
      user_id: uid,
      workspace_id: wsId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      link: payload.link,
      meta: payload.meta,
    })),
  );
}

// Mark prior "missing"/"failed" alerts for this lead as read once it eventually shows up in GHL.
async function resolveLeadAlerts(admin: any, leadId: string) {
  await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("type", ["lead_sync_missing", "lead_sync_failed"])
    .is("read_at", null)
    .contains("meta", { lead_id: leadId });
}


async function createClickupTask(
  token: string,
  listId: string,
  lead: any,
  client: any,
  error: string | undefined,
): Promise<string | null> {
  const name = `🚨 GHL sync failed — ${client?.name ?? "Unknown"} — ${describeLead(lead)}`;
  const description = [
    `**Client:** ${client?.name ?? "—"} (${client?.brand ?? "—"})`,
    `**Lead:** ${lead.full_name ?? "—"} / ${lead.email ?? "—"} / ${lead.phone ?? "—"}`,
    `**Campaign:** ${lead.campaign_name ?? "—"}`,
    `**Form:** ${lead.form_name ?? "—"}`,
    `**Created:** ${lead.created_time ?? "—"}`,
    ``,
    `Automatic push to GoHighLevel failed after ${MAX_ATTEMPTS} attempts.`,
    error ? `\n**Last error:** ${error}` : "",
  ].join("\n");

  const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ name, markdown_description: description, priority: 1 }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  return j.id ?? null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
