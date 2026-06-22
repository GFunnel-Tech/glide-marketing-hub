import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ExternalLink, Link2 } from "lucide-react";

type Tab = {
  id: string;
  label: string;
  provider: string;
  icon: string | null;
  url_template: string | null;
  sort_order: number;
};

type Embed = {
  id: string;
  tab_id: string;
  embed_url: string;
  public_token: string | null;
  status: string;
};

export function ClientEmbedsCard({
  clientId,
  workspaceId,
}: {
  clientId: number;
  workspaceId: string | null;
}) {
  const qc = useQueryClient();

  const { data: tabs } = useQuery({
    queryKey: ["workspace-embed-tabs", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_embed_tabs")
        .select("id, label, provider, icon, url_template, sort_order")
        .eq("workspace_id", workspaceId!)
        .eq("enabled", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Tab[];
    },
  });

  const { data: embeds } = useQuery({
    queryKey: ["client-embeds-admin", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_embeds")
        .select("id, tab_id, embed_url, public_token, status")
        .eq("client_id", clientId);
      if (error) throw error;
      return (data ?? []) as Embed[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`client-embeds-admin-${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_embeds", filter: `client_id=eq.${clientId}` },
        () => qc.invalidateQueries({ queryKey: ["client-embeds-admin", clientId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [clientId, qc]);

  const embedByTab = useMemo(() => {
    const m: Record<string, Embed> = {};
    (embeds ?? []).forEach((e) => { m[e.tab_id] = e; });
    return m;
  }, [embeds]);

  if (!workspaceId) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2"><Link2 className="h-4 w-4" /> Client Portal Embeds</h3>
        <p className="text-sm text-muted-foreground">
          Paste the per-client URL for each tab. Empty rows hide the tab for this client.
          Manage the tab list in <a className="underline" href="/settings?tab=embeds">Settings → Portal Tabs</a>.
        </p>
      </div>

      {(tabs?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">No embed tabs configured for this workspace yet.</p>
      )}

      <div className="space-y-3">
        {tabs?.map((tab) => (
          <EmbedRow
            key={tab.id}
            clientId={clientId}
            tab={tab}
            existing={embedByTab[tab.id]}
          />
        ))}
      </div>
    </div>
  );
}

function EmbedRow({
  clientId,
  tab,
  existing,
}: {
  clientId: number;
  tab: Tab;
  existing?: Embed;
}) {
  const [url, setUrl] = useState(existing?.embed_url ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setUrl(existing?.embed_url ?? ""); }, [existing?.embed_url]);

  const save = async () => {
    setSaving(true);
    let token: string | null = null;
    try { token = new URL(url).pathname.split("/").filter(Boolean).pop() ?? null; } catch { /* ignore */ }

    if (!url) {
      // Empty input = delete the embed
      if (existing) {
        const { error } = await supabase.from("client_embeds").delete().eq("id", existing.id);
        if (error) toast.error(error.message); else toast.success("Removed");
      }
      setSaving(false);
      return;
    }

    if (existing) {
      const { error } = await supabase
        .from("client_embeds")
        .update({ embed_url: url, public_token: token })
        .eq("id", existing.id);
      if (error) toast.error(error.message); else toast.success("Saved");
    } else {
      const { error } = await supabase
        .from("client_embeds")
        .insert({ client_id: clientId, tab_id: tab.id, embed_url: url, public_token: token, status: "pending" });
      if (error) toast.error(error.message); else toast.success("Saved");
    }
    setSaving(false);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
      <div className="md:col-span-3">
        <Label className="text-xs">{tab.label}</Label>
        <p className="text-[11px] text-muted-foreground">{tab.provider}{existing?.status ? ` · ${existing.status}` : ""}</p>
      </div>
      <div className="md:col-span-7">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={tab.url_template ?? "https://…"}
        />
      </div>
      <div className="md:col-span-2 flex items-center gap-2">
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>
        )}
        <Button size="sm" onClick={save} disabled={saving} className="flex-1">{saving ? "…" : "Save"}</Button>
      </div>
    </div>
  );
}
