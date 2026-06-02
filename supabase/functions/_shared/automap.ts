// Shared bigram-Dice fuzzy match helpers used by Meta and GHL auto-mappers.
export function norm(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .replace(/\b(llc|inc|ltd|co|corp|the|mortgage|capital|group|agency|llp|plc)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function similarity(a: string, b: string): number {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bg = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const k = s.slice(i, i + 2);
      out.set(k, (out.get(k) || 0) + 1);
    }
    return out;
  };
  const A = bg(a), B = bg(b);
  let inter = 0, total = 0;
  for (const [k, v] of A) { total += v; if (B.has(k)) inter += Math.min(v, B.get(k)!); }
  for (const v of B.values()) total += v;
  return total === 0 ? 0 : (2 * inter) / total;
}

// Best client match given a list of candidate name strings to compare against.
export function bestClientMatch<T extends { id: number; name?: string | null; brand?: string | null; bm_account_name?: string | null }>(
  candidateNames: (string | null | undefined)[],
  clients: T[],
): { client: T | null; score: number } {
  let best: { client: T | null; score: number } = { client: null, score: 0 };
  for (const c of clients) {
    let score = 0;
    for (const n of candidateNames) {
      score = Math.max(
        score,
        similarity(n || "", c.name || ""),
        similarity(n || "", c.brand || ""),
        similarity(n || "", c.bm_account_name || ""),
      );
    }
    if (score > best.score) best = { client: c, score };
  }
  return best;
}
