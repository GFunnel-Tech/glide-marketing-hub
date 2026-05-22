import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, ShieldCheck, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useGuaranteeTemplates,
  useUpsertGuaranteeTemplate,
  useDeleteGuaranteeTemplate,
} from "@/hooks/useGuarantees";
import { GuaranteeBuilder } from "./GuaranteeBuilder";
import type { GuaranteeTemplate } from "@/lib/guaranteeTypes";

export function GuaranteeTemplatesPanel() {
  const { data: templates = [], isLoading } = useGuaranteeTemplates();
  const upsert = useUpsertGuaranteeTemplate();
  const del = useDeleteGuaranteeTemplate();
  const [editing, setEditing] = useState<Partial<GuaranteeTemplate> | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Guarantee Templates
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable performance guarantees you can attach to any client.
          </p>
        </div>
        <Button onClick={() => { setEditing({}); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New template
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : templates.length === 0 ? (
        <Card className="p-8 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No guarantee templates yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create one to quickly attach the same guarantee to multiple clients.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-foreground truncate">{t.name}</h3>
                    {!t.enabled && <Badge variant="outline" className="text-xs">Disabled</Badge>}
                  </div>
                  {t.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(t); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={async () => {
                    if (!confirm(`Delete template "${t.name}"?`)) return;
                    try { await del.mutateAsync(t.id); toast.success("Template deleted"); }
                    catch (e: any) { toast.error(e.message || "Failed to delete"); }
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{t.duration_days} day window</span>
                <span>·</span>
                <span>{t.criteria.length} criteria</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <GuaranteeBuilder
        open={open}
        onOpenChange={setOpen}
        mode="template"
        initial={editing ?? undefined}
        onSave={async (form) => {
          try {
            await upsert.mutateAsync({
              id: (editing as any)?.id,
              name: form.name,
              description: form.description,
              terms: form.terms,
              duration_days: form.duration_days,
              criteria: form.criteria,
              enabled: form.enabled,
            });
            toast.success("Template saved");
          } catch (e: any) {
            toast.error(e.message || "Failed to save");
            throw e;
          }
        }}
      />
    </div>
  );
}
