import { FlaskConical, GitBranch, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";

const funnelStages = [
  { label: "Impressions", hint: "Reach & frequency by placement" },
  { label: "Clicks", hint: "CTR and cost per click" },
  { label: "Leads", hint: "Form fills, calls, DMs" },
  { label: "Qualified", hint: "Credit / intent scoring" },
  { label: "Appointments", hint: "Booked & showed" },
  { label: "Closed", hint: "Funded revenue & ROAS" },
];

export default function Sandbox() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Sandbox
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            A safe space to prototype new reporting before it ships to clients.
          </p>
        </div>
      </div>

      <Card className="p-6 rounded-xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <GitBranch className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                Complete Funnel Analytics
                <span className="text-[10px] uppercase tracking-wide bg-gradient-primary text-primary-foreground rounded px-1.5 py-0.5 font-medium leading-none">
                  Coming Soon
                </span>
              </h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                End-to-end attribution from ad impression through funded deal, stitched across
                Meta, GHL and your closing data — with stage-by-stage drop-off and cost per stage.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {funnelStages.map((stage, i) => (
            <div
              key={stage.label}
              className="relative rounded-xl border border-border bg-muted/30 p-4 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{stage.label}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stage.hint}</p>
              <div className="mt-3 h-2 rounded-full bg-border/70 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/30"
                  style={{ width: `${100 - i * 14}%` }}
                />
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
                <Lock className="h-4 w-4 text-muted-foreground/70" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
