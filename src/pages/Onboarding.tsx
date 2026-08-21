import { useState } from "react";
import { Link } from "react-router-dom";
import { useOnboarding } from "@/hooks/useDatabase";
import { cn } from "@/lib/utils";
import { UserPlus, CheckCircle, X, Images, Wand2 } from "lucide-react";


const phases = [
  { num: 1, label: "Access", color: "border-t-blue-500" },
  { num: 2, label: "Tracking", color: "border-t-purple-500" },
  { num: 3, label: "Strategy", color: "border-t-amber-500" },
  { num: 4, label: "Launch", color: "border-t-orange-500" },
  { num: 5, label: "Optimizing", color: "border-t-green-500" },
  { num: 6, label: "Testing", color: "border-t-teal-500" },
];

const phaseChecklist: Record<number, string[]> = {
  1: ["GFunnel partner access", "Instagram account connected", "Business Manager access", "Ad account access", "Page access"],
  2: ["Pixel installed", "CAPI configured", "Lead events verified", "Domain verified", "Conversion API test"],
  3: ["Target audience defined", "Creative brief approved", "Form structure decided", "Budget approved", "Campaign structure"],
  4: ["Campaigns created", "Ads submitted for review", "Forms linked to GHL", "Automations active", "Go-live confirmed"],
  5: ["First 48hr check", "CPL baseline set", "Audience refinement", "Creative rotation", "Budget optimization"],
  6: ["A/B test launched", "Form variant test", "Audience split test", "Results analyzed", "Final report"],
};

interface OnboardingClient {
  id: string;
  client_id: number;
  name: string;
  brand: string;
  phase: number;
  days_in_phase: number;
  owner: string;
  blockers: string[];
}

export default function Onboarding() {
  const { data: onboardingClients = [], isLoading } = useOnboarding();
  const [selectedClient, setSelectedClient] = useState<OnboardingClient | null>(null);

  const totalOnboarding = onboardingClients.length;
  const blocked = onboardingClients.filter(c => c.blockers.length > 0).length;
  const onTrack = onboardingClients.filter(c => c.blockers.length === 0).length;
  const avgDays = totalOnboarding > 0 ? Math.round(onboardingClients.reduce((s, c) => s + c.days_in_phase, 0) / totalOnboarding) : 0;

  if (isLoading) return <div className="text-center py-10 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Client Onboarding</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/onboarding/assets"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent flex items-center gap-2"
          >
            <Images className="h-4 w-4" />Media & assets
          </Link>
          <button
            onClick={() => setNewClientOpen(true)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
          >
            <UserPlus className="h-4 w-4" />New Client
          </button>

        </div>
      </div>


      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Onboarding", value: totalOnboarding },
          { label: "Blocked", value: blocked, color: "text-destructive" },
          { label: "On Track", value: onTrack, color: "text-success" },
          { label: "Avg Days to Launch", value: avgDays },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className={cn("text-3xl font-bold tabular-nums mt-1", s.color || "text-foreground")}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {phases.map(phase => {
          const clientsInPhase = onboardingClients.filter(c => c.phase === phase.num);
          return (
            <div key={phase.num} className={cn("min-w-[220px] flex-1 rounded-lg border border-border bg-card border-t-4", phase.color)}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h4 className="text-xs font-semibold text-foreground">Phase {phase.num} — {phase.label}</h4>
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs text-muted-foreground">{clientsInPhase.length}</span>
              </div>
              <div className="p-3 space-y-2 min-h-[120px]">
                {clientsInPhase.map(client => (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClient(client)}
                    className="w-full rounded-lg border border-border bg-background p-3 text-left hover:border-primary/40 transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground">{client.name}</p>
                    <p className="text-xs text-muted-foreground">{client.brand}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs bg-accent rounded px-1.5 py-0.5 text-muted-foreground">{client.owner}</span>
                      <span className="text-xs text-muted-foreground">Day {client.days_in_phase}</span>
                    </div>
                    {client.blockers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {client.blockers.map((b, i) => (
                          <span key={i} className="rounded bg-destructive/15 text-destructive px-1.5 py-0.5 text-[10px] font-medium">{b}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-1 mt-2">
                      {phases.map((_, i) => (
                        <div key={i} className={cn("h-1.5 flex-1 rounded-full", i < client.phase ? "bg-primary" : "bg-accent")} />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selectedClient && (
        <>
          <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" onClick={() => setSelectedClient(null)} />
          <div className="fixed right-0 top-0 z-50 h-full w-[520px] border-l border-border bg-card shadow-2xl overflow-auto animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{selectedClient.name}</h2>
                <p className="text-sm text-muted-foreground">{selectedClient.brand} · Phase {selectedClient.phase}</p>
              </div>
              <button onClick={() => setSelectedClient(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <Link
                to={`/onboarding/wizard?clientId=${selectedClient.client_id}`}
                className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Wand2 className="h-4 w-4" />Open onboarding wizard
              </Link>

              {phases.map(phase => {
                const isComplete = phase.num < selectedClient.phase;
                const isCurrent = phase.num === selectedClient.phase;
                const items = phaseChecklist[phase.num] || [];
                return (
                  <div key={phase.num} className={cn("rounded-lg border p-4", isCurrent ? "border-primary/40 bg-primary/5" : "border-border")}>
                    <div className="flex items-center gap-2 mb-2">
                      {isComplete ? <CheckCircle className="h-4 w-4 text-success" /> : isCurrent ? <div className="h-4 w-4 rounded-full border-2 border-primary" /> : <div className="h-4 w-4 rounded-full border-2 border-border" />}
                      <h4 className={cn("text-sm font-semibold", isComplete ? "text-success" : "text-foreground")}>Phase {phase.num} — {phase.label}</h4>
                    </div>
                    <div className="space-y-1 ml-6">
                      {items.map((item, i) => (
                        <label key={i} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" defaultChecked={isComplete || (isCurrent && i < 2)} className="rounded border-border" />
                          <span className="text-foreground">{item}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
