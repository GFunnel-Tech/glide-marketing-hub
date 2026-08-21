import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, LayoutTemplate, Edit3, Magnet, Globe, Megaphone, MessageCircle, Home, DollarSign, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClients } from "@/hooks/useDatabase";
import { clientDisplayName } from "@/lib/clientName";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { TemplateMode } from "@/components/ads/builder/TemplateMode";
import { GenerateLaunchPanel } from "@/components/launch/GenerateLaunchPanel";
import { PlanApproval } from "@/components/launch/PlanApproval";
import { planToBuilderState, type CampaignPlan } from "@/components/launch/planTypes";
import type { Objective, SpecialAdCategory, SpecialAdCategoryValue } from "@/components/ads/builder/types";

type Tab = "generate" | "template" | "manual";

const OBJECTIVES: { id: Objective; label: string; icon: any; desc: string }[] = [
  { id: "leads", label: "Leads", icon: Magnet, desc: "Instant lead forms" },
  { id: "website", label: "Website", icon: Globe, desc: "Traffic & conversions" },
  { id: "awareness", label: "Awareness", icon: Megaphone, desc: "Reach & impressions" },
  { id: "messages", label: "Messages", icon: MessageCircle, desc: "Messenger chats" },
];

const SPECIAL: { id: SpecialAdCategoryValue; label: string; icon: any }[] = [
  { id: "housing", label: "Housing", icon: Home },
  { id: "credit", label: "Financial", icon: DollarSign },
  { id: "employment", label: "Employment", icon: Briefcase },
];

export default function Launch() {
  const navigate = useNavigate();
  const init = useAdDraftStore((s) => s.init);
  const patch = useAdDraftStore((s) => s.patch);
  const { data: clients = [] } = useClients();
  const hydrate = useAdDraftStore((s) => s.hydrate);

  const [tab, setTab] = useState<Tab>("generate");
  const [objective, setObjective] = useState<Objective>("leads");
  const [special, setSpecial] = useState<SpecialAdCategory>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [plan, setPlan] = useState<CampaignPlan | null>(null);

  // Keep the shared draft store in sync so Template mode filters correctly
  useEffect(() => {
    init(objective, special, ["US"]);
    patch("clientId", clientId);
  }, [objective, special.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { patch("clientId", clientId); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toBuilder = () => navigate(`/ads/new?objective=${objective}${special.length ? `&special=${special.join(",")}` : ""}`);

  const approve = () => {
    if (!plan) return;
    hydrate(null, planToBuilderState(plan, objective, special, clientId));
    toBuilder();
  };

  const toggleSpecial = (id: SpecialAdCategoryValue) =>
    setSpecial((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const headerGradient = tab === "generate"
    ? "from-violet-600 to-fuchsia-500"
    : tab === "template" ? "from-blue-600 to-indigo-500" : "from-primary to-primary/70";

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className={cn("rounded-2xl bg-gradient-to-r px-5 py-4 text-primary-foreground", headerGradient)}>
        <div className="text-base font-semibold">New launch</div>
        <p className="text-sm opacity-90">
          {tab === "generate" && "Fill in these steps and we'll build the campaign, ad sets and ads with AI — then you approve and edit."}
          {tab === "template" && "Start from a saved campaign template and tweak it before publishing."}
          {tab === "manual" && "Build everything yourself in the full ad builder."}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4 items-start">
        {/* Left column */}
        <Card className="p-3 rounded-xl space-y-4 lg:sticky lg:top-4">
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">Mode</div>
            <div className="space-y-1">
              <SideTab label="Generate" desc="AI builds it" icon={<Sparkles className="h-4 w-4" />} active={tab === "generate"} onClick={() => setTab("generate")} />
              <SideTab label="Template" desc="Start from saved" icon={<LayoutTemplate className="h-4 w-4" />} active={tab === "template"} onClick={() => setTab("template")} />
              <SideTab label="Manual" desc="Full builder" icon={<Edit3 className="h-4 w-4" />} active={tab === "manual"} onClick={() => setTab("manual")} />
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">Client account</div>
            <Select value={clientId ? String(clientId) : "none"} onValueChange={(v) => setClientId(v === "none" ? null : Number(v))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select client account" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="none">No client (internal)</SelectItem>
                {clients.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{clientDisplayName(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">Objective</div>
            <div className="space-y-1">
              {OBJECTIVES.map((o) => {
                const Icon = o.icon;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setObjective(o.id)}
                    className={cn(
                      "w-full flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-all",
                      objective === o.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/60",
                    )}
                  >
                    <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{o.label}</span>
                      <span className="block text-[11px] text-muted-foreground truncate">{o.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">Special ad categories</div>
            <div className="flex flex-wrap gap-1.5">
              {SPECIAL.map((s) => {
                const Icon = s.icon;
                const on = special.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSpecial(s.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                      on ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" /> {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Right column */}
        <Card className="p-5 rounded-xl min-h-[420px]">
          {tab === "generate" && (
            plan ? (
              <PlanApproval plan={plan} onChange={setPlan} onRestart={() => setPlan(null)} onApprove={approve} />
            ) : (
              <GenerateLaunchPanel
                objective={objective}
                specialAdCategory={special}
                clientId={clientId}
                onGenerated={setPlan}
              />
            )
          )}

          {tab === "template" && <TemplateMode onApplied={toBuilder} />}

          {tab === "manual" && (
            <div className="text-center py-8 space-y-3">
              <Edit3 className="h-8 w-8 mx-auto text-muted-foreground" />
              <div className="text-sm font-medium text-foreground">Build it yourself</div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Opens the full builder with ad set sidebar, creative, targeting, budget and live preview.
              </p>
              <Button onClick={toBuilder} className="h-10">Open manual builder</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function SideTab({ label, desc, icon, active, onClick }: { label: string; desc: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className={cn("block text-sm font-medium", active ? "text-primary" : "text-foreground")}>{label}</span>
        <span className="block text-[11px] text-muted-foreground truncate">{desc}</span>
      </span>
    </button>
  );
}

