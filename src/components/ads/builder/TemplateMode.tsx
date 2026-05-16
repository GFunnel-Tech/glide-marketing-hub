import { useAdTemplates, useDeleteAdTemplate } from "@/hooks/useAdTemplates";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { toast } from "sonner";
import { LayoutTemplate, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TemplateMode({ onApplied }: { onApplied: () => void }) {
  const state = useAdDraftStore((s) => s.state);
  const hydrate = useAdDraftStore((s) => s.hydrate);
  const { data: templates = [], isLoading } = useAdTemplates(state.objective);
  const del = useDeleteAdTemplate();

  const apply = (tplState: any) => {
    hydrate(null, { ...tplState, objective: state.objective, specialAdCategory: state.specialAdCategory, countries: state.countries });
    toast.success("Template applied");
    onApplied();
  };

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading templates…</div>;
  if (!templates.length) {
    return (
      <div className="text-center p-8 rounded-xl border border-dashed border-border">
        <LayoutTemplate className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <div className="text-sm font-medium text-foreground">No templates yet</div>
        <div className="text-xs text-muted-foreground mt-1">Build an ad in Manual mode and toggle "Save as template" to reuse it later.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {templates.map((t) => (
        <div key={t.id} className="rounded-lg border border-border p-3 flex items-center gap-3">
          {t.thumbnail_url ? (
            <img src={t.thumbnail_url} alt="" className="w-12 h-12 rounded object-cover" />
          ) : (
            <div className="w-12 h-12 rounded bg-muted flex items-center justify-center"><LayoutTemplate className="h-4 w-4 text-muted-foreground" /></div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground line-clamp-1">{t.name}</div>
            <div className="text-xs text-muted-foreground">Objective: {t.objective}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => apply(t.state)}>Use</Button>
          <button onClick={() => del.mutate(t.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
    </div>
  );
}
