import { useAdDraftStore } from "@/stores/adDraftStore";
import { Section } from "../shared/Section";
import { DollarSign, MousePointerClick, Users, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

export function BudgetSection() {
  const state = useAdDraftStore((s) => s.state);
  const patch = useAdDraftStore((s) => s.patch);
  const [forecastTab, setForecastTab] = useState<"daily" | "weekly" | "monthly">("monthly");

  // Heuristic forecast from budget (no live API call here — keeps it simple & fast)
  const forecast = useMemo(() => {
    const mult = forecastTab === "daily" ? 1 : forecastTab === "weekly" ? 7 : 30;
    const spendLo = state.budgetAmount * 0.95 * mult;
    const spendHi = state.budgetAmount * 1.05 * mult;
    const cpc = state.specialAdCategory === "housing" ? 1.8 : 1.2;
    const clicksLo = Math.floor(spendLo / (cpc * 1.5));
    const clicksHi = Math.floor(spendHi / cpc);
    const reachLo = Math.floor(spendLo * 40);
    const reachHi = Math.floor(spendHi * 70);
    return { spendLo, spendHi, clicksLo, clicksHi, reachLo, reachHi };
  }, [state.budgetAmount, forecastTab, state.specialAdCategory]);

  return (
    <Section title="Budget" icon={<DollarSign className="h-4 w-4 text-primary" />}>
      <div className="flex gap-2">
        {(["daily", "lifetime"] as const).map((t) => (
          <button
            key={t}
            onClick={() => patch("budgetType", t)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
              state.budgetType === t ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-muted rounded-l-md px-3 py-2 text-sm font-medium">$</div>
        <Input
          type="number"
          value={state.budgetAmount}
          onChange={(e) => patch("budgetAmount", Number(e.target.value) || 0)}
          className="rounded-l-none -ml-2 h-10"
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">{state.currency} / {state.budgetType === "daily" ? "day" : "total"}</span>
      </div>

      {/* Forecasted Results card */}
      <div className="rounded-lg border border-border bg-gradient-to-br from-primary/5 to-transparent p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          <div className="text-sm font-semibold text-foreground">Forecasted Results</div>
        </div>
        <div className="text-xs text-muted-foreground mb-3">A rough range based on your daily budget. Actual results may vary.</div>

        <div className="flex gap-1 mb-3">
          {(["daily", "weekly", "monthly"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setForecastTab(t)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                forecastTab === t ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat icon={<DollarSign className="h-3.5 w-3.5" />} label="Spend" value={`$${Math.round(forecast.spendLo)} - $${Math.round(forecast.spendHi)}`} />
          <Stat icon={<MousePointerClick className="h-3.5 w-3.5" />} label="Clicks" value={`${forecast.clicksLo} - ${forecast.clicksHi}`} />
          <Stat icon={<Users className="h-3.5 w-3.5" />} label="Reach" value={`${formatK(forecast.reachLo)} - ${formatK(forecast.reachHi)}`} />
        </div>
      </div>
    </Section>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-muted-foreground text-[11px] mb-0.5">{icon}{label}:</div>
      <div className="text-xs font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}
