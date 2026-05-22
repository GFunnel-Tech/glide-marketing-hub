// Centralized glossary of advertising / funnel metrics.
// Keys are case-insensitive lookups; aliases handled via `findKpi`.

export interface KpiDef {
  key: string;
  name: string;            // Expanded name (e.g. "Cost Per Lead")
  short: string;           // Acronym (e.g. "CPL")
  description: string;     // Plain-English explanation
  formula?: string;        // Optional formula string
  benchmark?: string;      // Optional benchmark / good range
  direction?: "lower" | "higher" | "range";
}

export const KPI_GLOSSARY: Record<string, KpiDef> = {
  cpl: {
    key: "cpl",
    name: "Cost Per Lead",
    short: "CPL",
    description: "Average ad spend required to generate one lead.",
    formula: "Total Ad Spend ÷ Leads",
    benchmark: "Good: under $30 · Watch: $30–$60 · Bad: above $60",
    direction: "lower",
  },
  cpm: {
    key: "cpm",
    name: "Cost Per Mille (1,000 Impressions)",
    short: "CPM",
    description: "What you pay Meta for every 1,000 ad impressions delivered.",
    formula: "(Spend ÷ Impressions) × 1,000",
    benchmark: "Good: under $30 · Watch: $30–$80",
    direction: "lower",
  },
  cpc: {
    key: "cpc",
    name: "Cost Per Click",
    short: "CPC",
    description: "Average cost for each link click on your ad.",
    formula: "Spend ÷ Link Clicks",
    direction: "lower",
  },
  ctr: {
    key: "ctr",
    name: "Click-Through Rate",
    short: "CTR",
    description: "Percentage of people who clicked your ad after seeing it. Strong CTR signals creative is resonating.",
    formula: "(Link Clicks ÷ Impressions) × 100",
    benchmark: "Good: above 1.5%",
    direction: "higher",
  },
  cvr: {
    key: "cvr",
    name: "Conversion Rate",
    short: "CVR",
    description: "Percentage of clicks that turn into leads. Measures landing page / form effectiveness.",
    formula: "(Leads ÷ Unique Link Clicks) × 100",
    benchmark: "Good: 20–30% · Watch: 10–20% · Bad: below 10%",
    direction: "higher",
  },
  formcvr: {
    key: "formcvr",
    name: "Form Conversion Rate",
    short: "Form CVR",
    description: "Of people who landed on the form, how many submitted. Same math as CVR but scoped to form interactions.",
    formula: "(Leads ÷ Unique Link Clicks) × 100",
    benchmark: "Good: above 15% · Watch: 10–15%",
    direction: "higher",
  },
  frequency: {
    key: "frequency",
    name: "Frequency",
    short: "Freq",
    description: "Average times the same person has seen your ad in the window. High frequency causes ad fatigue.",
    formula: "Impressions ÷ Reach",
    benchmark: "Healthy: under 3 · Fatigue risk: above 4",
    direction: "lower",
  },
  spend: {
    key: "spend",
    name: "Ad Spend",
    short: "Spend",
    description: "Total amount paid to Meta for ad delivery in the selected period.",
  },
  leads: {
    key: "leads",
    name: "Leads",
    short: "Leads",
    description: "Number of lead form submissions reported by Meta for the period.",
  },
  trueleads: {
    key: "trueleads",
    name: "True Leads",
    short: "True Leads",
    description: "Deduplicated leads after removing double-counts and disqualified entries — a more accurate count than Meta's reported number.",
  },
  truecpl: {
    key: "truecpl",
    name: "True Cost Per Lead",
    short: "True CPL",
    description: "CPL calculated using True Leads instead of Meta-reported leads. Reflects real cost of a usable lead.",
    formula: "Spend ÷ True Leads",
    direction: "lower",
  },
  roas: {
    key: "roas",
    name: "Return On Ad Spend",
    short: "ROAS",
    description: "Revenue generated for every $1 of ad spend.",
    formula: "Revenue ÷ Spend",
    benchmark: "Profitable: above 2.0×",
    direction: "higher",
  },
  impressions: {
    key: "impressions",
    name: "Impressions",
    short: "Impr.",
    description: "Total times your ads were shown (including repeat views to the same person).",
  },
  reach: {
    key: "reach",
    name: "Reach",
    short: "Reach",
    description: "Number of unique people who saw your ad at least once.",
  },
  clicks: {
    key: "clicks",
    name: "Link Clicks",
    short: "Clicks",
    description: "Clicks that took someone to the destination URL (excludes likes, comments, etc.).",
  },
  hookrate: {
    key: "hookrate",
    name: "Hook Rate",
    short: "Hook",
    description: "Percentage of viewers who watched at least 3 seconds — measures how well a video stops the scroll.",
    formula: "(3-Second Video Views ÷ Impressions) × 100",
    direction: "higher",
  },
  holdrate: {
    key: "holdrate",
    name: "Hold Rate",
    short: "Hold",
    description: "Percentage of viewers who kept watching past the hook — measures whether the story keeps attention.",
    formula: "(15-Second Views ÷ 3-Second Views) × 100",
    direction: "higher",
  },
  doublecount: {
    key: "doublecount",
    name: "Double Count Detected",
    short: "DC",
    description: "Flag indicating Meta may have double-counted leads (e.g. retries, duplicate submissions). When on, prefer True Leads / True CPL.",
  },
  bm: {
    key: "bm",
    name: "Business Manager Type",
    short: "BM Type",
    description: "Which Meta Business Manager owns this client's ad account — affects access, billing, and reporting.",
  },
  plai: {
    key: "plai",
    name: "Plai Integration",
    short: "Plai",
    description: "Whether this client's ad account is connected to Plai for automated optimization.",
  },
};

const NORMALIZE = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");

const ALIASES: Record<string, string> = {
  costperlead: "cpl",
  costpermille: "cpm",
  costperclick: "cpc",
  clickthrough: "ctr",
  clickthroughrate: "ctr",
  conversionrate: "cvr",
  formconversionrate: "formcvr",
  freq: "frequency",
  adspend: "spend",
  totalspend: "spend",
  returnonadspend: "roas",
  impr: "impressions",
  linkclicks: "clicks",
  businessmanager: "bm",
  bmtype: "bm",
};

export function findKpi(label: string): KpiDef | undefined {
  const k = NORMALIZE(label);
  return KPI_GLOSSARY[k] ?? KPI_GLOSSARY[ALIASES[k] ?? ""];
}
