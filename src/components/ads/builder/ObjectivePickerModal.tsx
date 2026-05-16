import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Magnet, Phone, MessageCircle, Globe, Megaphone, Home, DollarSign, Briefcase, X } from "lucide-react";
import type { Objective, SpecialAdCategory } from "./types";
import { useAdDraftStore } from "@/stores/adDraftStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const OBJECTIVES: { id: Objective; label: string; icon: any; description: string; available: boolean }[] = [
  { id: "leads", label: "Leads", icon: Magnet, description: "Capture leads with Instant Form", available: true },
  { id: "website", label: "Website", icon: Globe, description: "Drive traffic & conversions", available: true },
  { id: "awareness", label: "Awareness", icon: Megaphone, description: "Maximize reach & impressions", available: true },
  { id: "messages", label: "Messages", icon: MessageCircle, description: "Start chats on Messenger", available: true },
];

const LEAD_SUB = [
  { id: "form", label: "Leads", desc: "Use Meta's built in lead form to capture leads", icon: Magnet, available: true },
  { id: "phone", label: "Phone Calls", desc: "Let people call you directly", icon: Phone, available: false },
  { id: "message", label: "Lead Message", desc: "Collect leads through chat", icon: MessageCircle, available: false },
];

const SPECIAL_CATS: { id: NonNullable<SpecialAdCategory>; label: string; icon: any; desc: string }[] = [
  { id: "housing", label: "Housing", icon: Home, desc: "Real estate listings, mortgage loans" },
  { id: "credit", label: "Financial Products and Services", icon: DollarSign, desc: "Credit cards, auto loans, financing" },
  { id: "employment", label: "Employment", icon: Briefcase, desc: "Job offers, internships, certifications" },
];

export function ObjectivePickerModal({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const init = useAdDraftStore((s) => s.init);
  const [objective, setObjective] = useState<Objective>("leads");
  const [leadType] = useState("form");
  const [specialOn, setSpecialOn] = useState(false);
  const [specialCat, setSpecialCat] = useState<NonNullable<SpecialAdCategory>>("housing");
  const [countries] = useState<string[]>(["US"]);

  const handleCreate = () => {
    const sac = specialOn ? specialCat : null;
    init(objective, sac, countries);
    onOpenChange(false);
    navigate(`/ads/new?objective=${objective}${sac ? `&special=${sac}` : ""}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex flex-row items-center justify-between">
          <DialogTitle className="text-xl">Create a Facebook campaign</DialogTitle>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-6">
          {/* Objective tiles */}
          <div className="grid grid-cols-3 gap-3">
            {OBJECTIVES.slice(0, 3).map((o) => {
              const Icon = o.icon;
              const active = objective === o.id;
              return (
                <button
                  key={o.id}
                  onClick={() => setObjective(o.id)}
                  className={cn(
                    "rounded-xl border-2 p-4 text-left transition-all",
                    active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                  )}
                >
                  <Icon className="h-5 w-5 mb-2 text-primary" />
                  <div className="font-medium text-foreground">{o.label}</div>
                </button>
              );
            })}
          </div>

          {/* Messages secondary */}
          <button
            onClick={() => setObjective("messages")}
            className={cn(
              "w-full rounded-xl border-2 p-3 flex items-center gap-3 transition-all",
              objective === "messages" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
            )}
          >
            <MessageCircle className="h-5 w-5 text-primary" />
            <div className="text-left">
              <div className="font-medium text-foreground text-sm">Messages</div>
              <div className="text-xs text-muted-foreground">Click-to-Messenger conversations</div>
            </div>
          </button>

          {/* Sub-types for Leads */}
          {objective === "leads" && (
            <div>
              <div className="text-sm font-medium text-foreground mb-2">Collect Leads Instantly</div>
              <div className="grid grid-cols-3 gap-3">
                {LEAD_SUB.map((s) => {
                  const Icon = s.icon;
                  const active = s.available && leadType === s.id;
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "rounded-xl border-2 p-4 text-center",
                        active ? "border-primary bg-primary/5" : "border-border",
                        !s.available && "opacity-50",
                      )}
                    >
                      <Icon className="h-6 w-6 mx-auto mb-2 text-primary" />
                      <div className="text-sm font-medium text-foreground">{s.label}</div>
                      <div className="text-xs text-muted-foreground mt-1">{s.desc}</div>
                      {!s.available && <div className="text-[10px] text-muted-foreground mt-1">Coming soon</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Special Ad Categories */}
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-medium text-foreground">Special Ad Categories</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Declare if your ads relate to credit, employment, housing, social issues, elections or politics.
                </div>
              </div>
              <Switch checked={specialOn} onCheckedChange={setSpecialOn} />
            </div>
            {specialOn && (
              <div className="grid grid-cols-3 gap-3 mt-3">
                {SPECIAL_CATS.map((c) => {
                  const Icon = c.icon;
                  const active = specialCat === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSpecialCat(c.id)}
                      className={cn(
                        "rounded-lg border-2 p-3 text-center transition-all",
                        active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                      )}
                    >
                      <Icon className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
                      <div className="text-xs font-medium text-foreground">{c.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{c.desc}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Countries (simplified — US only for now) */}
          <div>
            <div className="text-sm font-medium text-foreground mb-2">Select countries where you are advertising</div>
            <div className="rounded-lg border border-border px-3 py-2 text-sm bg-muted/30">
              <span className="inline-block bg-primary/10 text-primary rounded px-2 py-0.5 text-xs">United States ✕</span>
              <span className="text-muted-foreground ml-2 text-xs">Multi-country support coming soon</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="text-xs text-muted-foreground">Ready to create your campaign</div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleCreate}>Create Campaign →</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
