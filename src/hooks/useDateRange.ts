import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type DateRangePreset =
  | "today"
  | "7d"
  | "14d"
  | "30d"
  | "90d"
  | "mtd"
  | "last_month"
  | "custom";

export interface DateRange {
  from: Date;
  to: Date;
  preset: DateRangePreset;
}

const STORAGE_KEY = "mh.dateRange.v1";
const DEFAULT_PRESET: DateRangePreset = "7d";

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  mtd: "Month to date",
  last_month: "Last month",
  custom: "Custom range",
};

export function resolvePreset(preset: DateRangePreset, now = new Date()): { from: Date; to: Date } {
  const today = startOfDay(now);
  const todayEnd = endOfDay(now);
  switch (preset) {
    case "today":
      return { from: today, to: todayEnd };
    case "7d":
      return { from: startOfDay(addDays(today, -6)), to: todayEnd };
    case "14d":
      return { from: startOfDay(addDays(today, -13)), to: todayEnd };
    case "30d":
      return { from: startOfDay(addDays(today, -29)), to: todayEnd };
    case "90d":
      return { from: startOfDay(addDays(today, -89)), to: todayEnd };
    case "mtd": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(first), to: todayEnd };
    }
    case "last_month": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(first), to: endOfDay(last) };
    }
    default:
      return { from: startOfDay(addDays(today, -6)), to: todayEnd };
  }
}

const fmt = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const parse = (s: string | null): Date | null => {
  if (!s) return null;
  // YYYY-MM-DD must be parsed as LOCAL time (new Date("2026-06-10") is UTC midnight,
  // which shifts to the previous day in negative-UTC zones).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

interface Stored {
  preset: DateRangePreset;
  from?: string;
  to?: string;
}

function readStorage(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}
function writeStorage(s: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}

/**
 * Global date range, synced to URL (?preset=&from=&to=) and localStorage.
 * URL > storage > default.
 */
export function useDateRange() {
  const [params, setParams] = useSearchParams();

  const urlPreset = params.get("preset") as DateRangePreset | null;
  const urlFrom = parse(params.get("from"));
  const urlTo = parse(params.get("to"));

  const range = useMemo<DateRange>(() => {
    // URL has priority
    if (urlPreset === "custom" && urlFrom && urlTo) {
      return { preset: "custom", from: startOfDay(urlFrom), to: endOfDay(urlTo) };
    }
    if (urlPreset && urlPreset !== "custom") {
      const r = resolvePreset(urlPreset);
      return { preset: urlPreset, ...r };
    }
    const stored = readStorage();
    if (stored?.preset === "custom" && stored.from && stored.to) {
      const f = parse(stored.from)!;
      const t = parse(stored.to)!;
      return { preset: "custom", from: startOfDay(f), to: endOfDay(t) };
    }
    if (stored?.preset) {
      const r = resolvePreset(stored.preset);
      return { preset: stored.preset, ...r };
    }
    return { preset: DEFAULT_PRESET, ...resolvePreset(DEFAULT_PRESET) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPreset, params.get("from"), params.get("to")]);

  // persist whenever the range KEY changes (not on every render — Date instances
  // from resolvePreset() differ each render and would thrash localStorage).
  const rangeFromKey = fmt(range.from);
  const rangeToKey = fmt(range.to);
  useEffect(() => {
    writeStorage({
      preset: range.preset,
      from: range.preset === "custom" ? rangeFromKey : undefined,
      to: range.preset === "custom" ? rangeToKey : undefined,
    });
  }, [range.preset, rangeFromKey, rangeToKey]);

  const setPreset = useCallback(
    (preset: DateRangePreset) => {
      const next = new URLSearchParams(params);
      next.set("preset", preset);
      next.delete("from");
      next.delete("to");
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  const setCustom = useCallback(
    (from: Date, to: Date) => {
      const next = new URLSearchParams(params);
      next.set("preset", "custom");
      next.set("from", fmt(from));
      next.set("to", fmt(to));
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  // Stable cache key for TanStack Query
  const queryKey = useMemo(
    () => [range.preset, fmt(range.from), fmt(range.to)] as const,
    [range.preset, range.from, range.to]
  );

  return {
    range,
    preset: range.preset,
    from: range.from,
    to: range.to,
    fromISO: range.from.toISOString(),
    toISO: range.to.toISOString(),
    setPreset,
    setCustom,
    queryKey,
    label: PRESET_LABELS[range.preset],
  };
}
