// Renders a full account audit (paid media, compliance, lead quality, CRM ops,
// defect register, action plan) to a branded multi-page PDF with pdf-lib.
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import type { AuditData } from "./auditMetrics.ts";

export interface AuditNarrative {
  headline: string;
  executive_summary: string;
  findings: {
    title: string;
    detail: string;
    severity: "critical" | "high" | "medium" | "low";
    owner_role: string;
    action: string;
  }[];
  paid_media: string;
  compliance: string;
  lead_quality: string;
  crm_ops: string;
  bottom_line: string;
  action_plan: { when: string; owner_role: string; task: string }[];
}

const BRAND = rgb(0.145, 0.388, 0.921);
const BRAND_DARK = rgb(0.08, 0.22, 0.55);
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.89, 0.91, 0.94);
const SOFT = rgb(0.968, 0.975, 0.988);
const RED = rgb(0.78, 0.18, 0.22);
const AMBER = rgb(0.85, 0.55, 0.08);
const GREY = rgb(0.45, 0.48, 0.55);

const sevColor = (s: string) => (s === "critical" ? RED : s === "high" ? AMBER : s === "medium" ? BRAND : GREY);

const A4: [number, number] = [595.28, 841.89];
const W = A4[0];
const H = A4[1];
const M = 48;

