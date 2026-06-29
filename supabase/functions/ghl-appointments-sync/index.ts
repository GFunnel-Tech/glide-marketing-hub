// Pulls upcoming/recent appointments from GHL into public.ghl_appointments so they
// surface on the /calendar view. For each linked client (clients.ghl_location_id IS NOT NULL),
// lists calendars on that location, then pages events in a 30-day-back / 90-day-forward window.
//
// Body: { workspaceId: string, daysBack?: number, daysForward?: number, clientId?: number }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type GhlEvent = {
  id: string;
  title?: string;
  appointmentStatus?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  calendarId?: string;
  locationId?: string;
  contactId?: string;
  assignedUserId?: string;
};

async function ghlGet(apiKey: string, path: string): Promise<{ ok: boolean; status: number; data: any; text: string }> {
  const r = await fetch(`https://services.leadconnectorhq.com${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: "2021-04-15",
      Accept: "application/json",
    },
  });
  const text = await r.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return { ok: r.ok, status: r.status, data, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const isService = auth === `Bearer ${SERVICE_KEY}`;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const workspaceId: string | undefined = body?.workspaceId;
    const daysBack = Math.min(Math.max(Number(body?.daysBack ?? 30), 1), 365);
    const daysForward = Math.min(Math.max(Number(body?.daysForward ?? 90), 1), 365);
    const onlyClientId: number | undefined = body?.clientId;
    if (!workspaceId) return json({ error: "workspaceId required" }, 400);

    if (!isService) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: auth } },
      });
      const { data: userData } = await userClient.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return json({ error: "Unauthorized" }, 401);
      const { data: mem } = await admin
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", uid)
        .maybeSingle();
      const { data: superRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "super_admin")
        .maybeSingle();
      if (!mem && !superRow) return json({ error: "Forbidden" }, 403);
    }

    const { data: cfg } = await admin
      .from("integration_configs")
      .select("ghl_api_key")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!cfg?.ghl_api_key) return json({ error: "GHL API key not configured for this workspace" }, 400);
    const apiKey = cfg.ghl_api_key as string;

    let clientsQ = admin
      .from("clients")
      .select("id, ghl_location_id, name")
      .eq("workspace_id", workspaceId)
      .not("ghl_location_id", "is", null);
    if (onlyClientId) clientsQ = clientsQ.eq("id", onlyClientId);
    const { data: clients, error: clientsErr } = await clientsQ;
    if (clientsErr) return json({ error: clientsErr.message }, 500);
    if (!clients || clients.length === 0) {
      return json({ ok: true, message: "No clients have a GHL location linked.", synced: 0 });
    }

    const startMs = Date.now() - daysBack * 86400_000;
    const endMs = Date.now() + daysForward * 86400_000;

    const results: any[] = [];
    let totalUpserted = 0;
    let totalEvents = 0;
    const errors: any[] = [];

    // Limit concurrency to be polite to GHL.
    const CONCURRENCY = 4;
    let idx = 0;
    async function worker() {
      while (idx < clients.length) {
        const c = clients[idx++];
        const locationId = c.ghl_location_id as string;
        try {
          // 1) List calendars for this location.
          const calRes = await ghlGet(apiKey, `/calendars/?locationId=${encodeURIComponent(locationId)}`);
          if (!calRes.ok) {
            errors.push({ client_id: c.id, location_id: locationId, step: "list_calendars", status: calRes.status, body: calRes.text.slice(0, 200) });
            results.push({ client_id: c.id, name: c.name, calendars: 0, events: 0 });
            continue;
          }
          const calendars: Array<{ id: string }> = calRes.data?.calendars ?? [];

          let eventsForClient = 0;
          const rows: any[] = [];

          for (const cal of calendars) {
            const evRes = await ghlGet(
              apiKey,
              `/calendars/events?locationId=${encodeURIComponent(locationId)}&calendarId=${encodeURIComponent(
                cal.id,
              )}&startTime=${startMs}&endTime=${endMs}`,
            );
            if (!evRes.ok) {
              errors.push({
                client_id: c.id,
                calendar_id: cal.id,
                step: "list_events",
                status: evRes.status,
                body: evRes.text.slice(0, 200),
              });
              continue;
            }
            const events: GhlEvent[] = evRes.data?.events ?? [];
            eventsForClient += events.length;
            for (const e of events) {
              if (!e.id || !e.startTime) continue;
              rows.push({
                id: e.id,
                workspace_id: workspaceId,
                client_id: c.id,
                location_id: locationId,
                calendar_id: e.calendarId ?? cal.id,
                contact_id: e.contactId ?? null,
                title: e.title ?? "Appointment",
                start_time: new Date(e.startTime).toISOString(),
                end_time: e.endTime ? new Date(e.endTime).toISOString() : null,
                status: e.appointmentStatus ?? e.status ?? null,
                assigned_to: e.assignedUserId ?? null,
                raw: e,
                synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
          }

          if (rows.length > 0) {
            // Upsert in chunks.
            for (let i = 0; i < rows.length; i += 200) {
              const slice = rows.slice(i, i + 200);
              const { error: upErr } = await admin
                .from("ghl_appointments")
                .upsert(slice, { onConflict: "id" });
              if (upErr) {
                errors.push({ client_id: c.id, step: "upsert", message: upErr.message });
              } else {
                totalUpserted += slice.length;
              }
            }
          }
          totalEvents += eventsForClient;
          results.push({
            client_id: c.id,
            name: c.name,
            calendars: calendars.length,
            events: eventsForClient,
          });
        } catch (e: any) {
          errors.push({ client_id: c.id, step: "exception", message: String(e?.message ?? e) });
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    return json({
      ok: true,
      workspace_id: workspaceId,
      clients_processed: clients.length,
      events_seen: totalEvents,
      events_upserted: totalUpserted,
      duration_ms: Date.now() - t0,
      results,
      errors,
    });
  } catch (e: any) {
    console.error("[ghl-appointments-sync] fatal", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
