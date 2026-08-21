import { useState } from "react";
import { Sparkles, Image as ImageIcon, User, Layers, Smile, Upload, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useClients } from "@/hooks/useDatabase";
import { clientDisplayName } from "@/lib/clientName";
import type { CampaignPlan } from "./planTypes";
import type { Objective, SpecialAdCategory } from "@/components/ads/builder/types";

const TYPES = [
  { id: "ai_images", label: "AI Images", icon: ImageIcon, available: true },
  { id: "product_ads", label: "Product Ads", icon: Layers, available: false, hint: "Requires Assets" },
  { id: "ai_avatar", label: "AI Avatar", icon: User, available: false, hint: "Requires Assets" },
  { id: "smart", label: "Smart Creatives", icon: Layers, available: false, hint: "Limited Templates" },
  { id: "memes", label: "Memes", icon: Smile, available: false },
  { id: "use_own", label: "Use My Own", icon: Upload, available: true },
];

interface Props {
  objective: Objective;
  specialAdCategory: SpecialAdCategory;
  clientId: number | null;
  onClientChange: (id: number | null) => void;
  onGenerated: (plan: CampaignPlan) => void;
}

export function GenerateLaunchPanel({ objective, specialAdCategory, clientId, onClientChange, onGenerated }: Props) {
  const { data: clients = [] } = useClients();
  const [prompt, setPrompt] = useState("");
  const [creativeType, setCreativeType] = useState<"ai_images" | "use_own">("ai_images");
  const [budget, setBudget] = useState(50);
  const [adSetCount, setAdSetCount] = useState(2);
  const [adsPerSet, setAdsPerSet] = useState(2);
  const [loading, setLoading] = useState(false);

  const selectedClient = clients.find((c: any) => c.id === clientId);

  const generate = async () => {
    if (!prompt.trim()) { toast.error("Describe what you're advertising"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-campaign-generate", {
        body: {
          prompt,
          objective,
          budget,
          adSetCount,
          adsPerSet,
          specialAdCategory,
          generateImages: creativeType === "ai_images",
          businessName: selectedClient ? clientDisplayName(selectedClient as any) : "",
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      onGenerated(data as CampaignPlan);
      toast.success("Campaign built — review and approve below");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate campaign");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Client</Label>
          <Select value={clientId ? String(clientId) : "none"} onValueChange={(v) => onClientChange(v === "none" ? null : Number(v))}>
            <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="none">No client</SelectItem>
              {clients.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>{clientDisplayName(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Total daily budget (USD)</Label>
          <Input type="number" min={5} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold text-foreground mb-2">1. Describe what you're advertising</div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="e.g. FHA mortgage refinance for homeowners in Texas — emphasise cash-out options and fast pre-approval"
          className="text-sm"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Ad sets to build</Label>
          <Select value={String(adSetCount)} onValueChange={(v) => setAdSetCount(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n} ad set{n > 1 ? "s" : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Ads per ad set</Label>
          <Select value={String(adsPerSet)} onValueChange={(v) => setAdsPerSet(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n} ad{n > 1 ? "s" : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold text-foreground mb-1">2. Choose creative type</div>
        <div className="text-xs text-muted-foreground mb-3">Pick one — you can customise further after generating</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const isSel = t.id === creativeType;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => t.available && setCreativeType(t.id as any)}
                disabled={!t.available}
                className={cn(
                  "rounded-xl border-2 p-3 text-center transition-all",
                  isSel ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                  !t.available && "opacity-50 cursor-not-allowed",
                )}
              >
                <Icon className="h-5 w-5 mx-auto mb-1.5 text-primary" />
                <div className="text-xs font-medium text-foreground">{t.label}</div>
                {t.hint && <div className="text-[10px] text-warning mt-0.5">{t.hint}</div>}
              </button>
            );
          })}
        </div>
      </div>

      <Button onClick={generate} disabled={loading} className="w-full h-11 bg-gradient-to-r from-primary to-primary/80">
        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
        {loading ? "Building campaign, ad sets & ads…" : "Generate campaign"}
      </Button>
    </div>
  );
}