const money = (v: number, cur: string) =>
  `${cur === "USD" ? "$" : cur + " "}${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const num = (v: number) => Math.round(Number(v) || 0).toLocaleString("en-US");
const pretty = (d?: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export async function buildAuditPdf(data: AuditData, story: AuditNarrative): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const san = (s: unknown) =>
    String(s ?? "")
      .replace(/[\u2192\u2794]/g, "->")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2022/g, "-")
      .replace(/\u2026/g, "...")
      .replace(/[^\x20-\xFF\n]/g, "");

  const cur = data.meta.currency;
  const title = data.meta.brand || data.meta.clientName || "Client";

  let page = pdf.addPage(A4);
  let y = H - M;
  const meta: { cover: boolean }[] = [{ cover: true }];

  const text = (s: unknown, x: number, yy: number, size = 10, f = font, color = INK, p = page) =>
    p.drawText(san(s), { x, y: yy, size, font: f, color });
  const widthOf = (s: unknown, size: number, f = font) => f.widthOfTextAtSize(san(s), size);
  const ellipsize = (s: unknown, size: number, maxW: number, f = font) => {
    let str = san(s);
    if (widthOf(str, size, f) <= maxW) return str;
    while (str.length > 1 && widthOf(str + "...", size, f) > maxW) str = str.slice(0, -1);
    return str + "...";
  };
  const newPage = () => {
    page = pdf.addPage(A4);
    meta.push({ cover: false });
    y = H - M - 26;
  };
  const ensure = (need: number) => {
    if (y - need < M + 46) newPage();
  };
  const wrap = (s: string, size: number, maxW: number, f = font) => {
    const out: string[] = [];
    for (const para of san(s).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(test, size) > maxW) {
          if (line) out.push(line);
          line = word;
        } else line = test;
      }
      out.push(line);
    }
    return out;
  };
  const sectionTitle = (label: string, sub?: string) => {
    ensure(110);
    page.drawRectangle({ x: M, y: y - 3, width: 3, height: 16, color: BRAND });
    text(label.toUpperCase(), M + 10, y, 11, bold, INK);
    y -= sub ? 14 : 20;
    if (sub) {
      text(sub, M + 10, y, 8.5, font, MUTED);
      y -= 18;
    }
  };
  const AVAIL = W - M * 2;
  const para = (s: string, size = 9.5) => {
    if (!s) return;
    for (const line of wrap(s, size, AVAIL)) {
      ensure(16);
      text(line, M, y, size, font, INK);
      y -= size + 4.5;
    }
    y -= 10;
  };

  type Col = { label: string; x: number; w: number; align?: "right" };
  const colsFrom = (spec: [string, number, ("right" | undefined)?][]): Col[] => {
    let x = M + 6;
    return spec.map(([label, frac, align]) => {
      const w = AVAIL * frac - 6;
      const c: Col = { label, x, w, align };
      x += AVAIL * frac;
      return c;
    });
  };
  const table = (heading: string, colsDef: Col[], rows: string[][], sub?: string, tint?: (r: string[]) => any) => {
    if (!rows.length) return;
    sectionTitle(heading, sub);
    const rowH = 16;
    const head = () => {
      ensure(rowH * 3);
      page.drawRectangle({ x: M, y: y - 5, width: AVAIL, height: rowH, color: rgb(0.94, 0.96, 0.99) });
      colsDef.forEach((c) => {
        const label = c.label.toUpperCase();
        const tx = c.align === "right" ? c.x + c.w - widthOf(label, 7.5, bold) : c.x;
        text(label, tx, y, 7.5, bold, BRAND_DARK);
      });
      y -= rowH + 3;
    };
    head();
    rows.forEach((r, idx) => {
      const lineCounts = colsDef.map((c, ci) => wrap(r[ci] ?? "", 8.5, c.w - 6).length);
      const lines = Math.min(12, Math.max(...lineCounts));
      const thisH = rowH + (lines - 1) * 10;
      if (y - thisH < M + 46) {
        newPage();
        head();
      }
      if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - thisH + 11, width: AVAIL, height: thisH, color: rgb(0.985, 0.99, 0.997) });
      colsDef.forEach((c, ci) => {
        const wrapped = wrap(r[ci] ?? "", 8.5, c.w - 6).slice(0, 12);
        wrapped.forEach((val, li) => {
          const tx = c.align === "right" ? c.x + c.w - widthOf(val, 8.5) : c.x;
          text(val, tx, y - li * 10, 8.5, font, INK);
        });
      });
      if (tint) {
        const col = tint(r);
        if (col) page.drawRectangle({ x: M, y: y - thisH + 11, width: 2.5, height: thisH, color: col });
      }
      page.drawLine({ start: { x: M, y: y - thisH + 10 }, end: { x: W - M, y: y - thisH + 10 }, thickness: 0.35, color: LINE });
      y -= thisH;
    });
    y -= 22;
  };

  const statGrid = (items: [string, string][], cols = 4) => {
    const cardW = (AVAIL - 12 * (cols - 1)) / cols;
    const cardH = 52;
    const rows = Math.ceil(items.length / cols);
    ensure(rows * (cardH + 12) + 8);
    items.forEach((k, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = M + col * (cardW + 12);
      const cy = y - row * (cardH + 12);
      page.drawRectangle({ x, y: cy - cardH, width: cardW, height: cardH, color: SOFT, borderColor: LINE, borderWidth: 1 });
      page.drawRectangle({ x, y: cy - cardH, width: 2.5, height: cardH, color: BRAND });
      text(ellipsize(k[0].toUpperCase(), 7, cardW - 18, bold), x + 10, cy - 18, 7, bold, MUTED);
      text(ellipsize(k[1], 12.5, cardW - 18, bold), x + 10, cy - 37, 12.5, bold, INK);
    });
    y -= rows * (cardH + 12) + 14;
  };

  const defList = (rows: [string, string][]) => {
    rows.forEach(([k, v]) => {
      ensure(18);
      text(k, M + 4, y, 8.5, bold, MUTED);
      const lines = wrap(String(v), 8.5, AVAIL - 170);
      lines.slice(0, 3).forEach((l, i) => text(l, M + 165, y - i * 11, 8.5, font, INK));
      y -= 11 * Math.min(3, lines.length) + 5;
      page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.3, color: LINE });
      y -= 4;
    });
    y -= 16;
  };

  // ---------------------------------------------------------------- cover ---
  page.drawRectangle({ x: 0, y: H - 290, width: W, height: 290, color: BRAND });
  page.drawRectangle({ x: 0, y: H - 296, width: W, height: 6, color: BRAND_DARK });
  text("ACCOUNT AUDIT", M, H - 88, 10, bold, rgb(0.82, 0.88, 1));
  text(ellipsize(title, 28, AVAIL, bold), M, H - 132, 28, bold, rgb(1, 1, 1));
  wrap(san(story.headline || "Paid media, lead delivery, CRM operations and pipeline integrity"), 10.5, AVAIL)
    .slice(0, 2)
    .forEach((l, i) => text(l, M, H - 156 - i * 14, 10.5, font, rgb(0.88, 0.93, 1)));
  text(
    `Window ${pretty(data.meta.windowStart)} - ${pretty(data.meta.windowEnd)}   ·   Prepared ${pretty(data.meta.generatedAt)}`,
    M, H - 178, 9, font, rgb(0.8, 0.87, 1),
  );
  const crit = story.findings.filter((f) => f.severity === "critical").length;
  const high = story.findings.filter((f) => f.severity === "high").length;
  const hero: [string, string][] = [
    ["Findings", `${story.findings.length}`],
    ["Critical / high", `${crit} / ${high}`],
    ["Spend in window", money(data.paid.spend, cur)],
    ["Leads", num(data.leadQuality.total)],
  ];
  hero.forEach((h, i) => {
    const x = M + i * (AVAIL / 4);
    text(h[0].toUpperCase(), x, H - 226, 7.5, bold, rgb(0.78, 0.86, 1));
    text(h[1], x, H - 250, 17, bold, rgb(1, 1, 1));
  });

  y = H - 330;
  sectionTitle("Account", "Identity and platform state at time of audit");
  defList([
    ["Client / brand", `${data.meta.brand || data.meta.clientName}${data.meta.contactName ? ` (${data.meta.contactName})` : ""} · client ID ${data.meta.clientId}`],
    ["Sub-account", data.meta.locationId ? `GHL location ${data.meta.locationId}${data.meta.locationName ? ` · ${data.meta.locationName}` : ""}` : "Not mapped"],
    ["Platform status", `${data.meta.status ?? "—"} · autonomous optimization ${data.meta.autonomousOptimization ? "on" : "off"}`],
    ["Token in use", data.sync.tokenType],
    ["Audit window", `${data.meta.windowStart} to ${data.meta.windowEnd} · ${data.leadQuality.total} leads · ${data.crm.contacts} CRM contacts`],
  ]);

  // ---------------------------------------------------- executive summary ---
  newPage();
  sectionTitle("Executive summary");
  para(story.executive_summary, 9.5);

  table(
    "Findings",
    colsFrom([["#", 0.05], ["Finding", 0.56], ["Severity", 0.13], ["Owner", 0.26]]),
    story.findings.map((f, i) => [String(i + 1), `${f.title}. ${f.detail}`, f.severity, f.owner_role]),
    "Ranked by impact",
    (r) => sevColor(r[2]),
  );
  if (story.bottom_line) {
    ensure(60);
    const lines = wrap(story.bottom_line, 9.5, AVAIL - 28);
    const h = lines.length * 14 + 22;
    page.drawRectangle({ x: M, y: y - h + 10, width: AVAIL, height: h, color: SOFT, borderColor: LINE, borderWidth: 1 });
    page.drawRectangle({ x: M, y: y - h + 10, width: 3, height: h, color: BRAND });
    text("BOTTOM LINE", M + 14, y - 4, 7.5, bold, BRAND_DARK);
    lines.forEach((l, i) => text(l, M + 14, y - 20 - i * 14, 9.5, font, INK));
    y -= h + 20;
  }

  // ----------------------------------------------------------- paid media ---
  newPage();
  sectionTitle("Paid media performance", `${data.paid.activeDays} days with delivery in the window`);
  statGrid([
    ["Spend", money(data.paid.spend, cur)],
    ["Leads reported / deduped", `${num(data.leadQuality.total)} / ${num(data.leadQuality.deduped)}`],
    ["CPL reported / true", `${money(data.paid.cpl, cur)} / ${money(data.leadQuality.trueCpl, cur)}`],
    ["CPM", money(data.paid.cpm, cur)],
    ["Impressions", num(data.paid.impressions)],
    ["Clicks", num(data.paid.clicks)],
    ["Link CTR", `${data.paid.ctr.toFixed(2)}%`],
    ["Form CVR", `${data.paid.cvr.toFixed(2)}%`],
  ]);
  para(story.paid_media);

  table(
    "Campaign structure",
    colsFrom([["Campaign", 0.32], ["Spend", 0.13, "right"], ["Leads", 0.09, "right"], ["CPL", 0.12, "right"], ["CPM", 0.12, "right"], ["CTR", 0.1, "right"], ["SAC", 0.12]]),
    data.campaigns.slice(0, 14).map((c) => [
      c.name, money(c.spend, cur), num(c.leads), c.leads ? money(c.cpl, cur) : "—",
      money(c.cpm, cur), `${c.ctr.toFixed(2)}%`, c.sac,
    ]),
    "Ranked by spend",
    (r) => (r[6] === "no" ? RED : r[6] === "not declared" ? AMBER : undefined),
  );

  if (data.adConcentration.length) {
    table(
      "Ad concentration",
      colsFrom([["Ad", 0.7], ["Leads", 0.15, "right"], ["Share", 0.15, "right"]]),
      data.adConcentration.map((a) => [
        a.label, num(a.count),
        `${((a.count / Math.max(1, data.leadQuality.total)) * 100).toFixed(1)}%`,
      ]),
      `${data.distinctAds} distinct ads produced leads in the window`,
    );
  }

  // ----------------------------------------------------------- compliance ---
  sectionTitle("Compliance flags");
  para(story.compliance);

  // --------------------------------------------------------- lead quality ---
  newPage();
  sectionTitle("Lead quality and form design", `${data.leadQuality.total} leads · ${data.leadQuality.duplicates} duplicates · ${data.leadQuality.unqualifiedFormLeads} with no qualification captured`);
  para(story.lead_quality);

  for (const q of data.leadQuality.formQuestions.slice(0, 5)) {
    table(
      q.question.slice(0, 70),
      colsFrom([["Answer", 0.7], ["Count", 0.15, "right"], ["Share", 0.15, "right"]]),
      q.rows.map((r) => [r.label, num(r.count), `${((r.count / Math.max(1, q.answered)) * 100).toFixed(0)}%`]),
      `${q.answered} responses`,
    );
  }

  table(
    "Data hygiene",
    colsFrom([["Measure", 0.6], ["Value", 0.4, "right"]]),
    [
      ["Duplicate submissions (email/phone)", `${data.leadQuality.duplicates} (${data.leadQuality.duplicateRate.toFixed(1)}%)`],
      ["Missing email / phone", `${data.leadQuality.missingEmail} / ${data.leadQuality.missingPhone}`],
      ["Single-word or numeric names", String(data.leadQuality.junkNames)],
      ["Leads with no qualification answers", String(data.leadQuality.unqualifiedFormLeads)],
      ["Scored leads / unscored", `${data.scoring.scored} / ${data.scoring.unscored}`],
      ["Grade distribution", data.scoring.grades.map((g) => `${g.label} x${g.count}`).join(", ") || "—"],
    ],
  );

  // -------------------------------------------------------------- crm ops ---
  newPage();
  sectionTitle("CRM operations, sync and pipeline");
  statGrid([
    ["Leads linked to CRM", `${num(data.sync.linkedToGhl)} / ${num(data.leadQuality.total)}`],
    ["Link rate", `${data.sync.linkRate.toFixed(0)}%`],
    ["Contacts", num(data.crm.contacts)],
    ["Notes logged", num(data.crm.notes)],
    ["Median speed to first touch", `${data.crm.medianFirstTouchHours.toFixed(1)}h`],
    ["Touched within 1h", `${data.crm.within1h} / ${data.crm.dialledContacts}`],
    ["Appointments", num(data.crm.appointments)],
    ["Outcome coverage", `${data.crm.outcomeCoverage.toFixed(0)}%`],
  ]);
  para(story.crm_ops);

  if (data.sync.topErrors.length) {
    table(
      "Sync failures",
      colsFrom([["Error", 0.78], ["Leads", 0.22, "right"]]),
      data.sync.topErrors.map((e) => [e.label, num(e.count)]),
      `${data.sync.notLinked} leads have no CRM contact linked`,
      () => RED,
    );
  }
  if (data.deliveryGaps.length) {
    table(
      "Lead delivery gaps",
      colsFrom([["From", 0.4], ["To", 0.4], ["Hours", 0.2, "right"]]),
      data.deliveryGaps.slice(0, 10).map((g) => [pretty(g.from), pretty(g.to), String(g.hours)]),
      "Consecutive lead arrivals more than 48 hours apart",
      () => AMBER,
    );
  }
  if (data.crm.stages.length) {
    table(
      "Pipeline stage distribution",
      colsFrom([["Stage", 0.7], ["Opportunities", 0.3, "right"]]),
      data.crm.stages.slice(0, 14).map((s) => [s.label, num(s.count)]),
      `${data.crm.opportunities} opportunities · ${data.crm.wonOpportunities} won · ${data.crm.lostOpportunities} lost · open value ${money(data.crm.openValue, cur)}`,
    );
  }
  if (data.crm.appointmentStatuses.length) {
    table(
      "Appointments",
      colsFrom([["Status", 0.7], ["Count", 0.3, "right"]]),
      data.crm.appointmentStatuses.map((s) => [s.label, num(s.count)]),
      `${data.crm.appointmentsWithOutcome} of ${data.crm.appointments} have a recorded outcome · ${data.crm.upcomingAppointments} upcoming · ${data.crm.noShows} no-shows`,
    );
  }
  if (data.optimization.recent.length) {
    table(
      "Optimization log",
      colsFrom([["Date", 0.16], ["Action", 0.24], ["Detail", 0.44], ["Result", 0.16]]),
      data.optimization.recent.map((a) => [pretty(a.date), a.action, a.detail, String(a.status)]),
      `${data.optimization.actions} actions in window, ${data.optimization.failed} failed`,
    );
  }

  // --------------------------------------------------------- defect table ---
  newPage();
  table(
    "Defect register",
    colsFrom([["ID", 0.07], ["Defect", 0.32], ["Sev", 0.1], ["Evidence", 0.51]]),
    data.defects.map((d) => [d.id, d.title, d.severity, d.evidence]),
    "Machine-detected from platform data",
    (r) => sevColor(r[2]),
  );

  table(
    "Recommended actions, in order",
    colsFrom([["When", 0.16], ["Owner", 0.2], ["Action", 0.64]]),
    story.action_plan.map((a) => [a.when, a.owner_role, a.task]),
  );

  // ------------------------------------------------ headers & footers -------
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    if (!meta[i]?.cover) {
      p.drawText(san(`${title} - Account audit`), { x: M, y: H - 40, size: 8.5, font: bold, color: MUTED });
      const per = san(`${data.meta.windowStart} - ${data.meta.windowEnd}`);
      p.drawText(per, { x: W - M - font.widthOfTextAtSize(per, 8.5), y: H - 40, size: 8.5, font, color: MUTED });
      p.drawLine({ start: { x: M, y: H - 48 }, end: { x: W - M, y: H - 48 }, thickness: 0.5, color: LINE });
    }
    p.drawLine({ start: { x: M, y: 42 }, end: { x: W - M, y: 42 }, thickness: 0.5, color: LINE });
    p.drawText(san(`Generated ${new Date(data.meta.generatedAt).toUTCString()} - internal`), { x: M, y: 28, size: 7.5, font, color: MUTED });
    const pg = san(`Page ${i + 1} of ${pages.length}`);
    p.drawText(pg, { x: W - M - font.widthOfTextAtSize(pg, 7.5), y: 28, size: 7.5, font, color: MUTED });
  });

  return await pdf.save();
}
