import { useState } from "react";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { Section } from "../shared/Section";
import { MediaUploader } from "../shared/MediaUploader";
import { AiCreativeStudio } from "../shared/AiCreativeStudio";
import { MediaLibraryDialog } from "@/components/ads/media/MediaLibraryDialog";
import { MediaStudioDialog } from "@/components/ads/media/MediaStudioDialog";
import type { StudioSource } from "@/components/ads/media/studio/ImageEditor";
import { Palette, Plus, X, Sparkles, FolderOpen, Wand2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CTA_OPTIONS, type CreativeType, type MediaAsset } from "../types";


const TYPES: { id: CreativeType; label: string; available: boolean }[] = [
  { id: "dynamic", label: "Dynamic Ad", available: true },
  { id: "standard", label: "Standard Ad", available: true },
  { id: "carousel", label: "Carousel", available: false },
];

export function CreativeSection() {
  const state = useAdDraftStore((s) => s.state);
  const patch = useAdDraftStore((s) => s.patch);
  const [studioOpen, setStudioOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSources, setEditorSources] = useState<StudioSource[]>([]);

  const addAssets = (assets: { url: string; name: string; type: "image" | "video" }[]) => {
    const next: MediaAsset[] = assets.map((a) => ({
      id: crypto.randomUUID(),
      url: a.url,
      type: a.type,
      name: a.name,
      thumbnail: a.type === "image" ? a.url : undefined,
    }));
    patch("media", [...state.media, ...next].slice(0, 10));
  };

  const openEditorWith = (assets: StudioSource[]) => {
    if (!assets.length) return;
    setEditorSources(assets);
    setLibraryOpen(false);
    setEditorOpen(true);
  };


  return (
    <Section title="Creative" icon={<Palette className="h-4 w-4 text-primary" />}>
      <div className="grid grid-cols-3 gap-2">
        {TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => t.available && patch("creativeType", t.id)}
            disabled={!t.available}
            className={cn(
              "rounded-lg border-2 px-3 py-2.5 text-xs font-medium transition-all",
              state.creativeType === t.id ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground",
              !t.available && "opacity-50 cursor-not-allowed",
            )}
          >
            {t.label}{!t.available && <div className="text-[10px] mt-0.5">Soon</div>}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground">{state.media.length} / 10 images and videos. {state.creativeType === "dynamic" && "We'll rotate & learn."}</div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setStudioOpen(true)}
          disabled={state.media.length >= 10}
        >
          <Sparkles className="h-3 w-3 mr-1.5 text-primary" /> Generate with AI
        </Button>
      </div>

      <MediaUploader value={state.media} onChange={(v) => patch("media", v)} max={10} accept="both" label="Add" />

      <AiCreativeStudio
        open={studioOpen}
        onOpenChange={setStudioOpen}
        remaining={Math.max(10 - state.media.length, 0)}
        onAdd={(assets) => patch("media", [...state.media, ...assets].slice(0, 10))}
      />


      {/* Caption (above media) */}
      <div>
        <label className="text-xs font-medium text-foreground">Caption (above media)</label>
        <Textarea
          value={state.caption}
          onChange={(e) => patch("caption", e.target.value)}
          placeholder="Add the caption which comes before the graphics/media content"
          rows={2}
          className="text-sm mt-1.5"
        />
      </div>

      {/* Primary Texts */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-foreground">Primary Texts</label>
        </div>
        <div className="space-y-2">
          {state.primaryTexts.map((txt, i) => (
            <div key={i} className="flex gap-2">
              <Textarea
                value={txt}
                onChange={(e) => {
                  const next = [...state.primaryTexts]; next[i] = e.target.value; patch("primaryTexts", next);
                }}
                placeholder="Enter primary text"
                rows={2}
                className="text-sm"
              />
              {state.primaryTexts.length > 1 && (
                <button onClick={() => patch("primaryTexts", state.primaryTexts.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {state.primaryTexts.length < 5 && (
          <Button variant="ghost" size="sm" className="mt-1.5 text-xs" onClick={() => patch("primaryTexts", [...state.primaryTexts, ""])}>
            <Plus className="h-3 w-3 mr-1" /> Add Primary Text
          </Button>
        )}
      </div>

      {/* Headlines */}
      <div>
        <label className="text-xs font-medium text-foreground">Headlines (Optional)</label>
        <div className="space-y-2 mt-1.5">
          {state.headlines.map((h, i) => (
            <div key={i} className="flex gap-2">
              <Input value={h} onChange={(e) => { const n = [...state.headlines]; n[i] = e.target.value; patch("headlines", n); }} placeholder="e.g. Get a Free Quote" className="text-sm" />
              <button onClick={() => patch("headlines", state.headlines.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        {state.headlines.length < 5 && (
          <Button variant="ghost" size="sm" className="mt-1.5 text-xs" onClick={() => patch("headlines", [...state.headlines, ""])}>
            <Plus className="h-3 w-3 mr-1" /> Add Headline
          </Button>
        )}
      </div>

      {/* Descriptions */}
      <div>
        <label className="text-xs font-medium text-foreground">Descriptions (Optional)</label>
        <div className="space-y-2 mt-1.5">
          {state.descriptions.map((d, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={d}
                onChange={(e) => { const n = [...state.descriptions]; n[i] = e.target.value; patch("descriptions", n); }}
                placeholder="Add supporting text to reinforce your headline"
                className="text-sm"
              />
              <button onClick={() => patch("descriptions", state.descriptions.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        {state.descriptions.length < 5 && (
          <Button variant="ghost" size="sm" className="mt-1.5 text-xs" onClick={() => patch("descriptions", [...state.descriptions, ""])}>
            <Plus className="h-3 w-3 mr-1" /> Add Description
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-foreground">Call To Action</label>
          <Select value={state.cta} onValueChange={(v) => patch("cta", v as any)}>
            <SelectTrigger className="h-9 mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CTA_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground">Display Link</label>
          <Input value={state.displayLink} onChange={(e) => patch("displayLink", e.target.value)} placeholder="example.com" className="h-9 mt-1.5 text-sm" />
        </div>
      </div>

      {state.objective !== "leads" && (
        <div>
          <label className="text-xs font-medium text-foreground">Website URL</label>
          <Input value={state.websiteUrl} onChange={(e) => patch("websiteUrl", e.target.value)} placeholder="https://example.com/landing" className="h-9 mt-1.5 text-sm" />
        </div>
      )}
    </Section>
  );
}
