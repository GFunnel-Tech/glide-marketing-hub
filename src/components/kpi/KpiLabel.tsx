import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { findKpi, type KpiDef } from "@/lib/kpiGlossary";

interface KpiLabelProps {
  label: string;
  /** Override the lookup key if `label` doesn't match (e.g. "Form CVR" → "formcvr"). */
  kpiKey?: string;
  /** Custom definition for ad-hoc / custom KPIs not in the glossary. */
  def?: Partial<KpiDef>;
  className?: string;
  iconClassName?: string;
  showIcon?: boolean;
}

/**
 * Renders a KPI label with an info tooltip explaining the metric,
 * its formula, and (when available) a healthy-range benchmark.
 */
export function KpiLabel({
  label,
  kpiKey,
  def,
  className,
  iconClassName,
  showIcon = true,
}: KpiLabelProps) {
  const found = findKpi(kpiKey ?? label);
  const k: Partial<KpiDef> = { ...found, ...def };

  if (!k.description) {
    return <span className={className}>{label}</span>;
  }

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex items-center gap-1 cursor-help", className)}>
          {label}
          {showIcon && (
            <HelpCircle className={cn("h-3 w-3 opacity-50 hover:opacity-100", iconClassName)} />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left">
        <div className="space-y-1.5">
          <div className="font-semibold text-foreground">
            {k.name ?? label}
            {k.short && k.short !== k.name && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">({k.short})</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{k.description}</p>
          {k.formula && (
            <div className="text-xs">
              <span className="text-muted-foreground">Formula: </span>
              <span className="font-mono text-foreground">{k.formula}</span>
            </div>
          )}
          {k.benchmark && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Benchmark: </span>
              {k.benchmark}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
