// Renders a client performance report to a PDF (pdf-lib, no browser needed).
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

export interface ReportPayload {
  client: { id: number; name: string; brand?: string | null; currency: string };
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
  daily: { date: string; spend: number; leads: number }[];
  generated_at: string;
}

const BRAND = rgb(0.145, 0.388, 0.921); // hsl(217 91% 60%) approx
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.89, 0.91, 0.94);

const money = (n: number, cur: string) =>
  `${cur === "USD" ? "$" : cur + " "}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => Math.round(n).toLocaleString("en-US");

export async function buildReportPdf(payload: ReportPayload, commentary: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([595.28, 841.89]); // A4
  const W = 595.28;
  const M = 48;
  let y = 841.89 - M;

  const text = (s: string, x: number, yy: number, size = 10, f = font, color = INK) =>
    page.drawText(s, { x, y: yy, size, font: f, color });

  const cur = payload.client.currency || "USD";
  const title = payload.client.brand || payload.client.name || "Client";

  // Header band
  page.drawRectangle({ x: 0, y: y - 18, width: W, height: 76, color: BRAND });
  text("PERFORMANCE REPORT", M, y + 30, 9, bold, rgb(1, 1, 1));
  text(title.slice(0, 48), M, y + 8, 20, bold, rgb(1, 1, 1));
  text(`${payload.period.start}  to  ${payload.period.end}`, M, y - 8, 10, font, rgb(0.9, 0.94, 1));
  y -= 56;

  // KPI grid
  const kpis: [string, string][] = [
    ["Ad spend", money(payload.totals.spend, cur)],
    ["Leads", num(payload.totals.leads)],
    ["Cost per lead", payload.totals.leads ? money(payload.totals.cpl, cur) : "—"],
    ["Impressions", num(payload.totals.impressions)],
    ["Clicks", num(payload.totals.clicks)],
    ["CPM", money(payload.totals.cpm, cur)],
    ["CTR", `${payload.totals.ctr.toFixed(2)}%`],
    ["Conversion rate", `${payload.totals.cvr.toFixed(2)}%`],
  ];
  const cols = 4;
  const cardW = (W - M * 2 - 12 * (cols - 1)) / cols;
  const cardH = 58;
  y -= 34;
  kpis.forEach((k, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = M + col * (cardW + 12);
    const cy = y - row * (cardH + 12);
    page.drawRectangle({
      x, y: cy - cardH, width: cardW, height: cardH,
      color: rgb(0.976, 0.98, 0.988), borderColor: LINE, borderWidth: 1,
    });
    text(k[0].toUpperCase(), x + 10, cy - 20, 7, bold, MUTED);
    text(k[1], x + 10, cy - 40, 13, bold, INK);
  });
  y -= cardH * 2 + 12 + 26;

  // Daily spend / leads chart
  const daily = payload.daily ?? [];
  if (daily.length) {
    text("Daily spend & leads", M, y, 11, bold, INK);
    y -= 12;
    const chartH = 130;
    const chartW = W - M * 2;
    const chartTop = y;
    const chartBottom = y - chartH;
    page.drawRectangle({ x: M, y: chartBottom, width: chartW, height: chartH, borderColor: LINE, borderWidth: 1 });
    const maxSpend = Math.max(...daily.map((d) => d.spend), 1);
    const maxLeads = Math.max(...daily.map((d) => d.leads), 1);
    const slot = chartW / daily.length;
    const barW = Math.max(1.5, Math.min(14, slot * 0.55));
    daily.forEach((d, i) => {
      const x = M + i * slot + (slot - barW) / 2;
      const h = (d.spend / maxSpend) * (chartH - 16);
      page.drawRectangle({ x, y: chartBottom + 1, width: barW, height: Math.max(0.5, h), color: BRAND });
      if (d.leads > 0) {
        const ly = chartBottom + 1 + (d.leads / maxLeads) * (chartH - 16);
        page.drawCircle({ x: x + barW / 2, y: ly, size: 1.8, color: rgb(0.06, 0.72, 0.51) });
      }
    });
    text(daily[0].date, M, chartBottom - 12, 7, font, MUTED);
    text(daily[daily.length - 1].date, W - M - 40, chartBottom - 12, 7, font, MUTED);
    text(`Bars: spend (max ${money(maxSpend, cur)})   •   Dots: leads (max ${num(maxLeads)})`, M, chartBottom - 24, 7, font, MUTED);
    y = chartBottom - 46;
  }

  // Commentary
  const wrap = (s: string, size: number, maxW: number) => {
    const out: string[] = [];
    for (const para of s.split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > maxW) {
          if (line) out.push(line);
          line = word;
        } else line = test;
      }
      out.push(line);
    }
    return out;
  };

  if (commentary) {
    text("Summary", M, y, 11, bold, INK);
    y -= 16;
    for (const line of wrap(commentary, 10, W - M * 2)) {
      if (y < M + 40) {
        page = pdf.addPage([595.28, 841.89]);
        y = 841.89 - M;
      }
      text(line, M, y, 10, font, INK);
      y -= 15;
    }
    y -= 12;
  }

  // Daily table (compact, paginated)
  if (daily.length) {
    const rowH = 15;
    const header = () => {
      page.drawRectangle({ x: M, y: y - 4, width: W - M * 2, height: rowH, color: rgb(0.96, 0.97, 0.99) });
      text("Date", M + 8, y, 8, bold, MUTED);
      text("Spend", M + 200, y, 8, bold, MUTED);
      text("Leads", M + 320, y, 8, bold, MUTED);
      text("CPL", M + 420, y, 8, bold, MUTED);
      y -= rowH + 2;
    };
    if (y < M + 80) {
      page = pdf.addPage([595.28, 841.89]);
      y = 841.89 - M;
    }
    text("Daily breakdown", M, y, 11, bold, INK);
    y -= 20;
    header();
    for (const d of daily) {
      if (y < M + 24) {
        page = pdf.addPage([595.28, 841.89]);
        y = 841.89 - M;
        header();
      }
      text(d.date, M + 8, y, 8.5, font, INK);
      text(money(d.spend, cur), M + 200, y, 8.5, font, INK);
      text(num(d.leads), M + 320, y, 8.5, font, INK);
      text(d.leads ? money(d.spend / d.leads, cur) : "—", M + 420, y, 8.5, font, INK);
      page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.4, color: LINE });
      y -= rowH;
    }
  }

  // Footer on every page
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(`Generated ${new Date(payload.generated_at).toUTCString()}   •   Page ${i + 1} of ${pages.length}`, {
      x: M, y: 28, size: 7.5, font, color: MUTED,
    });
  });

  return await pdf.save();
}
