import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Facebook, Loader2, Users, ListChecks, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { CampaignClientMapperDialog } from "./CampaignClientMapperDialog";

type MetaAcc = {
  id: string;
  act_id: string;
  account_name: string | null;
  business_name: string | null;
  client_id: number | null;
};
type Client = { id: number; name: string };
type Membership = { id: string; ad_account_id: string; client_id: number };

export function SharedAdAccountsPanel() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const qc = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<MetaAcc[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [search, setSearch] = useState("");
  const [mappingFor, setMappingFor] = useState<MetaAcc | null>(null);
  const [filterMode, setFilterMode] = useState<"shared" | "all">("shared");

  const load = async () => {
    if (!wsId) return;
    setLoading(true);
    const [a, c, m] = await Promise.all([
      (supabase as any).from("meta_ad_accounts")
        .select("id, act_id, account_name, business_name, client_id")
        .eq("workspace_id", wsId).order("account_name"),
      (supabase as any).from("clients")
        .select("id, name").eq("workspace_id", wsId).order("name"),
      (supabase as any).from("meta_ad_account_clients")
        .select("id, ad_account_id, client_id").eq("workspace_id", wsId),
    ]);
    setAccounts(a.data ?? []);
    setClients(c.data ?? []);
    setMemberships(m.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [wsId]);

  const membersByAccount = useMemo(() => {
    const m = new Map<string, number[]>();
    memberships.forEach((r) => {
      const arr = m.get(r.ad_account_id) ?? [];
      arr.push(r.client_id);
      m.set(r.ad_account_id, arr);
    });
    return m;
  }, [memberships]);

  const clientById = useMemo(() => {
    const m = new Map<number, Client>();
    clients.forEach((c) => m.set(c.id, c));
    return m;
  }, [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = accounts;
    if (filterMode === "shared") {
      list = list.filter((a) => (membersByAccount.get(a.id)?.length ?? 0) > 0);
    }
    if (q) {
      list = list.filter((a) =>
        (a.account_name || "").toLowerCase().includes(q) ||
        (a.business_name || "").toLowerCase().includes(q) ||
        a.act_id.toLowerCase().includes(q),
      );
    }
    return list;
  }, [accounts, membersByAccount, search, filterMode]);

  const toggleMember = async (account: MetaAcc, clientId: number, on: boolean) => {
    if (!wsId) return;
    setBusy(true);
    try {
      if (on) {
        const { error } = await (supabase as any).from("meta_ad_account_clients")
          .insert({ ad_account_id: account.id, client_id: clientId, workspace_id: wsId });
        if (error) throw error;
        // If account had a single owner, keep it; first time a second client is added, clear single owner
        // so attribution comes from campaign mapping (avoids double-counting).
        const after = (membersByAccount.get(account.id)?.length ?? 0) + 1;
        if (after >= 2 && account.client_id != null) {
          await (supabase as any).from("meta_ad_accounts")
            .update({ client_id: null }).eq("id", account.id);
        }
      } else {
        const { error } = await (supabase as any).from("meta_ad_account_clients")
          .delete().eq("ad_account_id", account.id).eq("client_id", clientId);
        if (error) throw error;
      }
      await load();
      qc.invalidateQueries({ queryKey: ["client-meta-accounts"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update sharing");
    } finally {
      setBusy(false);
    }
  };

  if (!wsId) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Shared ad accounts
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-prose">
            When one Meta ad account serves several clients, add each client here, then map every campaign to
            its owning client. Each client's spend &amp; leads = sum of their mapped campaigns.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden text-[11px]">
            <button
              onClick={() => setFilterMode("shared")}
              className={`px-2.5 py-1 ${filterMode === "shared" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >Shared only</button>
            <button
              onClick={() => setFilterMode("all")}
              className={`px-2.5 py-1 ${filterMode === "all" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >All accounts</button>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ad accounts…"
            className="h-8 w-56 text-xs"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          {filterMode === "shared"
            ? "No shared ad accounts yet. Switch to “All accounts” and add clients to share one."
            : "No Meta ad accounts found."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {filtered.map((a) => {
            const memberIds = membersByAccount.get(a.id) ?? [];
            const members = memberIds.map((id) => clientById.get(id)).filter(Boolean) as Client[];
            const isShared = members.length > 0;
            // For campaign mapping, allowed clients = shared members (if any) else fall back to owner
            const allowed = isShared
              ? members
              : a.client_id != null && clientById.get(a.client_id)
                ? [clientById.get(a.client_id)!]
                : [];
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Facebook className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-sm font-medium text-foreground truncate">
                      {a.account_name || a.act_id}
                    </span>
                    {isShared ? (
                      <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30" variant="outline">
                        Shared with {members.length}
                      </Badge>
                    ) : a.client_id != null ? (
                      <Badge variant="outline" className="text-[10px] border-success/40 text-success">
                        Single owner
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">Unmapped</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground truncate font-mono">
                    {a.act_id}{a.business_name ? ` · ${a.business_name}` : ""}
                  </div>
                  {isShared && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {members.map((m) => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground"
                        >
                          {m.name}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => toggleMember(a, m.id, false)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${m.name}`}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1">
                        <Plus className="h-3 w-3" />
                        {isShared ? "Edit clients" : "Share with…"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="end">
                      <div className="text-[11px] font-medium text-muted-foreground mb-1 px-1">
                        Clients sharing this account
                      </div>
                      <div className="max-h-64 overflow-y-auto space-y-0.5">
                        {clients.length === 0 && (
                          <p className="text-[11px] text-muted-foreground px-1 py-2">No clients yet.</p>
                        )}
                        {clients.map((c) => {
                          const checked = memberIds.includes(c.id);
                          return (
                            <label
                              key={c.id}
                              className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted cursor-pointer"
                            >
                              <Checkbox
                                checked={checked}
                                disabled={busy}
                                onCheckedChange={(v) => toggleMember(a, c.id, !!v)}
                              />
                              <span className="truncate">{c.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1"
                    disabled={allowed.length === 0}
                    onClick={() => setMappingFor(a)}
                    title={allowed.length === 0 ? "Add at least one client first" : "Map campaigns to clients"}
                  >
                    <ListChecks className="h-3 w-3" /> Map campaigns
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {mappingFor && (
        <CampaignClientMapperDialog
          open={!!mappingFor}
          onOpenChange={(v) => !v && setMappingFor(null)}
          adAccountId={mappingFor.id}
          accountLabel={mappingFor.account_name || mappingFor.act_id}
          memberClients={
            (membersByAccount.get(mappingFor.id) ?? [])
              .map((id) => clientById.get(id))
              .filter(Boolean) as Client[]
          }
          onSaved={() => qc.invalidateQueries({ queryKey: ["campaigns"] })}
        />
      )}
    </div>
  );
}
