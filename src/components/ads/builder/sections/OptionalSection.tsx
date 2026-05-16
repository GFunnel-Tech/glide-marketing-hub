import { useAdDraftStore } from "@/stores/adDraftStore";
import { Section } from "../shared/Section";
import { Settings2, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MediaUploader } from "../shared/MediaUploader";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

export function OptionalSection() {
  const state = useAdDraftStore((s) => s.state);
  const patch = useAdDraftStore((s) => s.patch);

  return (
    <Section title="Optional" icon={<Settings2 className="h-4 w-4 text-primary" />} defaultOpen={false}>
      <Toggle label="Optimize For Me" value={state.optimizeForMe} onChange={(v) => patch("optimizeForMe", v)} info="Let AI continuously test creatives and pause low performers." />

      {state.optimizeForMe && (
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <div className="text-sm font-semibold text-foreground">Creative bank</div>
          </div>
          <p className="text-xs text-muted-foreground">
            Add extra creatives once and AI will test them in your ads over time. It rotates in your selected assets, replaces low performers, keeps campaigns fresh, and improves results.
          </p>

          <div>
            <div className="text-xs font-medium text-foreground mb-1.5">Add Images (up to 50)</div>
            <MediaUploader value={state.bankImages} onChange={(v) => patch("bankImages", v)} max={50} accept="image" label="Add" />
          </div>
          <div>
            <div className="text-xs font-medium text-foreground mb-1.5">Add Videos (up to 50)</div>
            <MediaUploader value={state.bankVideos} onChange={(v) => patch("bankVideos", v)} max={50} accept="video" label="Add" />
          </div>
          <div>
            <div className="text-xs font-medium text-foreground mb-1.5">Add Ad Copy (up to 50)</div>
            <div className="space-y-2">
              {state.bankCopy.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={c} onChange={(e) => { const n = [...state.bankCopy]; n[i] = e.target.value; patch("bankCopy", n); }} placeholder="Ad copy variant" className="text-sm" />
                  <button onClick={() => patch("bankCopy", state.bankCopy.filter((_, idx) => idx !== i))}><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>
              ))}
            </div>
            {state.bankCopy.length < 50 && (
              <Button variant="ghost" size="sm" className="mt-1.5 text-xs" onClick={() => patch("bankCopy", [...state.bankCopy, ""])}>
                <Plus className="h-3 w-3 mr-1" /> Add Copy
              </Button>
            )}
          </div>
        </div>
      )}

      <Toggle label="Update Product Group" value={state.updateProductGroup} onChange={(v) => patch("updateProductGroup", v)} />
      <Toggle label="Save prompt" value={state.savePrompt} onChange={(v) => patch("savePrompt", v)} />
      <Toggle label="Save as template" value={state.saveAsTemplate} onChange={(v) => patch("saveAsTemplate", v)} />

      <div>
        <label className="text-xs font-medium text-foreground">Campaign Name (Optional)</label>
        <Input value={state.campaignName} onChange={(e) => patch("campaignName", e.target.value)} placeholder="e.g. Mortgage Solution | Leads | Image" className="mt-1.5 h-9 text-sm" />
      </div>

      <div>
        <label className="text-xs font-medium text-foreground">UTM Parameters (Optional)</label>
        <Textarea
          value={state.utmParameters}
          onChange={(e) => patch("utmParameters", e.target.value)}
          rows={3}
          className="mt-1.5 text-xs font-mono"
        />
        <div className="text-[10px] text-muted-foreground mt-1 text-right">{state.utmParameters.length}/500</div>
      </div>
    </Section>
  );
}

function Toggle({ label, value, onChange, info }: { label: string; value: boolean; onChange: (v: boolean) => void; info?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {info && <div className="text-xs text-muted-foreground mt-0.5">{info}</div>}
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
