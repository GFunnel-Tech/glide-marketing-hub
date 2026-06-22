import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, ExternalLink } from "lucide-react";

type Tab = {
  id: string;
  workspace_id: string;
  label: string;
  provider: string;
  icon: string | null;
  url_template: string | null;
  sort_order: number;
  enabled: boolean;
};

const ICON_HINT = "Lucide icon name, e.g. FileText, FileSignature, Receipt, BookOpen";

export function EmbedTabsPanel() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const qc = useQueryClient();

  const { data: tabs, isLoading } = useQuery({
    queryKey: ["workspace-embed-tabs", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_embed_tabs")
        .select("*")
        .eq("workspace_id", wsId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Tab[];
    },
  });

  useEffect(() => {
    if (!wsId) return;
    const ch = supabase
      .channel(`ws-embed-tabs-${wsId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_embed_tabs", filter: `workspace_id=eq.${wsId}` },
        () => qc.invalidateQueries({ queryKey: ["workspace-embed-tabs", wsId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [wsId, qc]);

  const addTab = async () => {
    if (!wsId) return;
    const { error } = await supabase.from("workspace_embed_tabs").insert({
      workspace_id: wsId,
      label: "New Tab",
      provider: "custom",
      icon: "FileText",
      sort_order: (tabs?.length ?? 0) * 10 + 100,
      enabled: true,
    });
    if (error) toast.error(error.message);
  };

  if (!wsId) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Client Portal Embed Tabs</h3>
          <p className="text-sm text-muted-foreground">
            Tabs you add here appear on <code className="text-xs">/client-portal/:id</code> for every client in this workspace.
            The agency pastes the per-client URL on each client&apos;s profile.
          </p>
        </div>
        <Button onClick={addTab} size="sm"><Plus className="h-4 w-4 mr-1" /> Add tab</Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && (tabs?.length ?? 0) === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
          No embed tabs yet. Add one to start.
        </div>
      )}

      <div className="space-y-3">
        {tabs?.map((t) => <TabRow key={t.id} tab={t} />)}
      </div>
    </div>
  );
}

function TabRow({ tab }: { tab: Tab }) {
  const [label, setLabel] = useState(tab.label);
  const [icon, setIcon] = useState(tab.icon ?? "FileText");
  const [provider, setProvider] = useState(tab.provider);
  const [urlTemplate, setUrlTemplate] = useState(tab.url_template ?? "");
  const [sortOrder, setSortOrder] = useState(tab.sort_order);
  const [enabled, setEnabled] = useState(tab.enabled);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLabel(tab.label); setIcon(tab.icon ?? "FileText"); setProvider(tab.provider);
    setUrlTemplate(tab.url_template ?? ""); setSortOrder(tab.sort_order); setEnabled(tab.enabled);
  }, [tab]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("workspace_embed_tabs")
      .update({ label, icon, provider, url_template: urlTemplate || null, sort_order: sortOrder, enabled })
      .eq("id", tab.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  };

  const remove = async () => {
    if (!confirm(`Delete the "${tab.label}" tab? Per-client URLs for this tab will also be removed.`)) return;
    const { error } = await supabase.from("workspace_embed_tabs").delete().eq("id", tab.id);
    if (error) toast.error(error.message);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-3">
          <Label className="text-xs">Label</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Icon</Label>
          <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="FileText" title={ICON_HINT} />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Provider key</Label>
          <Input value={provider} onChange={(e) => setProvider(e.target.value)} />
        </div>
        <div className="md:col-span-4">
          <Label className="text-xs">URL template <span className="text-muted-foreground font-normal">(optional, supports {"{client_id}"} and {"{token}"})</span></Label>
          <Input value={urlTemplate} onChange={(e) => setUrlTemplate(e.target.value)} placeholder="https://eem-termsheet.lovable.app/q/{token}" />
        </div>
        <div className="md:col-span-1">
          <Label className="text-xs">Order</Label>
          <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
        </div>
      </div>
      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          {enabled ? "Enabled" : "Disabled"}
        </label>
        <div className="flex items-center gap-2">
          {urlTemplate && (
            <a href={urlTemplate} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> Preview template
            </a>
          )}
          <Button variant="ghost" size="sm" onClick={remove} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}
