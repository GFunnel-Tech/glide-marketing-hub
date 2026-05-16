import { useState } from "react";
import { Sparkles, Wand2, Image as ImageIcon, User, Layers, Smile, Upload } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { cn } from "@/lib/utils";

const TYPES = [
  { id: "ai_images", label: "AI Images", icon: ImageIcon, available: true },
  { id: "product_shot", label: "Product Shot", icon: ImageIcon, available: false, hint: "Requires Assets" },
  { id: "ai_avatar", label: "AI Avatar", icon: User, available: false, hint: "Requires Assets" },
  { id: "smart", label: "Smart Creatives", icon: Layers, available: false, hint: "Limited Templates" },
  { id: "memes", label: "Memes", icon: Smile, available: false },
  { id: "use_own", label: "Use My Own", icon: Upload, available: true },
];

export function GenerateMode({ onSwitchToManual }: { onSwitchToManual: () => void }) {
  const state = useAdDraftStore((s) => s.state);
  const patch = useAdDraftStore((s) => s.patch);
  const patchMany = useAdDraftStore((s) => s.patchMany);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<"ai_images" | "use_own">("ai_images");

  const generate = async () => {
    if (!state.genPrompt.trim()) { toast.error("Describe what you're advertising"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-ad-generate", {
        body: { prompt: state.genPrompt, objective: state.objective, generateImages: selectedType === "ai_images" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      patchMany({
        primaryTexts: data.primaryTexts?.length ? data.primaryTexts : state.primaryTexts,
        headlines: data.headlines ?? state.headlines,
        description: data.description ?? state.description,
        cta: data.cta ?? state.cta,
        media: data.images?.length ? data.images.map((u: string) => ({ id: crypto.randomUUID(), url: u, type: "image" as const })) : state.media,
      });
      toast.success("Generated! Switching to Manual mode to review.");
      onSwitchToManual();
    } catch (e: any) {
      toast.error(e.message || "Failed to generate");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-semibold text-foreground mb-2">1. Describe What You're Advertising</div>
        <Textarea
          value={state.genPrompt}
          onChange={(e) => patch("genPrompt", e.target.value)}
          placeholder="e.g. luxury modern home for sale in Atlanta — target first-time buyers, emphasize FHA financing"
          rows={4}
          className="text-sm"
        />
      </div>

      <div>
        <div className="text-sm font-semibold text-foreground mb-1">2. Choose creative type</div>
        <div className="text-xs text-muted-foreground mb-3">Pick one — you can customise further after generating</div>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const isSel = (t.id === selectedType);
            return (
              <button
                key={t.id}
                onClick={() => t.available && setSelectedType(t.id as any)}
                disabled={!t.available}
                className={cn(
                  "rounded-xl border-2 p-3 text-center transition-all",
                  isSel ? "border-primary bg-primary/5" : "border-border",
                  !t.available && "opacity-50 cursor-not-allowed",
                )}
              >
                <Icon className="h-5 w-5 mx-auto mb-1.5 text-primary" />
                <div className="text-xs font-medium text-foreground">{t.label}</div>
                {t.hint && <div className="text-[10px] text-warning mt-0.5">{t.hint}</div>}
                {!t.available && !t.hint && <div className="text-[10px] text-muted-foreground mt-0.5">Soon</div>}
              </button>
            );
          })}
        </div>
      </div>

      <Button onClick={generate} disabled={loading} className="w-full h-11 bg-gradient-to-r from-primary to-primary/80">
        <Sparkles className="h-4 w-4 mr-2" />
        {loading ? "Generating…" : "Generate"}
      </Button>
    </div>
  );
}
