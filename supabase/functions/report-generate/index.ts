// Generate a client performance report, render a PDF, store both, and (when
// recipients exist) hand it to report-deliver for emailing.
// Body: { clientId, periodStart?, periodEnd?, requestId?, scheduleId?, recipients?, triggerType?, send? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildReportPdf } from "../_shared/reportPdf.ts";


const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const clientId = Number(body.clientId);
    if (!Number.isFinite(clientId)) return json({ error: "clientId required" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const end = body.periodEnd ? new Date(body.periodEnd) : new Date();
    const start = body.periodStart
      ? new Date(body.periodStart)
      : new Date(end.getFullYear(), end.getMonth(), 1);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    const { data: client } = await supabase
      .from("clients")
      .select("id,name,brand,workspace_id,currency_code,website,bio")
      .eq("id", clientId)
      .maybeSingle();
    if (!client) return json({ error: "client not found" }, 404);

    // Ad accounts for this client
    const { data: accts } = await supabase
      .from("meta_ad_accounts")
      .select("id")
      .eq("client_id", clientId);
    const acctIds = (accts ?? []).map((a: any) => a.id);

    let insights: any[] = [];
    if (acctIds.length) {
      const { data } = await supabase
        .from("meta_insights_daily")
        .select("date,spend,leads,clicks,impressions,frequency")
        .in("ad_account_id", acctIds)
        .gte("date", startStr)
        .lte("date", endStr);
      insights = data ?? [];
    }

    const totals = insights.reduce(
      (a, r) => {
        a.spend += Number(r.spend || 0);
        a.leads += Number(r.leads || 0);
        a.clicks += Number(r.clicks || 0);
        a.impressions += Number(r.impressions || 0);
        return a;
      },
      { spend: 0, leads: 0, clicks: 0, impressions: 0 },
    );
    const cpl = totals.leads > 0 ? totals.spend / totals.leads : 0;
    const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const cvr = totals.clicks > 0 ? (totals.leads / totals.clicks) * 100 : 0;

    // Daily series for chart — one row per calendar day across all ad accounts.
    const byDate = new Map<string, { date: string; spend: number; leads: number }>();
    for (const r of insights) {
      const key = String(r.date);
      const acc = byDate.get(key) ?? { date: key, spend: 0, leads: 0 };
      acc.spend += Number(r.spend || 0);
      acc.leads += Number(r.leads || 0);
      byDate.set(key, acc);
    }
    const daily = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

    // ---- Previous period comparison -----------------------------------------
    const spanMs = Math.max(1, end.getTime() - start.getTime());
    const prevEnd = new Date(start.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - spanMs);
    let previous: { spend: number; leads: number; cpl: number } | null = null;
    if (acctIds.length) {
      const { data: prevRows } = await supabase
        .from("meta_insights_daily")
        .select("spend,leads")
        .in("ad_account_id", acctIds)
        .gte("date", prevStart.toISOString().slice(0, 10))
        .lte("date", prevEnd.toISOString().slice(0, 10));
      const p = (prevRows ?? []).reduce(
        (a: any, r: any) => ({ spend: a.spend + Number(r.spend || 0), leads: a.leads + Number(r.leads || 0) }),
        { spend: 0, leads: 0 },
      );
      previous = { ...p, cpl: p.leads > 0 ? p.spend / p.leads : 0 };
    }

    // ---- Campaign breakdown --------------------------------------------------
    let campaigns: any[] = [];
    if (acctIds.length) {
      const { data: gran } = await supabase
        .from("meta_insights_granular_daily")
        .select("object_id,object_name,spend,leads,clicks,impressions")
        .eq("level", "campaign")
        .in("ad_account_id", acctIds)
        .gte("date", startStr)
        .lte("date", endStr);
      const byCamp = new Map<string, any>();
      for (const r of gran ?? []) {
        const key = String(r.object_id);
        const acc = byCamp.get(key) ?? { name: r.object_name || "Unnamed campaign", spend: 0, leads: 0, clicks: 0, impressions: 0 };
        acc.spend += Number(r.spend || 0);
        acc.leads += Number(r.leads || 0);
        acc.clicks += Number(r.clicks || 0);
        acc.impressions += Number(r.impressions || 0);
        byCamp.set(key, acc);
      }
      campaigns = Array.from(byCamp.values()).sort((a, b) => b.spend - a.spend).slice(0, 15);
    }

    // ---- Leads (detail + breakdowns) -----------------------------------------
    const { data: leadRows } = await supabase
      .from("meta_leads")
      .select("full_name,email,phone,campaign_name,form_name,created_time,field_data,ghl_check_status")
      .eq("client_id", clientId)
      .gte("created_time", `${startStr}T00:00:00Z`)
      .lte("created_time", `${endStr}T23:59:59Z`)
      .order("created_time", { ascending: false })
      .limit(500);

    const STATE_KEYS = /(^|_|\s)(state|province|region|city|location)(\b|_|$)/i;
    const CONTACT_KEYS = /(full_?name|first_?name|last_?name|email|phone|inbox_url|zip|postal)/i;
    const stateOf = (fd: any): string | null => {
      if (!Array.isArray(fd)) return null;
      const hit = fd.find((f: any) => STATE_KEYS.test(String(f?.name ?? "")));
      const v = hit?.values?.[0];
      return v ? String(v).slice(0, 24) : null;
    };
    const leadsAll = (leadRows ?? []).map((l: any) => ({
      name: l.full_name || "—",
      email: l.email,
      phone: l.phone,
      campaign: l.campaign_name,
      form: l.form_name,
      state: stateOf(l.field_data),
      date: l.created_time,
      fields: Array.isArray(l.field_data) ? l.field_data : [],
      stage:
        l.ghl_check_status === "created" ? "Sent to CRM"
        : l.ghl_check_status === "found" ? "In CRM"
        : "New",
    }));
    const tally = (key: (l: any) => string | null | undefined) => {
      const m = new Map<string, number>();
      for (const l of leadsAll) {
        const k = (key(l) || "").trim();
        if (!k) continue;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return Array.from(m.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);
    };

    // Most-answered qualifying question (everything that isn't contact info),
    // so forms without a state field still get a meaningful breakdown.
    const qCounts = new Map<string, number>();
    for (const l of leadsAll) {
      for (const f of l.fields) {
        const n = String(f?.name ?? "");
        if (!n || CONTACT_KEYS.test(n) || STATE_KEYS.test(n)) continue;
        qCounts.set(n, (qCounts.get(n) ?? 0) + 1);
      }
    }
    const topQuestion = Array.from(qCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const humanize = (s: string) =>
      s.replace(/_/g, " ").replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());
    const byQualifier = topQuestion
      ? {
          question: humanize(topQuestion).slice(0, 60),
          rows: tally((l) => {
            const hit = l.fields.find((f: any) => String(f?.name ?? "") === topQuestion);
            return hit?.values?.[0] ? String(hit.values[0]).slice(0, 40) : null;
          }),
        }
      : null;

    const leadStats = leadsAll.length
      ? {
          total: leadsAll.length,
          byState: tally((l) => l.state),
          byCampaign: tally((l) => l.campaign),
          byForm: tally((l) => l.form),
          byQualifier,
        }
      : null;


    // ---- CRM notes + appointments -------------------------------------------
    const { data: noteRows } = await supabase
      .from("ghl_contact_notes")
      .select("body,date_added,contact_id")
      .eq("client_id", clientId)
      .gte("date_added", `${startStr}T00:00:00Z`)
      .lte("date_added", `${endStr}T23:59:59Z`)
      .order("date_added", { ascending: false })
      .limit(10);
    const noteContactIds = Array.from(new Set((noteRows ?? []).map((n: any) => n.contact_id).filter(Boolean)));
    const contactNames = new Map<string, string>();
    if (noteContactIds.length) {
      const { data: cts } = await supabase
        .from("ghl_contacts")
        .select("id,full_name,email")
        .in("id", noteContactIds as string[]);
      for (const c of cts ?? []) contactNames.set(c.id, c.full_name || c.email || "Contact");
    }
    const notes = (noteRows ?? []).map((n: any) => ({
      contact: contactNames.get(n.contact_id) || "Contact",
      body: String(n.body || "").slice(0, 500),
      date: n.date_added,
    }));

    const { data: apptRows } = await supabase
      .from("ghl_appointments")
      .select("title,start_time,status,contact_id")
      .eq("client_id", clientId)
      .gte("start_time", `${startStr}T00:00:00Z`)
      .lte("start_time", `${endStr}T23:59:59Z`)
      .order("start_time", { ascending: false })
      .limit(25);
    const apptContactIds = Array.from(new Set((apptRows ?? []).map((a: any) => a.contact_id).filter(Boolean)));
    if (apptContactIds.length) {
      const { data: cts } = await supabase
        .from("ghl_contacts")
        .select("id,full_name,email")
        .in("id", apptContactIds as string[]);
      for (const c of cts ?? []) contactNames.set(c.id, c.full_name || c.email || "Contact");
    }
    const appointments = (apptRows ?? []).map((a: any) => ({
      title: a.title || "Appointment",
      contact: contactNames.get(a.contact_id) || "Contact",
      date: a.start_time,
      status: a.status || null,
    }));

    // ---- Optimization / audit log -------------------------------------------
    const { data: actionRows } = await supabase
      .from("ad_action_log")
      .select("action,status,error_message,meta,created_at")
      .eq("client_id", clientId)
      .gte("created_at", `${startStr}T00:00:00Z`)
      .lte("created_at", `${endStr}T23:59:59Z`)
      .order("created_at", { ascending: false })
      .limit(25);
    const activity = (actionRows ?? []).map((a: any) => {
      const m = a.meta ?? {};
      const detail =
        m.name || m.object_name || m.campaign_name ||
        (m.budget ? `Budget -> ${m.budget}` : "") ||
        a.error_message || "—";
      return {
        action: String(a.action || "").replace(/_/g, " "),
        status: a.status === "success" ? "Applied" : a.status || "—",
        detail: String(detail).slice(0, 120),
        date: a.created_at,
      };
    });

    const shareToken =
      crypto.randomUUID().replace(/-/g, "") + Math.random().toString(36).slice(2, 8);

    const payload = {
      client: {
        id: client.id, name: client.name, brand: client.brand,
        currency: client.currency_code || "USD", website: client.website ?? null,
      },
      period: { start: startStr, end: endStr },
      totals: { ...totals, cpl, cpm, ctr, cvr },
      previous,
      daily,
      campaigns,
      leads: leadsAll.slice(0, 60),
      leadStats,
      notes,
      appointments,
      activity,
      generated_at: new Date().toISOString(),
    };

    const deltaTxt =
      previous && previous.leads > 0
        ? ` That is ${totals.leads >= previous.leads ? "up" : "down"} ${Math.abs(((totals.leads - previous.leads) / previous.leads) * 100).toFixed(0)}% in lead volume versus the prior period.`
        : "";
    const topState = leadStats?.byState?.[0];
    const commentary =
      totals.leads > 0
        ? `Between ${startStr} and ${endStr} we invested ${payload.client.currency} ${totals.spend.toFixed(2)} and delivered ${totals.leads} leads at an average cost per lead of ${payload.client.currency} ${cpl.toFixed(2)}.${deltaTxt}${topState ? ` The strongest region was ${topState.label} with ${topState.count} leads.` : ""}${activity.length ? ` ${activity.length} optimization actions were applied to the account during this period.` : ""}`
        : `No lead activity was recorded between ${startStr} and ${endStr}. Spend for the period was ${payload.client.currency} ${totals.spend.toFixed(2)}.`;


    const { data: rep, error: repErr } = await supabase
      .from("client_reports")
      .insert({
        workspace_id: client.workspace_id,
        client_id: clientId,
        schedule_id: body.scheduleId ?? null,
        period_start: startStr,
        period_end: endStr,
        status: "ready",
        payload,
        commentary,
        share_token: shareToken,
        recipients: body.recipients ?? [],
        generated_at: new Date().toISOString(),
        trigger_type: body.triggerType || (body.scheduleId ? "scheduled" : "manual"),
      })
      .select()
      .single();
    if (repErr) return json({ error: repErr.message }, 500);

    // ---- PDF render + upload -------------------------------------------------
    let pdfUrl: string | null = null;
    try {
      const bytes = await buildReportPdf(payload as any, commentary);
      const path = `${client.workspace_id}/${clientId}/${startStr}_${endStr}_${rep.id}.pdf`;
      const up = await supabase.storage
        .from("client-reports")
        .upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (up.error) throw up.error;
      const { data: signed } = await supabase.storage
        .from("client-reports")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      pdfUrl = signed?.signedUrl ?? null;
      await supabase.from("client_reports").update({ pdf_url: pdfUrl }).eq("id", rep.id);
    } catch (e) {
      console.error("pdf render failed", e);
      await supabase
        .from("client_reports")
        .update({ error_message: `PDF render failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500) })
        .eq("id", rep.id);
    }

    if (body.requestId) {
      await supabase
        .from("report_requests")
        .update({ status: "ready", file_url: pdfUrl || `/r/${shareToken}` })
        .eq("id", body.requestId);
    }

    // ---- Delivery ------------------------------------------------------------
    const recipients: string[] = Array.isArray(body.recipients) ? body.recipients.filter(Boolean) : [];
    let delivery: unknown = null;
    if (recipients.length && body.send !== false) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/report-deliver`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ reportId: rep.id }),
        });
        delivery = await r.json().catch(() => null);
      } catch (e) {
        delivery = { ok: false, error: String(e) };
      }
    }

    return json({ ok: true, reportId: rep.id, shareToken, url: `/r/${shareToken}`, pdfUrl, delivery });

  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
