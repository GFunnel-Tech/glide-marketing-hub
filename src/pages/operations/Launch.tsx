import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, LayoutTemplate, Edit3, Magnet, Globe, Megaphone, MessageCircle, Home, DollarSign, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  const hydrate = useAdDraftStore((s) => s.hydrate);

  const [tab, setTab] = useState<Tab>("generate");
  const [objective, setObjective] = useState<Objective>("leads");
  const [special, setSpecial] = useState<SpecialAdCategory>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [plan, setPlan] = useState<CampaignPlan | null>(null);

  // Keep the shared draft store in sync so Template mode filters correctly
  useEffect(() => { init(objective, special, ["US"]); }, [objective, special.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="max-w-4xl mx-auto space-y-5">
      <div className={cn("rounded-2xl bg-gradient-to-r px-5 py-4 text-primary-foreground space-y-3", headerGradient)}>
        <div className="inline-flex items-center gap-1 bg-white/15 rounded-lg p-1">
          <TabBtn label="Generate" icon={<Sparkles className="h-4 w-4" />} active={tab === "generate"} onClick={() => setTab("generate")} />
          <TabBtn label="Template" icon={<LayoutTemplate className="h-4 w-4" />} active={tab === "template"} onClick={() => setTab("template")} />
          <TabBtn label="Manual" icon={<Edit3 className="h-4 w-4" />} active={tab === "manual"} onClick={() => setTab("manual")} />
        </div>
        <p className="text-sm opacity-90">
          {tab === "generate" && "Fill in these steps and we'll build the campaign, ad sets and ads with AI — then you approve and edit."}
          {tab === "template" && "Start from a saved campaign template and tweak it before publishing."}
          {tab === "manual" && "Build everything yourself in the full ad builder."}
        </p>
      </div>

      <Card className="p-4 rounded-xl space-y-3">
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Objective</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {OBJECTIVES.map((o) => {
              const Icon = o.icon;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setObjective(o.id)}
                  className={cn(
                    "rounded-xl border-2 p-3 text-left transition-all",
                    objective === o.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                  )}
                >
                  <Icon className="h-4 w-4 text-primary mb-1.5" />
                  <div className="text-sm font-medium text-foreground">{o.label}</div>
                  <div className="text-[11px] text-muted-foreground">{o.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Special ad categories</div>
          <div className="flex flex-wrap gap-2">
            {SPECIAL.map((s) => {
              const Icon = s.icon;
              const on = special.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSpecial(s.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
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

      <Card className="p-5 rounded-xl">
        {tab === "generate" && (
          plan ? (
            <PlanApproval plan={plan} onChange={setPlan} onRestart={() => setPlan(null)} onApprove={approve} />
          ) : (
            <GenerateLaunchPanel
              objective={objective}
              specialAdCategory={special}
              clientId={clientId}
              onClientChange={setClientId}
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
  );
}

function TabBtn({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-white text-foreground shadow-sm" : "text-white/85 hover:bg-white/10",
      )}
    >
      {icon} {label}
    </button>
  );
}
