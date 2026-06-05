import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { GripVertical, Save, Trash2, Webhook, Plus, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

export interface StatusPhase {
  id: string;
  workspace_id: string;
  status_key: string;
  label: string;
  sort_order: number;
  color: string;
  webhook_url: string | null;
  auto_managed: boolean;
  enabled: boolean;
}

const COLOR_CHOICES = ["primary", "success", "warning", "destructive", "purple", "accent", "muted"];
const AUTO_MANAGED_KEYS = new Set(["RED", "YELLOW", "GREEN", "LEARNING", "SETUP_COMPLETE"]);

export function StatusPhasesPanel() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const qc = useQueryClient();
  const [rows, setRows] = useState<StatusPhase[]>([]);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["client_status_phases", wsId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_status_phases").select("*")
        .eq("workspace_id", wsId).order("sort_order");
      if (error) throw error;
      return (data || []) as StatusPhase[];
    },
    enabled: !!wsId,
  });

  useEffect(() => { if (data) { setRows(data); setDirty(false); } }, [data]);

  const upsert = useMutation({
    mutationFn: async (phases: StatusPhase[]) => {
      const payload = phases.map((p, i) => ({ ...p, sort_order: (i + 1) * 10 }));
      const { error } = await (supabase as any)
        .from("client_status_phases").upsert(payload, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Statuses saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["client_status_phases", wsId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("client_status_phases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status removed");
      qc.invalidateQueries({ queryKey: ["client_status_phases", wsId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
  });

  const update = (id: string, patch: Partial<StatusPhase>) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
    setDirty(true);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[idx], next[j]] = [next[j], next[idx]];
    setRows(next);
    setDirty(true);
  };

  const addCustom = async () => {
    if (!wsId) return;
    const key = window.prompt("Status key (UPPER_SNAKE_CASE)")?.trim().toUpperCase();
    if (!key) return;
    const label = window.prompt("Display label", key)?.trim();
    if (!label) return;
    const { data, error } = await (supabase as any)
      .from("client_status_phases").insert({
        workspace_id: wsId, status_key: key, label,
        sort_order: (rows.length + 1) * 10, color: "muted",
      }).select().single();
    if (error) return toast.error(error.message);
    setRows(r => [...r, data as StatusPhase]);
    toast.success("Status added");
  };

  if (!wsId) {
    return <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">Select a workspace to manage statuses.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Webhook className="h-4 w-4" />Client Status Phases</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Customize the lifecycle phases for clients. Drag to reorder, edit labels, and optionally set a quick webhook URL per phase that fires when a client enters it.
              Auto-managed phases (Red/Yellow/Green from KPIs, Learning for 7 days post-launch, Setup Complete from onboarding) update on their own — others are set manually.
              For richer routing across every indicator, signal, and custom KPI, use <span className="font-medium text-foreground">Notifications → Webhooks</span>.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={addCustom}><Plus className="h-3 w-3 mr-1" />Add status</Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[24px_1fr_140px_120px_minmax(200px,2fr)_90px_40px] gap-2 px-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              <span></span><span>Label</span><span>Key</span><span>Color</span><span>Webhook URL</span><span className="text-center">Enabled</span><span></span>
            </div>
            {rows.map((r, i) => (
              <div key={r.id} className="grid grid-cols-[24px_1fr_140px_120px_minmax(200px,2fr)_90px_40px] gap-2 items-center rounded-md border border-border bg-background p-2">
                <div className="flex flex-col items-center text-muted-foreground">
                  <button onClick={() => move(i, -1)} className="hover:text-foreground text-xs leading-none">▲</button>
                  <GripVertical className="h-3 w-3" />
                  <button onClick={() => move(i, 1)} className="hover:text-foreground text-xs leading-none">▼</button>
                </div>
                <Input value={r.label} onChange={e => update(r.id, { label: e.target.value })} className="h-8 text-sm" />
                <code className="text-xs text-muted-foreground px-2 truncate flex items-center gap-1">
                  {r.status_key}
                  {AUTO_MANAGED_KEYS.has(r.status_key) && <Wand2 className="h-3 w-3 text-primary" aria-label="Auto-managed" />}
                </code>
                <select
                  value={r.color}
                  onChange={e => update(r.id, { color: e.target.value })}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                >
                  {COLOR_CHOICES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <Input
                  value={r.webhook_url ?? ""}
                  onChange={e => update(r.id, { webhook_url: e.target.value })}
                  placeholder="https://hooks.example.com/…"
                  className="h-8 text-xs font-mono"
                />
                <div className="flex justify-center">
                  <Switch checked={r.enabled} onCheckedChange={v => update(r.id, { enabled: v })} />
                </div>
                <button
                  onClick={() => { if (confirm(`Delete "${r.label}"?`)) removeRow.mutate(r.id); }}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <Button
            disabled={!dirty || upsert.isPending}
            onClick={() => upsert.mutate(rows)}
          >
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
