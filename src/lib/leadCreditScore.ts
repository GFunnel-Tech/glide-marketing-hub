/**
 * Credit-score parsing for Meta lead-form field data.
 *
 * Lead forms word the credit question in many ways:
 *   approx_credit_score?              -> "above_640" | "below_640" | "unsure"
 *   approx_credit_score_range?        -> "Above 640" | "Below 640"
 *   estimated_credit_score?           -> "above_640"
 *   is_your_credit_score_640_or_above -> "Yes" | "No" | "Unsure"
 *   ...plus free-text/numeric answers ("680", "700+")
 *
 * Everything funnels through here so the dashboard, campaign breakdown and
 * exports all agree on what counts as an "Above 640" lead.
 */

export type CreditScoreRead = { hasScore: boolean; isAbove: boolean };

const THRESHOLD = 640;

function isCreditField(rawName: string): boolean {
  const n = rawName.toLowerCase().replace(/[_\-]+/g, " ");
  if (n.includes("credit score")) return true;
  // e.g. "is your credit 640 or above?"
  return n.includes("credit") && (n.includes("score") || /\b6\d0\b/.test(n));
}

/** Reads a single answer value; null = not conclusive. */
function readValue(rawValue: string, rawName: string): boolean | null {
  const v = rawValue.toLowerCase().replace(/[_\-]+/g, " ").trim();
  if (!v) return null;
  if (/^(unsure|unknown|not sure|n\/a|prefer not)/.test(v)) return false;

  if (v.startsWith("above") || v.startsWith("over") || v.startsWith("more than")) {
    const n = Number(v.replace(/[^0-9]/g, ""));
    return Number.isFinite(n) && n > 0 ? n >= THRESHOLD : true;
  }
  if (v.startsWith("below") || v.startsWith("under") || v.startsWith("less than")) {
    const n = Number(v.replace(/[^0-9]/g, ""));
    // "below 660" still leaves the lead under the stated ceiling — not a pass.
    return Number.isFinite(n) && n > 0 ? false : false;
  }

  // Yes/No answers only mean "above" when the question states the threshold.
  if (/^(yes|yep|yeah|y)\b/.test(v) || v === "true") {
    const askedAbove = /\b(\d{3})\b[^0-9]*(or above|or higher|\+|and above)/.test(
      rawName.toLowerCase().replace(/[_\-]+/g, " "),
    );
    if (askedAbove) {
      const m = rawName.replace(/[^0-9]/g, "");
      const n = Number(m);
      return Number.isFinite(n) && n > 0 ? n >= THRESHOLD : true;
    }
    return true;
  }
  if (/^(no|nope|n)\b/.test(v) || v === "false") return false;

  // "640+", "700 +", "680", "700-750"
  const nums = v.match(/\d{3}/g);
  if (nums?.length) {
    const low = Math.min(...nums.map(Number));
    return low >= THRESHOLD;
  }
  return null;
}

/** Scans a Meta lead's `field_data` array for a credit-score answer. */
export function readCreditScore(fieldData: unknown): CreditScoreRead {
  const fields = Array.isArray(fieldData) ? fieldData : [];
  for (const f of fields as any[]) {
    const name = String(f?.name ?? "");
    if (!isCreditField(name)) continue;
    const value = String(f?.values?.[0] ?? "");
    const read = readValue(value, name);
    if (read === null) continue;
    return { hasScore: true, isAbove: read };
  }
  return { hasScore: false, isAbove: false };
}
