import { cn } from "@/lib/utils";
import { Lock, Sparkles, Rocket, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type Status = "GREEN" | "YELLOW" | "RED" | "BLOCKED" | "NEW" | "LAUNCHING" | "RELAUNCH";

const statusConfig: Record<Status, { label: string; className: string; tooltip: string }> = {
  GREEN: {
    label: "GREEN",
    className: "bg-success/15 text-success border-success/30",
    tooltip: "On track — all KPIs within target range",
  },
  YELLOW: {
    label: "YELLOW",
    className: "bg-warning/15 text-warning border-warning/30",
    tooltip: "Needs attention — 1-2 KPIs outside target",
  },
  RED: {
    label: "RED",
    className: "bg-destructive/15 text-destructive border-destructive/30",
    tooltip: "Critical — major KPIs off target, action required",
  },
  BLOCKED: {
    label: "BLOCKED",
    className: "bg-muted text-muted-foreground border-border",
    tooltip: "Account blocked — cannot run campaigns",
  },
  NEW: {
    label: "NEW",
    className: "bg-primary/15 text-primary border-primary/30",
    tooltip: "Newly added — not yet launched",
  },
  LAUNCHING: {
    label: "LAUNCHING",
    className: "bg-purple/15 text-purple border-purple/30",
    tooltip: "Launching — first campaign being set up",
  },
  RELAUNCH: {
    label: "RELAUNCH",
    className: "bg-accent text-accent-foreground border-border",
    tooltip: "Relaunching — campaign is being restarted",
  },
};

export function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status] ?? statusConfig.GREEN;
  const Icon =
    status === "BLOCKED" ? Lock
    : status === "NEW" ? Sparkles
    : status === "LAUNCHING" ? Rocket
    : status === "RELAUNCH" ? RefreshCw
    : null;
  return (
    <Tooltip>
      <TooltipTrigger>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            config.className
          )}
        >
          {Icon && <Icon className="h-3 w-3" />}
          {config.label}
        </span>
      </TooltipTrigger>
      <TooltipContent>{config.tooltip}</TooltipContent>
    </Tooltip>
  );
}

