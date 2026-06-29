// Scans Meta leads aged between 4h and 24h, checks if each one made it into
// GoHighLevel by email or phone, and creates a ClickUp task for any that didn't.
// Triggered hourly by pg_cron, or on-demand with { workspaceId } in body.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { searchGhlContact, fetchLocationKeyMap, resolveGhlKey } from "../_shared/ghlClient.ts";

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

  // Wait 8h before flagging (was 4h): gives slow GHL syncs / delayed Zapier-
  // style integrations time to land. Reduces false-positive "missing" alerts.
  const flagAfterMs = 8 * 60 * 60 * 1000;
  const flagBefore = new Date(Date.now() - flagAfterMs).toISOString();
  const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  // 1) Primary queue: leads aged 8h–72h not yet checked / pending.
  let q = admin
    .from("meta_leads")
    .select("id, workspace_id, client_id, full_name, email, phone, campaign_name, form_name, created_time, clickup_task_id")
    .or("ghl_check_status.is.null,ghl_check_status.eq.pending")
    .gte("created_time", threeDaysAgo)
    .lte("created_time", flagBefore)
    .limit(500);
  if (workspaceFilter) q = q.eq("workspace_id", workspaceFilter);

  const { data: leads, error } = await q;
  if (error) return json({ error: error.message }, 500);

  // 2) Recovery queue: already-flagged/missing leads from the last 7 days —
  // re-check to catch false alarms that later landed in GHL.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let recoverQ = admin
    .from("meta_leads")
    .select("id, workspace_id, client_id, full_name, email, phone, campaign_name, form_name, created_time, clickup_task_id")
    .in("ghl_check_status", ["missing", "flagged"])
    .gte("created_time", sevenDaysAgo)
    .limit(500);
  if (workspaceFilter) recoverQ = recoverQ.eq("workspace_id", workspaceFilter);
  const { data: recoverLeads } = await recoverQ;

  const stats = { checked: 0, found: 0, missing: 0, flagged: 0, recovered: 0, errors: [] as any[] };

  // Combine, tagging each with its origin so we know how to handle the result
  type Tagged = (typeof leads)[number] & { _phase: "primary" | "recover" };
  const all: Tagged[] = [
    ...(leads ?? []).map((l) => ({ ...l, _phase: "primary" as const })),
    ...(recoverLeads ?? []).map((l) => ({ ...l, _phase: "recover" as const })),
  ];

  // Group by workspace so we fetch credentials once per workspace
  const byWs = new Map<string, Tagged[]>();
  for (const l of all) {
    if (!byWs.has(l.workspace_id)) byWs.set(l.workspace_id, []);
    byWs.get(l.workspace_id)!.push(l);
  }

  for (const [wsId, wsLeads] of byWs) {
    const { data: cfg } = await admin
      .from("integration_configs")
      .select("ghl_api_key, clickup_api_token, clickup_default_list_id")
      .eq("workspace_id", wsId)
      .maybeSingle();

    if (!cfg?.ghl_api_key) continue;

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
          // Recovery: was flagged, now found → mark recovered + notify so the
          // user knows the earlier alert was a false alarm.
          if (lead._phase === "recover") {
            await admin.from("meta_leads").update({
              ghl_check_status: "found",
              ghl_checked_at: new Date().toISOString(),
              recovered_at: new Date().toISOString(),
              ghl_contact_id: found.id,
            }).eq("id", lead.id);

            const { data: members } = await admin
              .from("workspace_members").select("user_id").eq("workspace_id", wsId);
            if (members?.length) {
              await admin.from("notifications").insert(members.map(m => ({
                user_id: m.user_id,
                workspace_id: wsId,
                type: "lead_sync_recovered",
                title: `Lead found in GHL${client ? ` — ${client.name}` : ""}`,
                body: `${lead.full_name || lead.email || lead.phone || "Lead"} did appear in GoHighLevel — the earlier "missing" alert was a false alarm.`,
                link: lead.client_id ? `/client/${lead.client_id}` : "/leads",
                meta: { lead_id: lead.id, contact_id: found.id, clickup_task_id: lead.clickup_task_id },
              })));
            }

            // Auto-close ClickUp task if one was created
            if (lead.clickup_task_id && cfg.clickup_api_token) {
              await closeClickupTask(cfg.clickup_api_token, lead.clickup_task_id);
            }
            stats.recovered++;
          } else {
            await admin.from("meta_leads").update({
              ghl_check_status: "found",
              ghl_checked_at: new Date().toISOString(),
              ghl_contact_id: found.id,
            }).eq("id", lead.id);
            stats.found++;
          }
        } else if (lead._phase === "primary") {
          // CONFIRM before flagging: short 2s delay then a 2nd search to guard
          // against transient GHL API blips returning empty results.
          await new Promise((r) => setTimeout(r, 2000));
          const confirm = await searchGhlContact(cfg.ghl_api_key, locationId, lead.email, lead.phone);
          if (confirm) {
            await admin.from("meta_leads").update({
              ghl_check_status: "found",
              ghl_checked_at: new Date().toISOString(),
              ghl_contact_id: confirm.id,
            }).eq("id", lead.id);
            stats.found++;
            continue;
          }

          // Truly missing — create ClickUp task + notification
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

          const { data: members } = await admin
            .from("workspace_members").select("user_id").eq("workspace_id", wsId);
          if (members?.length) {
            await admin.from("notifications").insert(members.map(m => ({
              user_id: m.user_id,
              workspace_id: wsId,
              type: "lead_sync_missing",
              title: `Lead missing from GHL${client ? ` — ${client.name}` : ""}`,
              body: `${lead.full_name || lead.email || lead.phone || "Unknown lead"} has not appeared in GoHighLevel after 8 hours. We'll keep rechecking and auto-clear if it shows up.`,
              link: lead.client_id ? `/client/${lead.client_id}` : "/leads",
              meta: { lead_id: lead.id, clickup_task_id: taskId },
            })));
          }

          taskId ? stats.flagged++ : stats.missing++;
        }
        // recover phase + still missing: leave it as-is, will recheck next run
      } catch (e) {
        stats.errors.push({ lead_id: lead.id, error: String(e) });
        if (lead._phase === "primary") {
          await admin.from("meta_leads").update({
            ghl_check_status: "pending",
            ghl_checked_at: new Date().toISOString(),
          }).eq("id", lead.id);
        }
      }
    }
  }

  return json({ ok: true, ...stats });
});

async function closeClickupTask(token: string, taskId: string) {
  try {
    await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
      method: "PUT",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
  } catch (_) { /* best-effort */ }
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
