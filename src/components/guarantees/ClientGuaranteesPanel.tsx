import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  useClientGuarantees,
  useGuaranteeTemplates,
  useUpsertClientGuarantee,
  useDeleteClientGuarantee,
} from "@/hooks/useGuarantees";
import { GuaranteeBuilder } from "./GuaranteeBuilder";
import { GuaranteeCard } from "./GuaranteeCard";
import type { ClientGuarantee } from "@/lib/guaranteeTypes";

interface Props {
  clientId: number;
  client?: { leads?: number; spend?: number };
  readOnly?: boolean;
}

function useGhlContext(clientId: number) {
  return useQuery({
    queryKey: ["guarantee-ghl-context", clientId],
    queryFn: async () => {
      const [apptsRes, oppsRes] = await Promise.all([
        (supabase as any).from("ghl_appointments").select("id, status").eq("client_id", clientId),
        (supabase as any).from("ghl_opportunities").select("id, status, monetary_value").eq("client_id", clientId),
      ]);
      const appointments = apptsRes.data?.length ?? 0;
      const opps = oppsRes.data ?? [];
      const closed_deals = opps.filter((o: any) => (o.status || "").toLowerCase() === "won").length;
      const deals_in_underwriting = opps.filter((o: any) =>
        ["open", "in_progress", "underwriting"].includes((o.status || "").toLowerCase())
      ).length;
      const commission_revenue = opps
        .filter((o: any) => (o.status || "").toLowerCase() === "won")
        .reduce((s: number, o: any) => s + (Number(o.monetary_value) || 0), 0);
      return { appointments, closed_deals, deals_in_underwriting, commission_revenue };
    },
  });
}

export function ClientGuaranteesPanel({ clientId, client, readOnly }: Props) {
  const { data: guarantees = [], isLoading } = useClientGuarantees(clientId);
  const { data: templates = [] } = useGuaranteeTemplates();
  const { data: ghlCtx } = useGhlContext(clientId);
  const upsert = useUpsertClientGuarantee();
  const del = useDeleteClientGuarantee();
  const [editing, setEditing] = useState<Partial<ClientGuarantee> | null>(null);
  const [open, setOpen] = useState(false);

  const context = useMemo(() => ({ client, ...(ghlCtx ?? {}) }), [client, ghlCtx]);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Guarantees
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Performance guarantees this client must hit to qualify.
          </p>
        </div>
        {!readOnly && (
          <Button onClick={() => { setEditing({}); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add guarantee
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : guarantees.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No guarantees yet for this client.</p>
          {!readOnly && (
            <p className="text-xs text-muted-foreground mt-1">
              Add one from a template, or create a custom one.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {guarantees.map((g) => (
            <GuaranteeCard
              key={g.id}
              guarantee={g}
              context={context}
              readOnly={readOnly}
              onEdit={readOnly ? undefined : () => { setEditing(g); setOpen(true); }}
              onDelete={readOnly ? undefined : async () => {
                if (!confirm(`Delete guarantee "${g.name}"?`)) return;
                try { await del.mutateAsync(g.id); toast.success("Guarantee deleted"); }
                catch (e: any) { toast.error(e.message || "Failed to delete"); }
              }}
            />
          ))}
        </div>
      )}

      <GuaranteeBuilder
        open={open}
        onOpenChange={setOpen}
        mode="client"
        initial={editing ?? undefined}
        templates={templates.filter((t) => t.enabled)}
        onSave={async (form) => {
          const deadline = form.deadline
            ?? new Date(Date.now() + (form.duration_days || 30) * 86_400_000).toISOString().slice(0, 10);
          try {
            await upsert.mutateAsync({
              id: (editing as any)?.id,
              client_id: clientId,
              name: form.name,
              description: form.description,
              terms: form.terms,
              criteria: form.criteria,
              start_date: form.start_date,
              deadline,
              visible_to_client: form.visible_to_client,
            });
            toast.success("Guarantee saved");
          } catch (e: any) {
            toast.error(e.message || "Failed to save");
            throw e;
          }
        }}
      />
    </Card>
  );
}
