import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MediaAsset } from "../types";

const ASPECTS = [
  { id: "1:1", label: "Square 1:1", box: "aspect-square" },
  { id: "4:5", label: "Portrait 4:5", box: "aspect-[4/5]" },
  { id: "9:16", label: "Story 9:16", box: "aspect-[9/16]" },
  { id: "1.91:1", label: "Landscape", box: "aspect-[1.91/1]" },
] as const;

const IDEAS = [
  "Friendly mortgage advisor in a bright modern office, warm natural light",
  "Happy young couple holding keys in front of their new suburban home",
  "Clean abstract financial background with soft blue gradients and subtle house icon",
  "Confident realtor handing over documents at a sunlit kitchen table",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (assets: MediaAsset[]) => void;
  remaining: number;
}

export function AiCreativeStudio({ open, onOpenChange, onAdd, remaining }: Props) {
  const { currentWorkspace } = useWorkspace();
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<string>("1:1");
  const [count, setCount] = useState(2);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ url: string; path: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const boxClass = ASPECTS.find((a) => a.id === aspect)?.box ?? "aspect-square";

  const generate = async () => {
    if (!currentWorkspace) return;
    if (prompt.trim().length < 3) {
      toast.error("Describe the creative you want first");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-creative-generate", {
        body: { workspaceId: currentWorkspace.id, prompt: prompt.trim(), aspect, n: count },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const imgs = (data?.images ?? []) as { url: string; path: string }[];
      if (imgs.length === 0) throw new Error("No images were generated");
      setResults((prev) => [...imgs, ...prev]);
      setSelected(new Set(imgs.map((i) => i.url)));
      toast.success(`Generated ${imgs.length} creative${imgs.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e?.message || "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  };

  const addSelected = () => {
    const picked = results.filter((r) => selected.has(r.url)).slice(0, Math.max(remaining, 0));
    if (picked.length === 0) {
      toast.error("Select at least one creative");
      return;
    }
    onAdd(
      picked.map((p) => ({
        id: crypto.randomUUID(),
        url: p.url,
        type: "image" as const,
        name: p.path.split("/").pop() ?? "ai-creative.png",
      })),
    );
    toast.success(`Added ${picked.length} creative${picked.length === 1 ? "" : "s"} to the ad`);
    onOpenChange(false);
    setResults([]);
    setSelected(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> AI creative studio
          </DialogTitle>
          <DialogDescription className="text-xs">
            Describe the image you want and we'll generate ad-ready creatives straight into this draft.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="e.g. Warm photo of a first-time home buyer couple receiving keys, bright natural light"
            className="text-sm"
            disabled={loading}
          />
          <div className="flex flex-wrap gap-1.5">
            {IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setPrompt(idea)}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                {idea.length > 46 ? `${idea.slice(0, 46)}…` : idea}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1.5">
              {ASPECTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAspect(a.id)}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                    aspect === a.id ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground",
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Variations</span>
              {[1, 2, 4].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCount(c)}
                  className={cn(
                    "h-7 w-7 rounded-md border text-[11px] font-medium",
                    count === c ? "border-primary bg-primary/5 text-primary" : "border-border",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={generate} disabled={loading} className="ml-auto min-w-[130px]">
              {loading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating…</> : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate</>}
            </Button>
          </div>

          {results.length > 0 && (
            <div className="grid grid-cols-4 gap-2 max-h-[40vh] overflow-y-auto pr-1">
              {results.map((r) => {
                const on = selected.has(r.url);
                return (
                  <button
                    key={r.url}
                    type="button"
                    onClick={() => toggle(r.url)}
                    className={cn(
                      "relative rounded-lg overflow-hidden border-2 bg-muted",
                      boxClass,
                      on ? "border-primary" : "border-transparent hover:border-border",
                    )}
                  >
                    <img src={r.url} alt="AI generated ad creative" className="w-full h-full object-cover" loading="lazy" />
                    {on && (
                      <span className="absolute top-1 right-1 rounded-full bg-primary text-primary-foreground p-0.5">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <span className="mr-auto text-[11px] text-muted-foreground self-center">
            {remaining} slot{remaining === 1 ? "" : "s"} left in this ad
          </span>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>Close</Button>
          <Button size="sm" onClick={addSelected} disabled={loading || selected.size === 0}>
            Add {selected.size > 0 ? selected.size : ""} to ad
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
