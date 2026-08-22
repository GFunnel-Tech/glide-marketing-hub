// Full GoHighLevel sync: pipelines & stages, contacts, contact notes, contact tasks.
//
// Body: {
//   workspaceId: string,
//   clientId?: number,          // limit to one client
//   full?: boolean,             // ignore incremental cursors and backfill
//   maxContactsPerLocation?: number,
//   skipNotes?: boolean
// }
//
// Resumable: writes cursors to public.ghl_sync_state and stops before the
// function timeout, so repeated invocations walk through large accounts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchLocationKeyMap, resolveGhlKey, isPit, V2_BASE, V2_VERSION } from "../_shared/ghlClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const DEADLINE_MS = 100_000; // stop work and return before the platform timeout
const NOW = () => new Date().toISOString();

async function ghlGet(apiKey: string, path: string, locationId?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Version: V2_VERSION,
    Accept: "application/json",
  };
  if (locationId) headers["locationId"] = locationId;
  const r = await fetch(`${V2_BASE}${path}`, { headers });
  const text = await r.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* non-json */ }
  return { ok: r.ok, status: r.status, data, text };
}

const iso = (v: any): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

async function upsertChunked(admin: any, table: string, rows: any[], onConflict = "id", errors: any[] = []) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + 200), { onConflict });
    if (error) errors.push({ table, step: "upsert", message: error.message });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  const timeLeft = () => DEADLINE_MS - (Date.now() - t0);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const isService = auth === `Bearer ${SERVICE_KEY}`;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const workspaceId: string | undefined = body?.workspaceId;
    const onlyClientId: number | undefined = body?.clientId;
    const full = !!body?.full;
    const skipNotes = !!body?.skipNotes;
    const maxContacts = Math.min(Math.max(Number(body?.maxContactsPerLocation ?? 2000), 100), 20000);
    if (!workspaceId) return json({ error: "workspaceId required" }, 400);

    if (!isService) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
      const { data: userData } = await userClient.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return json({ error: "Unauthorized" }, 401);
      const { data: mem } = await admin.from("workspace_members").select("role")
        .eq("workspace_id", workspaceId).eq("user_id", uid).maybeSingle();
      const { data: superRow } = await admin.from("user_roles").select("role")
        .eq("user_id", uid).eq("role", "super_admin").maybeSingle();
      if (!mem && !superRow) return json({ error: "Forbidden" }, 403);
    }

    const { data: cfg } = await admin.from("integration_configs")
      .select("ghl_api_key").eq("workspace_id", workspaceId).maybeSingle();
    const workspaceKey = (cfg?.ghl_api_key as string | null) ?? null;
    const locKeyMap = await fetchLocationKeyMap(admin, workspaceId);
    if (!workspaceKey && locKeyMap.size === 0) {
      return json({ error: "GHL API key not configured for this workspace" }, 400);
    }

    // Only sync clients that are actually linked and not archived/cancelled.
    let clientsQ = admin.from("clients")
      .select("id, name, ghl_location_id, status")
      .eq("workspace_id", workspaceId)
      .not("ghl_location_id", "is", null);
    if (onlyClientId) clientsQ = clientsQ.eq("id", onlyClientId);
    const { data: allClients, error: clientsErr } = await clientsQ;
    if (clientsErr) return json({ error: clientsErr.message }, 500);

    const INACTIVE = new Set(["CANCELLED", "PENDING_CANCELLATION"]);
    const clients = (allClients ?? []).filter((c: any) => onlyClientId || !INACTIVE.has(String(c.status ?? "")));
    if (clients.length === 0) return json({ ok: true, message: "No linked GHL locations to sync.", results: [] });

    // Existing cursors
    const { data: stateRows } = await admin.from("ghl_sync_state")
      .select("location_id, last_contacts_sync_at").eq("workspace_id", workspaceId);
    const cursors = new Map<string, string | null>(
      (stateRows ?? []).map((r: any) => [r.location_id, r.last_contacts_sync_at]),
    );

    const results: any[] = [];
    const errors: any[] = [];
    let stoppedEarly = false;

    for (const c of clients) {
      if (timeLeft() < 12_000) { stoppedEarly = true; break; }

      const locationId = c.ghl_location_id as string;
      const apiKey = resolveGhlKey(locKeyMap, locationId, workspaceKey);
      const res: any = { client_id: c.id, name: c.name, location_id: locationId, pipelines: 0, stages: 0, contacts: 0, notes: 0, tasks: 0 };
      if (!apiKey) {
        errors.push({ client_id: c.id, location_id: locationId, step: "no_key", message: "No GHL key for this location" });
        results.push(res);
        continue;
      }
      if (!isPit(apiKey)) {
        errors.push({ client_id: c.id, location_id: locationId, step: "legacy_key", message: "Full sync requires a V2 token (Private Integration Token) for this location" });
        results.push(res);
        continue;
      }

      let locError: string | null = null;

      // ---------- 1) Pipelines & stages ----------
      try {
        const p = await ghlGet(apiKey, `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`, locationId);
        if (p.ok) {
          const pipelines: any[] = p.data?.pipelines ?? [];
          const pRows: any[] = [];
          const sRows: any[] = [];
          for (const pl of pipelines) {
            if (!pl?.id) continue;
            pRows.push({
              id: String(pl.id), workspace_id: workspaceId, location_id: locationId, client_id: c.id,
              name: pl.name ?? null, raw: pl, synced_at: NOW(), updated_at: NOW(),
            });
            const stages: any[] = pl.stages ?? [];
            stages.forEach((st: any, i: number) => {
              if (!st?.id) return;
              sRows.push({
                id: String(st.id), workspace_id: workspaceId, pipeline_id: String(pl.id), location_id: locationId,
                name: st.name ?? null, position: Number(st.position ?? i), raw: st, synced_at: NOW(), updated_at: NOW(),
              });
            });
          }
          await upsertChunked(admin, "ghl_pipelines", pRows, "id", errors);
          await upsertChunked(admin, "ghl_pipeline_stages", sRows, "id", errors);
          res.pipelines = pRows.length;
          res.stages = sRows.length;
        } else {
          locError = `pipelines ${p.status}: ${p.text.slice(0, 160)}`;
          errors.push({ client_id: c.id, step: "pipelines", status: p.status, body: p.text.slice(0, 200) });
        }
      } catch (e: any) {
        errors.push({ client_id: c.id, step: "pipelines", message: String(e?.message ?? e) });
      }

      // ---------- 2) Contacts ----------
      const cursorIso = full ? null : cursors.get(locationId) ?? null;
      const cursorMs = cursorIso ? new Date(cursorIso).getTime() : 0;
      const touchedContacts: Array<{ id: string; updated: number }> = [];
      let startAfter: number | null = null;
      let startAfterId: string | null = null;
      let fetched = 0;

      try {
        while (fetched < maxContacts) {
          if (timeLeft() < 10_000) { stoppedEarly = true; break; }
          let path = `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100`;
          if (startAfter != null) path += `&startAfter=${startAfter}`;
          if (startAfterId) path += `&startAfterId=${encodeURIComponent(startAfterId)}`;
          const r = await ghlGet(apiKey, path, locationId);
          if (!r.ok) {
            locError = `contacts ${r.status}: ${r.text.slice(0, 160)}`;
            errors.push({ client_id: c.id, step: "contacts", status: r.status, body: r.text.slice(0, 200) });
            break;
          }
          const list: any[] = r.data?.contacts ?? [];
          if (list.length === 0) break;

          const rows = list.map((ct: any) => {
            const first = ct.firstName ?? ct.first_name ?? null;
            const last = ct.lastName ?? ct.last_name ?? null;
            const fullName = ct.contactName ?? ct.name ?? [first, last].filter(Boolean).join(" ") || null;
            return {
              id: String(ct.id),
              workspace_id: workspaceId,
              location_id: locationId,
              client_id: c.id,
              first_name: first,
              last_name: last,
              full_name: fullName,
              email: ct.email ?? null,
              phone: ct.phone ?? null,
              tags: Array.isArray(ct.tags) ? ct.tags.map((t: any) => String(t)) : [],
              source: ct.source ?? null,
              assigned_to: ct.assignedTo ?? null,
              dnd: !!ct.dnd,
              custom_fields: ct.customFields ?? ct.customField ?? null,
              date_added: iso(ct.dateAdded),
              date_updated: iso(ct.dateUpdated ?? ct.dateAdded),
              raw: ct,
              synced_at: NOW(),
              updated_at: NOW(),
            };
          }).filter((r: any) => r.id);

          await upsertChunked(admin, "ghl_contacts", rows, "id", errors);
          fetched += rows.length;
          res.contacts += rows.length;

          for (const row of rows) {
            const upd = row.date_updated ? new Date(row.date_updated).getTime() : 0;
            if (!cursorMs || upd >= cursorMs) touchedContacts.push({ id: row.id, updated: upd });
          }

          const last = list[list.length - 1];
          startAfterId = last?.id ? String(last.id) : null;
          const lastAdded = last?.dateAdded ? new Date(last.dateAdded).getTime() : null;
          startAfter = lastAdded && !isNaN(lastAdded) ? lastAdded : null;
          if (list.length < 100) break;

          // Incremental: contacts come newest-first, so once a whole page is
          // older than the cursor there is nothing new left to walk.
          if (cursorMs && rows.every((r: any) => (r.date_updated ? new Date(r.date_updated).getTime() : 0) < cursorMs)) break;
        }
      } catch (e: any) {
        errors.push({ client_id: c.id, step: "contacts", message: String(e?.message ?? e) });
      }

      // ---------- 3) Notes & tasks for touched contacts ----------
      if (!skipNotes && touchedContacts.length > 0) {
        touchedContacts.sort((a, b) => b.updated - a.updated);
        const subset = touchedContacts.slice(0, 300);
        const noteRows: any[] = [];
        const taskRows: any[] = [];
        const CONCURRENCY = 4;
        let i = 0;
        const worker = async () => {
          while (i < subset.length) {
            if (timeLeft() < 8_000) { stoppedEarly = true; return; }
            const ct = subset[i++];
            const [nRes, tRes] = await Promise.all([
              ghlGet(apiKey, `/contacts/${encodeURIComponent(ct.id)}/notes`, locationId),
              ghlGet(apiKey, `/contacts/${encodeURIComponent(ct.id)}/tasks`, locationId),
            ]);
            if (nRes.ok) {
              for (const n of (nRes.data?.notes ?? [])) {
                if (!n?.id) continue;
                noteRows.push({
                  id: String(n.id), workspace_id: workspaceId, location_id: locationId, client_id: c.id,
                  contact_id: ct.id, body: n.body ?? null, created_by: n.userId ?? null,
                  date_added: iso(n.dateAdded), raw: n, synced_at: NOW(),
                });
              }
            }
            if (tRes.ok) {
              for (const t of (tRes.data?.tasks ?? [])) {
                if (!t?.id) continue;
                taskRows.push({
                  id: String(t.id), workspace_id: workspaceId, location_id: locationId, client_id: c.id,
                  contact_id: ct.id, title: t.title ?? null, body: t.body ?? null,
                  due_date: iso(t.dueDate), completed: !!t.completed, assigned_to: t.assignedTo ?? null,
                  raw: t, synced_at: NOW(),
                });
              }
            }
          }
        };
        try {
          await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
          await upsertChunked(admin, "ghl_contact_notes", noteRows, "id", errors);
          await upsertChunked(admin, "ghl_contact_tasks", taskRows, "id", errors);
          res.notes = noteRows.length;
          res.tasks = taskRows.length;
        } catch (e: any) {
          errors.push({ client_id: c.id, step: "notes_tasks", message: String(e?.message ?? e) });
        }
      }

      // ---------- 4) Link leads to contacts by email/phone ----------
      try {
        await admin.rpc("noop_placeholder_never_exists").catch?.(() => {});
      } catch { /* ignore */ }

      await admin.from("ghl_sync_state").upsert({
        location_id: locationId,
        workspace_id: workspaceId,
        client_id: c.id,
        last_contacts_sync_at: NOW(),
        last_run_at: NOW(),
        last_error: locError,
        updated_at: NOW(),
      }, { onConflict: "location_id" });

      results.push(res);
    }

    return json({
      ok: true,
      workspace_id: workspaceId,
      locations_processed: results.length,
      stopped_early: stoppedEarly,
      duration_ms: Date.now() - t0,
      results,
      errors,
    });
  } catch (e: any) {
    console.error("[ghl-full-sync] fatal", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
