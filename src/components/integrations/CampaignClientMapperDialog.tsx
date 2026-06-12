import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

type Campaign = {
  id: string;
  name: string;
  client_id: number | null;
  status: string;
  spend: number | null;
  leads: number | null;
};

type ClientLite = { id: number; name: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  adAccountId: string;
  accountLabel: string;
  /** Clients allowed for mapping (typically the account's member clients). Empty = any workspace client. */
  memberClients: ClientLite[];
  onSaved?: () => void;
};

export function CampaignClientMapperDialog({
  open, onOpenChange, adAccountId, accountLabel, memberClients, onSaved,
}: Props) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [draft, setDraft] = useState<Record<string, number | null>>({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || !wsId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("campaigns")
        .select("id, name, client_id, status, spend, leads")
        .eq("workspace_id", wsId)
        .eq("ad_account_id", adAccountId)
        .order("name");
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setCampaigns([]);
      } else {
        setCampaigns((data ?? []) as Campaign[]);
        const d: Record<string, number | null> = {};
        (data ?? []).forEach((c: Campaign) => { d[c.id] = c.client_id; });
        setDraft(d);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, wsId, adAccountId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c) => c.name.toLowerCase().includes(q));
  }, [campaigns, search]);

  const dirtyIds = useMemo(
    () => campaigns.filter((c) => (draft[c.id] ?? null) !== (c.client_id ?? null)).map((c) => c.id),
    [campaigns, draft],
  );

  const bulkApply = (clientId: number | null) => {
    const next = { ...draft };
    filtered.forEach((c) => { next[c.id] = clientId; });
    setDraft(next);
  };

  const save = async () => {
    if (dirtyIds.length === 0) { onOpenChange(false); return; }
    setBusy(true);
    try {
      // Group updates by target client_id
      const groups = new Map<string, string[]>();
      dirtyIds.forEach((id) => {
        const key = String(draft[id] ?? "null");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(id);
      });
      for (const [key, ids] of groups) {
        const clientId = key === "null" ? null : Number(key);
        const { error } = await (supabase as any)
          .from("campaigns")
          .update({ client_id: clientId })
          .in("id", ids);
        if (error) throw error;
      }
      toast.success(`Updated ${dirtyIds.length} campaign${dirtyIds.length === 1 ? "" : "s"}`);
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const clientOptions = memberClients;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Map campaigns to clients</DialogTitle>
          <DialogDescription>
            {accountLabel} — assign each campaign to one of the clients sharing this ad account.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns…"
            className="h-8 text-xs"
          />
          <Select onValueChange={(v) => bulkApply(v === "__null__" ? null : Number(v))}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue placeholder="Bulk: set visible…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__null__">Unmapped</SelectItem>
              {clientOptions.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="max-h-[420px] overflow-y-auto rounded-md border border-border">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading campaigns…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              No campaigns found for this ad account yet. Run a Meta sync first.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b border-border sticky top-0 bg-background">
                <tr>
                  <th className="text-left px-3 py-2">Campaign</th>
                  <th className="text-right px-2 py-2">Spend</th>
                  <th className="text-right px-2 py-2">Leads</th>
                  <th className="text-left px-3 py-2 w-56">Client</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const isDirty = (draft[c.id] ?? null) !== (c.client_id ?? null);
                  return (
                    <tr key={c.id} className="border-b border-border/50">
                      <td className="px-3 py-1.5">
                        <div className="font-medium text-foreground truncate max-w-[260px]" title={c.name}>{c.name}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">{c.status}</div>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {typeof c.spend === "number" ? `$${c.spend.toFixed(0)}` : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {c.leads ?? 0}
                      </td>
                      <td className="px-3 py-1.5">
                        <Select
                          value={draft[c.id] == null ? "__null__" : String(draft[c.id])}
                          onValueChange={(v) =>
                            setDraft((d) => ({ ...d, [c.id]: v === "__null__" ? null : Number(v) }))
                          }
                        >
                          <SelectTrigger className={`h-7 text-xs ${isDirty ? "border-primary" : ""}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__null__">Unmapped</SelectItem>
                            {clientOptions.map((cl) => (
                              <SelectItem key={cl.id} value={String(cl.id)}>{cl.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {dirtyIds.length > 0 ? `${dirtyIds.length} unsaved change${dirtyIds.length === 1 ? "" : "s"}` : "No changes"}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button size="sm" disabled={busy || dirtyIds.length === 0} onClick={save}>
                {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
