// Deterministic account-audit computations. Everything the narrative layer
// asserts must come from here — the model writes prose, it never invents numbers.

export type Severity = "critical" | "high" | "medium" | "low";

export interface AuditInputs {
  client: any;
  location: any | null;
  insights: any[];               // meta_insights_daily rows in window
  campaignRows: any[];           // meta_insights_granular_daily level=campaign
  leads: any[];                  // meta_leads in window
  scores: any[];                 // lead_scores
  contacts: any[];               // ghl_contacts
  notes: any[];                  // ghl_contact_notes
  appointments: any[];           // ghl_appointments
  opportunities: any[];          // ghl_opportunities
  actions: any[];                // ad_action_log
  windowStart: string;
  windowEnd: string;
}

const n = (v: unknown) => Number(v || 0);
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

function tally(values: (string | null | undefined)[]) {
  const m = new Map<string, number>();
  for (const raw of values) {
    const k = (raw ?? "").toString().trim() || "Unknown";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

function median(nums: number[]) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** meta_leads.field_data is a list of {name,values} — flatten to question -> answer. */
export function leadAnswers(lead: any): Record<string, string> {
  const out: Record<string, string> = {};
  const fd = lead?.field_data;
  const arr = Array.isArray(fd) ? fd : Array.isArray(fd?.field_data) ? fd.field_data : [];
  for (const f of arr) {
    const key = String(f?.name ?? f?.key ?? "").trim();
    const val = Array.isArray(f?.values) ? f.values.join(", ") : String(f?.value ?? "");
    if (key) out[key] = val;
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_");

export function computeAudit(input: AuditInputs) {
  const {
    client, location, insights, campaignRows, leads, scores,
    contacts, notes, appointments, opportunities, actions, windowStart, windowEnd,
  } = input;

  // ------------------------------------------------------------ paid media --
  const totals = insights.reduce(
    (a, r) => {
      a.spend += n(r.spend); a.leads += n(r.leads);
      a.clicks += n(r.clicks); a.impressions += n(r.impressions);
      a.freqN += n(r.frequency) ? 1 : 0; a.freqSum += n(r.frequency);
      return a;
    },
    { spend: 0, leads: 0, clicks: 0, impressions: 0, freqN: 0, freqSum: 0 },
  );
  const paid = {
    spend: totals.spend,
    reportedLeads: totals.leads,
    clicks: totals.clicks,
    impressions: totals.impressions,
    cpl: totals.leads ? totals.spend / totals.leads : 0,
    cpm: totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0,
    ctr: pct(totals.clicks, totals.impressions),
    cvr: pct(totals.leads, totals.clicks),
    frequency: totals.freqN ? totals.freqSum / totals.freqN : 0,
    activeDays: new Set(insights.map((r) => String(r.date))).size,
  };

  // Campaign rollup + Special Ad Category naming heuristics.
  const byCamp = new Map<string, any>();
  for (const r of campaignRows) {
    const k = String(r.object_id);
    const acc = byCamp.get(k) ?? {
      id: k, name: r.object_name || "Unnamed campaign",
      spend: 0, leads: 0, clicks: 0, impressions: 0,
    };
    acc.spend += n(r.spend); acc.leads += n(r.leads);
    acc.clicks += n(r.clicks); acc.impressions += n(r.impressions);
    byCamp.set(k, acc);
  }
  const leadsByCampaignName = tally(leads.map((l) => l.campaign_name));
  const campaigns = [...byCamp.values()]
    .map((c) => {
      const nm = String(c.name);
      const nonSac = /\bnon[\s_-]?sac\b|\bnsc\b/i.test(nm);
      const sac = !nonSac && /\bsac\b|special ad|housing|credit|financial/i.test(nm);
      return {
        ...c,
        cpl: c.leads ? c.spend / c.leads : 0,
        ctr: pct(c.clicks, c.impressions),
        cpm: c.impressions ? (c.spend / c.impressions) * 1000 : 0,
        sac: nonSac ? "no" : sac ? "yes" : "not declared",
        formLeads: leadsByCampaignName.find((x) => x.label === nm)?.count ?? 0,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const nonSacCampaigns = campaigns.filter((c) => c.sac === "no");
  const nonSacLeads = nonSacCampaigns.reduce((a, c) => a + c.formLeads, 0);

  const adConcentration = tally(leads.map((l) => l.ad_name)).slice(0, 10);
  const distinctAds = new Set(leads.map((l) => l.ad_name).filter(Boolean)).size;

  // ---------------------------------------------------------- lead quality --
  const totalLeads = leads.length;
  const answerSets = leads.map((l) => leadAnswers(l));
  const questionCounts = new Map<string, Map<string, number>>();
  for (const set of answerSets) {
    for (const [q, a] of Object.entries(set)) {
      if (/^(full_name|email|phone_number|first_name|last_name|city|state|zip)/i.test(norm(q))) continue;
      const m = questionCounts.get(q) ?? new Map<string, number>();
      const key = (a || "—").slice(0, 60);
      m.set(key, (m.get(key) ?? 0) + 1);
      questionCounts.set(q, m);
    }
  }
  const formQuestions = [...questionCounts.entries()]
    .map(([question, m]) => ({
      question,
      answered: [...m.values()].reduce((a, b) => a + b, 0),
      rows: [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    }))
    .sort((a, b) => b.answered - a.answered)
    .slice(0, 8);

  // Duplicate detection on email/phone.
  const seen = new Map<string, number>();
  let duplicateLeads = 0;
  for (const l of leads) {
    const key = String(l.email || l.phone || "").toLowerCase().trim();
    if (!key) continue;
    const c = (seen.get(key) ?? 0) + 1;
    seen.set(key, c);
    if (c > 1) duplicateLeads++;
  }
  const dedupedLeads = Math.max(0, totalLeads - duplicateLeads);

  const junkNames = leads.filter((l) => {
    const nm = String(l.full_name || "").trim();
    return !nm || nm.split(/\s+/).length < 2 || /\d{3}/.test(nm);
  }).length;
  const missingEmail = leads.filter((l) => !l.email).length;
  const missingPhone = leads.filter((l) => !l.phone).length;

  const leadQuality = {
    total: totalLeads,
    deduped: dedupedLeads,
    duplicates: duplicateLeads,
    duplicateRate: pct(duplicateLeads, totalLeads),
    trueCpl: dedupedLeads ? paid.spend / dedupedLeads : 0,
    missingEmail,
    missingPhone,
    junkNames,
    byForm: tally(leads.map((l) => l.form_name)).slice(0, 8),
    byCampaign: leadsByCampaignName.slice(0, 8),
    byMonth: tally(leads.map((l) => String(l.created_time ?? "").slice(0, 7))).sort((a, b) => a.label.localeCompare(b.label)),
    formQuestions,
    unqualifiedFormLeads: leads.filter((l) => Object.keys(leadAnswers(l)).length <= 1).length,
  };

  // Lead scoring health
  const gradeTally = tally(scores.map((s) => s.grade));
  const scoring = {
    scored: scores.length,
    unscored: Math.max(0, totalLeads - scores.length),
    grades: gradeTally,
    avgScore: scores.length ? scores.reduce((a, s) => a + n(s.score), 0) / scores.length : 0,
    allSameGrade: gradeTally.length === 1 && scores.length > 3,
    zeroQualifyingSignal:
      scores.length > 0 &&
      scores.every((s) => {
        const b = s.breakdown ?? {};
        const q = b.qualifying_answers ?? b.qualifyingAnswers ?? b.qualifying ?? null;
        return q === 0 || q === null;
      }),
  };

  // ---------------------------------------------------------------- sync ----
  const syncBuckets = tally(leads.map((l) => l.sync_status));
  const errorTally = tally(
    leads.filter((l) => l.last_sync_error).map((l) => String(l.last_sync_error).slice(0, 120)),
  ).slice(0, 6);
  const linked = leads.filter((l) => l.ghl_contact_id).length;
  const sync = {
    linkedToGhl: linked,
    notLinked: totalLeads - linked,
    linkRate: pct(linked, totalLeads),
    statuses: syncBuckets,
    topErrors: errorTally,
    hasLocation: !!client?.ghl_location_id,
    tokenType: location?.location_api_key ? "Location PIT" : location?.id ? "Agency key" : "None",
    lastContactSyncAt: contacts.length
      ? contacts.map((c) => c.synced_at).filter(Boolean).sort().slice(-1)[0] ?? null
      : null,
  };

  // Delivery gaps: consecutive lead arrivals more than 48h apart while spending.
  const times = leads
    .map((l) => new Date(l.created_time ?? l.created_at).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  const gaps: { from: string; to: string; hours: number }[] = [];
  for (let i = 1; i < times.length; i++) {
    const h = (times[i] - times[i - 1]) / 3_600_000;
    if (h >= 48) {
      gaps.push({
        from: new Date(times[i - 1]).toISOString(),
        to: new Date(times[i]).toISOString(),
        hours: Math.round(h),
      });
    }
  }

  // -------------------------------------------------------------- crm ops ---
  const notesByContact = new Map<string, any[]>();
  for (const nt of notes) {
    const k = String(nt.contact_id ?? "");
    if (!k) continue;
    notesByContact.set(k, [...(notesByContact.get(k) ?? []), nt]);
  }
  const firstTouchHours: number[] = [];
  let within1h = 0, within24h = 0, after72h = 0;
  for (const c of contacts) {
    const created = new Date(c.date_added ?? c.created_at).getTime();
    const cn = notesByContact.get(String(c.contact_id)) ?? [];
    if (!cn.length || !Number.isFinite(created)) continue;
    const first = Math.min(...cn.map((x) => new Date(x.date_added ?? x.created_at).getTime()).filter(Number.isFinite));
    if (!Number.isFinite(first)) continue;
    const h = (first - created) / 3_600_000;
    if (h < 0) continue;
    firstTouchHours.push(h);
    if (h <= 1) within1h++;
    if (h <= 24) within24h++;
    if (h > 72) after72h++;
  }
  const contactsWithNotes = [...notesByContact.keys()].length;

  const stageTally = tally(opportunities.map((o) => o.stage_name));
  const openOpps = opportunities.filter((o) => String(o.status ?? "").toLowerCase() === "open").length;
  const wonOpps = opportunities.filter((o) => /won/i.test(String(o.status ?? "") + String(o.stage_name ?? ""))).length;
  const lostOpps = opportunities.filter((o) => /lost/i.test(String(o.status ?? "") + String(o.stage_name ?? ""))).length;

  const now = Date.now();
  const apptStatus = tally(appointments.map((a) => a.status));
  const withOutcome = appointments.filter((a) => a.outcome || /showed|no.?show|cancel/i.test(String(a.status ?? ""))).length;
  const upcoming = appointments.filter((a) => new Date(a.start_time).getTime() > now).length;
  const noShows = appointments.filter((a) => /no.?show/i.test(String(a.status ?? "") + String(a.outcome ?? ""))).length;

  const crm = {
    contacts: contacts.length,
    contactsWithNotes,
    contactsWithoutNotes: Math.max(0, contacts.length - contactsWithNotes),
    notes: notes.length,
    medianFirstTouchHours: median(firstTouchHours),
    meanFirstTouchHours: firstTouchHours.length
      ? firstTouchHours.reduce((a, b) => a + b, 0) / firstTouchHours.length : 0,
    within1h, within24h, after72h,
    dialledContacts: firstTouchHours.length,
    opportunities: opportunities.length,
    openOpportunities: openOpps,
    wonOpportunities: wonOpps,
    lostOpportunities: lostOpps,
    openValue: opportunities.reduce((a, o) => a + n(o.monetary_value), 0),
    stages: stageTally,
    appointments: appointments.length,
    appointmentsWithOutcome: withOutcome,
    outcomeCoverage: pct(withOutcome, appointments.length),
    upcomingAppointments: upcoming,
    noShows,
    appointmentStatuses: apptStatus,
    bookingRate: pct(new Set(appointments.map((a) => a.contact_id)).size, contacts.length || 1),
  };

  const optimization = {
    actions: actions.length,
    failed: actions.filter((a) => a.status && a.status !== "success").length,
    recent: actions.slice(0, 15).map((a) => ({
      action: String(a.action ?? "").replace(/_/g, " "),
      status: a.status ?? "—",
      detail: String(a.meta?.name ?? a.meta?.object_name ?? a.error_message ?? "—").slice(0, 110),
      date: a.created_at,
    })),
  };

  // -------------------------------------------------------- defect register -
  const defects: {
    id: string; title: string; severity: Severity; evidence: string; category: string;
  }[] = [];
  const push = (title: string, severity: Severity, evidence: string, category: string) =>
    defects.push({ id: `D-${String(defects.length + 1).padStart(2, "0")}`, title, severity, evidence, category });

  if (totalLeads > 0 && sync.linkRate < 50) {
    push(
      "Leads are not reaching the CRM through the platform sync",
      sync.linkRate === 0 ? "critical" : "high",
      `${sync.notLinked} of ${totalLeads} leads have no GHL contact linked (${sync.linkRate.toFixed(0)}% linked). Top error: ${sync.topErrors[0]?.label ?? "none recorded"}.`,
      "sync",
    );
  }
  if (!sync.hasLocation) {
    push("No GoHighLevel sub-account mapped to this client", "critical",
      "clients.ghl_location_id is empty, so no CRM data can be read back.", "sync");
  }
  if (gaps.length) {
    push("Lead delivery gaps detected", "critical",
      `${gaps.length} gap(s) of 48h+ between consecutive leads, longest ${Math.max(...gaps.map((g) => g.hours))}h (${gaps[0].from.slice(0, 10)} onward).`,
      "sync");
  }
  if (appointments.length > 3 && crm.outcomeCoverage < 40) {
    push("Appointment outcomes are not being dispositioned", "high",
      `${appointments.length - withOutcome} of ${appointments.length} appointments carry no outcome (${crm.outcomeCoverage.toFixed(0)}% coverage); ${wonOpps} won / ${lostOpps} lost opportunities recorded.`,
      "pipeline");
  }
  if (nonSacCampaigns.length) {
    push("Campaigns explicitly labelled Non-SAC are live", "high",
      `${nonSacCampaigns.length} campaign(s) (${nonSacCampaigns.map((c) => c.name).slice(0, 3).join(", ")}) produced ${nonSacLeads} leads without a Special Ad Category declaration.`,
      "compliance");
  }
  if (crm.dialledContacts > 3 && crm.medianFirstTouchHours > 4) {
    push("Speed to first contact is too slow", "high",
      `Median ${crm.medianFirstTouchHours.toFixed(1)}h to first CRM note; only ${within1h} of ${crm.dialledContacts} contacts touched within an hour; ${crm.contactsWithoutNotes} contacts never worked.`,
      "setter");
  }
  if (scoring.allSameGrade || scoring.zeroQualifyingSignal) {
    push("Lead scoring is not discriminating", "medium",
      `${scoring.scored} scored leads, ${scoring.unscored} unscored; grades: ${gradeTally.map((g) => `${g.label}×${g.count}`).join(", ") || "none"}${scoring.zeroQualifyingSignal ? "; qualifying-answer signal is zero on every lead" : ""}.`,
      "scoring");
  }
  if (paid.cpm > 90) {
    push("CPM is elevated", "medium",
      `CPM ${paid.cpm.toFixed(2)} with CTR ${paid.ctr.toFixed(2)}% and form CVR ${paid.cvr.toFixed(2)}% — CPL is being carried by delivery cost, not by creative or form.`,
      "paid-media");
  }
  if (distinctAds > 25) {
    push("Ad fragmentation is preventing exit from learning", "medium",
      `${distinctAds} distinct ads produced leads in the window; top 2 ads carry ${adConcentration.slice(0, 2).reduce((a, x) => a + x.count, 0)} of ${totalLeads} leads.`,
      "paid-media");
  }
  if (leadQuality.unqualifiedFormLeads > totalLeads * 0.15 && totalLeads > 10) {
    push("Forms capture no qualification data on a large share of leads", "medium",
      `${leadQuality.unqualifiedFormLeads} of ${totalLeads} leads arrived with one field or fewer answered.`,
      "form");
  }
  if (leadQuality.duplicateRate > 2 && totalLeads > 10) {
    push("Duplicate lead submissions inflate reported volume", "low",
      `${duplicateLeads} duplicates (${leadQuality.duplicateRate.toFixed(1)}%); true CPL ${leadQuality.trueCpl.toFixed(2)} vs reported ${paid.cpl.toFixed(2)}.`,
      "data-hygiene");
  }
  if (junkNames > 0) {
    push("Contact data hygiene issues in the lead file", "low",
      `${junkNames} leads with single-word or numeric names; ${missingEmail} missing email, ${missingPhone} missing phone.`,
      "data-hygiene");
  }

  return {
    meta: {
      clientId: client.id,
      clientName: client.name,
      brand: client.brand,
      contactName: client.contact_name,
      status: client.status,
      currency: client.currency_code || "USD",
      website: client.website,
      locationId: client.ghl_location_id,
      locationName: location?.name ?? null,
      bmType: client.bm_type,
      launchedAt: client.launched_at,
      autonomousOptimization: client.autonomous_optimization,
      windowStart, windowEnd,
      generatedAt: new Date().toISOString(),
    },
    paid, campaigns, adConcentration, distinctAds, nonSacLeads,
    leadQuality, scoring, sync, deliveryGaps: gaps, crm, optimization, defects,
  };
}

export type AuditData = ReturnType<typeof computeAudit>;
