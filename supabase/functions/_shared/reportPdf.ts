// Renders a client performance report to a multi-section PDF (pdf-lib, no browser needed).
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

export interface ReportLead {
  name: string;
  email?: string | null;
  phone?: string | null;
  campaign?: string | null;
  form?: string | null;
  state?: string | null;
  date?: string | null;
  stage?: string | null;
}

export interface ReportPayload {
  client: { id: number; name: string; brand?: string | null; currency: string; website?: string | null };
  period: { start: string; end: string };
  totals: {
    spend: number;
    leads: number;
    clicks: number;
    impressions: number;
    cpl: number;
    cpm: number;
    ctr: number;
    cvr: number;
  };
  previous?: { spend: number; leads: number; cpl: number } | null;
  daily: { date: string; spend: number; leads: number }[];
  campaigns?: { name: string; spend: number; leads: number; impressions: number; clicks: number }[];
  leads?: ReportLead[];
  leadStats?: {
    total: number;
    byState: { label: string; count: number }[];
    byCampaign: { label: string; count: number }[];
    byForm: { label: string; count: number }[];
  } | null;
  notes?: { contact: string; body: string; date: string | null }[];
  activity?: { action: string; status: string; detail: string; date: string | null }[];
  appointments?: { title: string; contact: string; date: string | null; status: string | null }[];
  generated_at: string;
}

const BRAND = rgb(0.145, 0.388, 0.921);
const BRAND_DARK = rgb(0.08, 0.22, 0.55);
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.89, 0.91, 0.94);
const SOFT = rgb(0.968, 0.975, 0.988);
const GREEN = rgb(0.06, 0.62, 0.42);
const RED = rgb(0.78, 0.18, 0.22);

