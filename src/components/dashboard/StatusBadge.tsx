import { cn } from "@/lib/utils";
import { Lock, Sparkles, Rocket, RefreshCw, Clock, CheckCircle2, GraduationCap, AlertOctagon, Ban } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type Status =
  | "GREEN" | "YELLOW" | "RED" | "BLOCKED"
  | "NEW" | "PENDING_APPROVAL" | "SETUP_COMPLETE"
  | "LAUNCHING" | "LEARNING" | "RELAUNCH"
  | "PENDING_CANCELLATION" | "CANCELLED";

const statusConfig: Record<Status, { label: string; className: string; tooltip: string }> = {
  NEW:                  { label: "NEW",                  className: "bg-primary/15 text-primary border-primary/30",               tooltip: "Newly added — not yet launched" },
  PENDING_APPROVAL:     { label: "PENDING APPROVAL",     className: "bg-warning/15 text-warning border-warning/30",               tooltip: "Awaiting client approval on ads" },
  SETUP_COMPLETE:       { label: "SETUP COMPLETE",       className: "bg-success/15 text-success border-success/30",               tooltip: "Onboarding done — ready to launch" },
  LAUNCHING:            { label: "LAUNCHING",            className: "bg-purple/15 text-purple border-purple/30",                  tooltip: "First campaign being set up" },
  LEARNING:             { label: "LEARNING",             className: "bg-primary/15 text-primary border-primary/30",               tooltip: "In learning phase — first 7 days after launch" },
  RELAUNCH:             { label: "RELAUNCH",             className: "bg-accent text-accent-foreground border-border",             tooltip: "Campaign is being restarted" },
  RED:                  { label: "RED",                  className: "bg-destructive/15 text-destructive border-destructive/30",   tooltip: "Critical — major KPIs off target" },
  YELLOW:               { label: "YELLOW",               className: "bg-warning/15 text-warning border-warning/30",               tooltip: "Needs attention — 1-2 KPIs outside target" },
  GREEN:                { label: "GREEN",                className: "bg-success/15 text-success border-success/30",               tooltip: "On track — all KPIs within target" },
  PENDING_CANCELLATION: { label: "PENDING CANCELLATION", className: "bg-warning/15 text-warning border-warning/30",               tooltip: "Client has requested cancellation" },
  CANCELLED:            { label: "CANCELLED",            className: "bg-muted text-muted-foreground border-border line-through",  tooltip: "Account cancelled" },
  BLOCKED:              { label: "BLOCKED",              className: "bg-muted text-muted-foreground border-border",               tooltip: "Account blocked — cannot run campaigns" },
};

const iconFor: Partial<Record<Status, any>> = {
  BLOCKED: Lock,
  NEW: Sparkles,
  PENDING_APPROVAL: Clock,
  SETUP_COMPLETE: CheckCircle2,
  LAUNCHING: Rocket,
  LEARNING: GraduationCap,
  RELAUNCH: RefreshCw,
  PENDING_CANCELLATION: AlertOctagon,
  CANCELLED: Ban,
};

export function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status] ?? statusConfig.GREEN;
  const Icon = iconFor[status];
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