const money = (n: number, cur: string) =>
  `${cur === "USD" ? "$" : cur + " "}${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => Math.round(Number(n) || 0).toLocaleString("en-US");
const pretty = (d?: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? String(d)
    : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const A4: [number, number] = [595.28, 841.89];
const W = A4[0];
const H = A4[1];
const M = 48;

export async function buildReportPdf(payload: ReportPayload, commentaryIn: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // pdf-lib standard fonts are WinAnsi-only: swap typographic glyphs, drop the rest.
  const san = (s: unknown) =>
    String(s ?? "")
      .replace(/[\u2192\u2794]/g, "->")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2022/g, "-")
      .replace(/\u2026/g, "...")
      .replace(/[^\x20-\xFF\n]/g, "");

  const cur = payload.client.currency || "USD";
  const title = payload.client.brand || payload.client.name || "Client";

  let page = pdf.addPage(A4);
  let y = H - M;
  const pageMeta: { page: any; cover: boolean }[] = [{ page, cover: true }];

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
    pageMeta.push({ page, cover: false });
    y = H - M - 26; // leave room for the running header
    return page;
  };

  const ensure = (need: number) => {
    if (y - need < M + 46) newPage();
  };

  const sectionTitle = (label: string, sub?: string) => {
    ensure(52);
    page.drawRectangle({ x: M, y: y - 3, width: 3, height: 16, color: BRAND });
    text(label.toUpperCase(), M + 10, y, 11, bold, INK);
    y -= sub ? 14 : 20;
    if (sub) {
      text(sub, M + 10, y, 8.5, font, MUTED);
      y -= 18;
    }
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

  // ---------------------------------------------------------------- cover ---
  page.drawRectangle({ x: 0, y: H - 300, width: W, height: 300, color: BRAND });
  page.drawRectangle({ x: 0, y: H - 306, width: W, height: 6, color: BRAND_DARK });
  text("PERFORMANCE REPORT", M, H - 92, 10, bold, rgb(0.82, 0.88, 1));
  const coverTitle = ellipsize(title, 30, W - M * 2, bold);
  text(coverTitle, M, H - 140, 30, bold, rgb(1, 1, 1));
  text(`${pretty(payload.period.start)}  -  ${pretty(payload.period.end)}`, M, H - 172, 12, font, rgb(0.88, 0.93, 1));
  if (payload.client.website) text(payload.client.website, M, H - 192, 9.5, font, rgb(0.8, 0.87, 1));

  // Headline stats on the cover band
  const hero: [string, string][] = [
    ["Ad spend", money(payload.totals.spend, cur)],
    ["Leads", num(payload.totals.leads)],
    ["Cost per lead", payload.totals.leads ? money(payload.totals.cpl, cur) : "—"],
  ];
  hero.forEach((h, i) => {
    const x = M + i * ((W - M * 2) / 3);
    text(h[0].toUpperCase(), x, H - 236, 8, bold, rgb(0.78, 0.86, 1));
    text(h[1], x, H - 260, 18, bold, rgb(1, 1, 1));
  });

  y = H - 340;

  // Executive summary
  sectionTitle("Executive summary");
  const commentary = san(commentaryIn);
  if (commentary) {
    page.drawRectangle({
      x: M, y: y - (wrap(commentary, 10, W - M * 2 - 28).length * 15) - 10,
      width: W - M * 2, height: wrap(commentary, 10, W - M * 2 - 28).length * 15 + 22,
      color: SOFT, borderColor: LINE, borderWidth: 1,
    });
    y -= 8;
    for (const line of wrap(commentary, 10, W - M * 2 - 28)) {
      text(line, M + 14, y, 10, font, INK);
      y -= 15;
    }
    y -= 18;
  }

  // Period-over-period
  if (payload.previous) {
    const deltas: [string, number, number, boolean][] = [
      ["Spend", payload.totals.spend, payload.previous.spend, true],
      ["Leads", payload.totals.leads, payload.previous.leads, true],
      ["CPL", payload.totals.cpl, payload.previous.cpl, false],
    ];
    sectionTitle("Versus previous period");
    const cw = (W - M * 2 - 24) / 3;
    deltas.forEach(([label, now, prev, upGood], i) => {
      const x = M + i * (cw + 12);
      const pct = prev > 0 ? ((now - prev) / prev) * 100 : 0;
      const good = pct === 0 ? true : upGood ? pct > 0 : pct < 0;
      page.drawRectangle({ x, y: y - 48, width: cw, height: 48, color: SOFT, borderColor: LINE, borderWidth: 1 });
      text(label.toUpperCase(), x + 10, y - 17, 7.5, bold, MUTED);
      const nowStr = label === "Leads" ? num(now) : money(now, cur);
      text(nowStr, x + 10, y - 36, 12, bold, INK);
      const dstr = prev > 0 ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "new";
      text(dstr, x + cw - 12 - widthOf(dstr, 9, bold), y - 36, 9, bold, prev > 0 ? (good ? GREEN : RED) : MUTED);
    });
    y -= 68;
  }

  // ------------------------------------------------------- KPI detail page ---
  newPage();
  sectionTitle("Delivery & efficiency", `All figures for ${pretty(payload.period.start)} - ${pretty(payload.period.end)}`);
  const kpis: [string, string][] = [
    ["Ad spend", money(payload.totals.spend, cur)],
    ["Leads", num(payload.totals.leads)],
    ["Cost per lead", payload.totals.leads ? money(payload.totals.cpl, cur) : "—"],
    ["Impressions", num(payload.totals.impressions)],
    ["Clicks", num(payload.totals.clicks)],
    ["CPM", money(payload.totals.cpm, cur)],
    ["Click-through rate", `${(payload.totals.ctr || 0).toFixed(2)}%`],
    ["Lead conversion rate", `${(payload.totals.cvr || 0).toFixed(2)}%`],
  ];
  const cols = 4;
  const cardW = (W - M * 2 - 12 * (cols - 1)) / cols;
  const cardH = 58;
  kpis.forEach((k, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = M + col * (cardW + 12);
    const cy = y - row * (cardH + 12);
    page.drawRectangle({ x, y: cy - cardH, width: cardW, height: cardH, color: SOFT, borderColor: LINE, borderWidth: 1 });
    page.drawRectangle({ x, y: cy - cardH, width: 2.5, height: cardH, color: BRAND });
    text(ellipsize(k[0].toUpperCase(), 7, cardW - 20, bold), x + 10, cy - 20, 7, bold, MUTED);
    text(ellipsize(k[1], 13, cardW - 20, bold), x + 10, cy - 40, 13, bold, INK);
  });
  y -= cardH * 2 + 12 + 28;

  // Daily chart
  const daily = payload.daily ?? [];
  if (daily.length) {
    sectionTitle("Daily spend & leads");
    const chartH = 140;
    const chartW = W - M * 2;
    const chartBottom = y - chartH;
    page.drawRectangle({ x: M, y: chartBottom, width: chartW, height: chartH, color: rgb(0.99, 0.995, 1), borderColor: LINE, borderWidth: 1 });
    for (let g = 1; g < 4; g++) {
      const gy = chartBottom + (chartH / 4) * g;
      page.drawLine({ start: { x: M, y: gy }, end: { x: W - M, y: gy }, thickness: 0.4, color: LINE });
    }
    const maxSpend = Math.max(...daily.map((d) => d.spend), 1);
    const maxLeads = Math.max(...daily.map((d) => d.leads), 1);
    const slot = chartW / daily.length;
    const barW = Math.max(1.5, Math.min(16, slot * 0.55));
    let prevPt: { x: number; y: number } | null = null;
    daily.forEach((d, i) => {
      const x = M + i * slot + (slot - barW) / 2;
      const h = (d.spend / maxSpend) * (chartH - 20);
      page.drawRectangle({ x, y: chartBottom + 1, width: barW, height: Math.max(0.5, h), color: BRAND });
      const pt = { x: x + barW / 2, y: chartBottom + 1 + (d.leads / maxLeads) * (chartH - 20) };
      if (prevPt) page.drawLine({ start: prevPt, end: pt, thickness: 1, color: GREEN });
      page.drawCircle({ x: pt.x, y: pt.y, size: 1.8, color: GREEN });
      prevPt = pt;
    });
    text(pretty(daily[0].date), M, chartBottom - 12, 7.5, font, MUTED);
    const lastLbl = pretty(daily[daily.length - 1].date);
    text(lastLbl, W - M - widthOf(lastLbl, 7.5), chartBottom - 12, 7.5, font, MUTED);
    text(`Bars: daily spend (peak ${money(maxSpend, cur)})    Line: daily leads (peak ${num(maxLeads)})`, M, chartBottom - 26, 7.5, font, MUTED);
    y = chartBottom - 48;
  }

  // ------------------------------------------------------------- tables -----
  type Col = { label: string; x: number; w: number; align?: "right" };
  const table = (title2: string, colsDef: Col[], rows: string[][], sub?: string) => {
    if (!rows.length) return;
    sectionTitle(title2, sub);
    const rowH = 16;
    const head = () => {
      ensure(rowH * 3);
      page.drawRectangle({ x: M, y: y - 5, width: W - M * 2, height: rowH, color: rgb(0.94, 0.96, 0.99) });
      colsDef.forEach((c) => {
        const label = c.label.toUpperCase();
        const tx = c.align === "right" ? c.x + c.w - widthOf(label, 7.5, bold) : c.x;
        text(label, tx, y, 7.5, bold, BRAND_DARK);
      });
      y -= rowH + 3;
    };
    head();
    rows.forEach((r, idx) => {
      if (y - rowH < M + 46) {
        newPage();
        head();
      }
      if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - 4.5, width: W - M * 2, height: rowH, color: rgb(0.985, 0.99, 0.997) });
      colsDef.forEach((c, ci) => {
        const val = ellipsize(r[ci] ?? "", 8.5, c.w - 8);
        const tx = c.align === "right" ? c.x + c.w - widthOf(val, 8.5) : c.x;
        text(val, tx, y, 8.5, font, INK);
      });
      page.drawLine({ start: { x: M, y: y - 5 }, end: { x: W - M, y: y - 5 }, thickness: 0.35, color: LINE });
      y -= rowH;
    });
    y -= 22;
  };

  const AVAIL = W - M * 2;
  const colsFrom = (spec: [string, number, ("right" | undefined)?][]): Col[] => {
    let x = M + 6;
    return spec.map(([label, frac, align]) => {
      const w = AVAIL * frac - 6;
      const c: Col = { label, x, w, align };
      x += AVAIL * frac;
      return c;
    });
  };

  // Campaign breakdown
  const campaigns = payload.campaigns ?? [];
  if (campaigns.length) {
    table(
      "Campaign performance",
      colsFrom([["Campaign", 0.36], ["Spend", 0.14, "right"], ["Leads", 0.11, "right"], ["CPL", 0.13, "right"], ["Impr.", 0.13, "right"], ["CTR", 0.13, "right"]]),
      campaigns.map((c) => [
        c.name || "Unnamed campaign",
        money(c.spend, cur),
        num(c.leads),
        c.leads ? money(c.spend / c.leads, cur) : "—",
        num(c.impressions),
        c.impressions ? `${((c.clicks / c.impressions) * 100).toFixed(2)}%` : "—",
      ]),
      "Ranked by spend",
    );
  }

  // Lead breakdown (states / campaigns / forms)
  const ls = payload.leadStats;
  if (ls && ls.total > 0) {
    sectionTitle("Lead breakdown", `${num(ls.total)} leads captured this period`);
    const groups: [string, { label: string; count: number }[]][] = [
      ["Top states", ls.byState],
      ["Top campaigns", ls.byCampaign],
      ["Top forms", ls.byForm],
    ].filter(([, arr]) => (arr as any[]).length) as any;
    if (groups.length) {
      const gw = (AVAIL - 12 * (groups.length - 1)) / groups.length;
      const maxRows = Math.max(...groups.map(([, arr]) => Math.min(arr.length, 6)));
      const boxH = 26 + maxRows * 14 + 8;
      ensure(boxH + 10);
      groups.forEach(([label, arr], gi) => {
        const x = M + gi * (gw + 12);
        const top = y;
        page.drawRectangle({ x, y: top - boxH, width: gw, height: boxH, color: SOFT, borderColor: LINE, borderWidth: 1 });
        text(label.toUpperCase(), x + 10, top - 17, 7.5, bold, BRAND_DARK);
        arr.slice(0, 6).forEach((row, ri) => {
          const ry = top - 34 - ri * 14;
          text(ellipsize(row.label || "Unknown", 8.5, gw - 46), x + 10, ry, 8.5, font, INK);
          const cnt = num(row.count);
          text(cnt, x + gw - 10 - widthOf(cnt, 8.5, bold), ry, 8.5, bold, INK);
        });
      });
      y -= boxH + 24;
    }
  }

  // Lead detail
  const leads = payload.leads ?? [];
  if (leads.length) {
    table(
      "Lead detail",
      colsFrom([["Date", 0.13], ["Name", 0.2], ["Contact", 0.24], ["State", 0.1], ["Campaign", 0.23], ["Stage", 0.1]]),
      leads.map((l) => [
        pretty(l.date),
        l.name || "—",
        l.email || l.phone || "—",
        l.state || "—",
        l.campaign || l.form || "—",
        l.stage || "New",
      ]),
      leads.length >= 60 ? "Most recent 60 leads" : undefined,
    );
  }

  // Appointments
  const appts = payload.appointments ?? [];
  if (appts.length) {
    table(
      "Appointments booked",
      colsFrom([["Date", 0.18], ["Contact", 0.3], ["Appointment", 0.34], ["Status", 0.18]]),
      appts.map((a) => [pretty(a.date), a.contact || "—", a.title || "—", a.status || "—"]),
    );
  }

  // CRM notes
  const notes = payload.notes ?? [];
  if (notes.length) {
    sectionTitle("CRM activity notes", "Latest follow-up notes logged against this account");
    notes.forEach((n) => {
      const lines = wrap(n.body || "", 8.5, AVAIL - 28).slice(0, 4);
      const blockH = 22 + lines.length * 12 + 8;
      ensure(blockH + 6);
      page.drawRectangle({ x: M, y: y - blockH + 8, width: AVAIL, height: blockH, color: rgb(0.995, 0.997, 1), borderColor: LINE, borderWidth: 1 });
      page.drawRectangle({ x: M, y: y - blockH + 8, width: 2.5, height: blockH, color: GREEN });
      text(n.contact || "Contact", M + 12, y, 9, bold, INK);
      const d = pretty(n.date);
      text(d, W - M - 12 - widthOf(d, 8), y, 8, font, MUTED);
      let ly = y - 14;
      lines.forEach((l) => {
        text(l, M + 12, ly, 8.5, font, INK);
        ly -= 12;
      });
      y -= blockH + 6;
    });
    y -= 16;
  }

  // Optimization / audit log
  const activity = payload.activity ?? [];
  if (activity.length) {
    table(
      "Optimization log",
      colsFrom([["Date", 0.16], ["Action", 0.24], ["Detail", 0.44], ["Result", 0.16]]),
      activity.map((a) => [pretty(a.date), a.action || "—", a.detail || "—", a.status || "—"]),
      "Changes made to this account during the period",
    );
  }

  // Daily breakdown table
  if (daily.length) {
    table(
      "Daily breakdown",
      colsFrom([["Date", 0.3], ["Spend", 0.24, "right"], ["Leads", 0.22, "right"], ["CPL", 0.24, "right"]]),
      daily.map((d) => [pretty(d.date), money(d.spend, cur), num(d.leads), d.leads ? money(d.spend / d.leads, cur) : "—"]),
    );
  }

  // ------------------------------------------------ headers & footers -------
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const isCover = pageMeta[i]?.cover;
    if (!isCover) {
      p.drawText(san(title), { x: M, y: H - 40, size: 8.5, font: bold, color: MUTED });
      const per = san(`${payload.period.start} - ${payload.period.end}`);
      p.drawText(per, { x: W - M - font.widthOfTextAtSize(per, 8.5), y: H - 40, size: 8.5, font, color: MUTED });
      p.drawLine({ start: { x: M, y: H - 48 }, end: { x: W - M, y: H - 48 }, thickness: 0.5, color: LINE });
    }
    p.drawLine({ start: { x: M, y: 42 }, end: { x: W - M, y: 42 }, thickness: 0.5, color: LINE });
    p.drawText(san(`Generated ${new Date(payload.generated_at).toUTCString()}`), { x: M, y: 28, size: 7.5, font, color: MUTED });
    const pg = san(`Page ${i + 1} of ${pages.length}`);
    p.drawText(pg, { x: W - M - font.widthOfTextAtSize(pg, 7.5), y: 28, size: 7.5, font, color: MUTED });
  });

  return await pdf.save();
}
