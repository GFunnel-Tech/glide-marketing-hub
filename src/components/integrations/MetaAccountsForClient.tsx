import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ExternalLink, Loader2, CheckCircle2, AlertCircle, Link2, Unlink, Plus, Settings2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { CampaignClientMapperDialog } from "./CampaignClientMapperDialog";

type Row = {
  id: string;
  act_id: string;
  account_name: string | null;
  business_name: string | null;
  currency: string | null;
  account_status: number | null;
  is_active: boolean | null;
  last_synced_at: string | null;
  client_id: number | null;
};

export function MetaAccountsForClient({ clientId }: { clientId: number }) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const qc = useQueryClient();
  const [pickerValue, setPickerValue] = useState<string>("");
  const [takeOwnership, setTakeOwnership] = useState(false);

  const [busy, setBusy] = useState(false);
  const [mapperAccount, setMapperAccount] = useState<Row | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["client-meta-accounts", wsId, clientId],
    enabled: !!wsId,
    queryFn: async () => {
      const ownedP = supabase
        .from("meta_ad_accounts")
        .select("id, act_id, account_name, business_name, currency, account_status, is_active, last_synced_at, client_id")
        .eq("workspace_id", wsId!)
        .eq("client_id", clientId);
      const sharedIdsP = (supabase as any)
        .from("meta_ad_account_clients")
        .select("ad_account_id")
        .eq("workspace_id", wsId!)
        .eq("client_id", clientId);

      const [{ data: owned, error: e1 }, { data: sharedRows, error: e2 }] = await Promise.all([ownedP, sharedIdsP]);
      if (e1) throw e1;
      if (e2) throw e2;

      let shared: Row[] = [];
      const sharedIds = (sharedRows ?? []).map((r: any) => r.ad_account_id);
      if (sharedIds.length) {
        const { data, error } = await supabase
          .from("meta_ad_accounts")
          .select("id, act_id, account_name, business_name, currency, account_status, is_active, last_synced_at, client_id")
          .eq("workspace_id", wsId!)
          .in("id", sharedIds);
        if (error) throw error;
        shared = (data ?? []) as Row[];
      }

      const all = new Map<string, Row>();
      [...(owned ?? []), ...shared].forEach((r: any) => all.set(r.id, r));
      return Array.from(all.values()).sort((a, b) =>
        (a.account_name || a.act_id).localeCompare(b.account_name || b.act_id),
      );
    },
  });

  // All meta accounts in the workspace, for the picker
  const { data: allAccounts } = useQuery({
    queryKey: ["workspace-meta-accounts", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_ad_accounts")
        .select("id, act_id, account_name, business_name, currency, client_id")
        .eq("workspace_id", wsId!)
        .order("account_name", { ascending: true });
      if (error) throw error;
      return data as Array<Pick<Row, "id" | "act_id" | "account_name" | "business_name" | "currency" | "client_id">>;
    },
  });

  // Per-account campaign counts (total + unmapped) for badges
  const accountIds = useMemo(() => (accounts ?? []).map((a) => a.id), [accounts]);
  const { data: campaignCounts } = useQuery({
    queryKey: ["client-meta-account-campaign-counts", wsId, accountIds.join(",")],
    enabled: !!wsId && accountIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("campaigns")
        .select("ad_account_id, client_id")
        .eq("workspace_id", wsId!)
        .in("ad_account_id", accountIds);
      if (error) throw error;
      const map = new Map<string, { total: number; unmapped: number; mine: number }>();
      for (const id of accountIds) map.set(id, { total: 0, unmapped: 0, mine: 0 });
      (data ?? []).forEach((c: any) => {
        const m = map.get(c.ad_account_id);
        if (!m) return;
        m.total += 1;
        if (c.client_id == null) m.unmapped += 1;
        else if (c.client_id === clientId) m.mine += 1;
      });
      return map;
    },
  });

  // Member clients for the campaign mapper dialog — load on demand for the chosen shared account
  const { data: mapperMembers } = useQuery({
    queryKey: ["meta-account-member-clients", wsId, mapperAccount?.id, clientId],
    enabled: !!wsId && !!mapperAccount,
    queryFn: async () => {
      const ids = new Set<number>();
      if (mapperAccount?.client_id != null) ids.add(mapperAccount.client_id);
      ids.add(clientId);
      const { data, error } = await (supabase as any)
        .from("meta_ad_account_clients")
        .select("client_id")
        .eq("workspace_id", wsId!)
        .eq("ad_account_id", mapperAccount!.id);
      if (error) throw error;
      (data ?? []).forEach((r: any) => ids.add(r.client_id));
      if (ids.size === 0) return [] as Array<{ id: number; name: string }>;
      const { data: cs, error: e2 } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", Array.from(ids));
      if (e2) throw e2;
      return (cs ?? []).sort((a: any, b: any) => a.name.localeCompare(b.name)) as Array<{ id: number; name: string }>;
    },
  });

  const linkedIds = useMemo(() => new Set((accounts ?? []).map((a) => a.id)), [accounts]);
  const pickerOptions = useMemo(
    () => (allAccounts ?? []).filter((a) => !linkedIds.has(a.id)),
    [allAccounts, linkedIds],
  );

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["client-meta-accounts", wsId, clientId] }),
      qc.invalidateQueries({ queryKey: ["workspace-meta-accounts", wsId] }),
      qc.invalidateQueries({ queryKey: ["client-meta-account-campaign-counts", wsId] }),
      qc.invalidateQueries({ queryKey: ["clients"] }),
      qc.invalidateQueries({ queryKey: ["clients-with-meta-account"] }),
      qc.invalidateQueries({ queryKey: ["clients-range-metrics"] }),
    ]);
  };

  const linkAccount = async () => {
    if (!pickerValue) return;
    const acct = (allAccounts ?? []).find((a) => a.id === pickerValue);
    if (!acct) return;
    setBusy(true);
    try {
      if (acct.client_id == null || acct.client_id === clientId) {
        // Unowned (or already ours) → set direct ownership
        const { data, error } = await (supabase as any)
          .from("meta_ad_accounts")
          .update({ client_id: clientId })
          .eq("id", acct.id)
          .select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("Update was blocked — you may not have permission to change this ad account.");
      } else if (takeOwnership) {
        // Move ownership away from the other client
        const { data, error } = await (supabase as any)
          .from("meta_ad_accounts")
          .update({ client_id: clientId })
          .eq("id", acct.id)
          .select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("Update was blocked — you may not have permission to change this ad account.");
        await (supabase as any)
          .from("meta_ad_account_clients")
          .delete()
          .eq("ad_account_id", acct.id)
          .eq("client_id", clientId);
      } else {
        // Already owned by another client → share it via membership table
        const { error } = await (supabase as any)
          .from("meta_ad_account_clients")
          .upsert(
            { workspace_id: wsId, ad_account_id: acct.id, client_id: clientId },
            { onConflict: "ad_account_id,client_id" },
          );
        if (error) throw error;
      }
      toast.success(takeOwnership ? "Meta ad account moved to this client" : "Meta ad account linked");
      setPickerValue("");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to link account");
    } finally {
      setBusy(false);
    }
  };

  const unlinkAccount = async (acct: Row) => {
    setBusy(true);
    try {
      let changed = false;
      if (acct.client_id === clientId) {
        const { data, error } = await (supabase as any)
          .from("meta_ad_accounts")
          .update({ client_id: null })
          .eq("id", acct.id)
          .select("id");
        if (error) throw error;
        if (!data?.length) {
          throw new Error("Unlink was blocked — you may not have permission to change this ad account.");
        }
        changed = true;
      }
      // Always also clean the share row if present
      const { data: removedShares, error: shareErr } = await (supabase as any)
        .from("meta_ad_account_clients")
        .delete()
        .eq("ad_account_id", acct.id)
        .eq("client_id", clientId)
        .select("ad_account_id");
      if (shareErr) throw shareErr;
      if (removedShares?.length) changed = true;

      if (!changed) {
        throw new Error("Nothing to unlink — this ad account is owned by a different client.");
      }
      toast.success("Meta ad account unlinked");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to unlink account");
    } finally {
      setBusy(false);
    }
  };


  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-3">
        {/* Picker */}
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" /> Link a Meta ad account
          </div>
          <div className="flex flex-1 items-center gap-2">
            <Select value={pickerValue} onValueChange={(v) => { setPickerValue(v); setTakeOwnership(false); }} disabled={busy || !pickerOptions.length}>
              <SelectTrigger className="h-9 flex-1 text-sm">
                <SelectValue placeholder={pickerOptions.length ? "Select a Meta ad account…" : "All workspace accounts are already linked"} />
              </SelectTrigger>
              <SelectContent>
                {pickerOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {(a.account_name || a.act_id)}{a.currency ? ` · ${a.currency}` : ""}{a.client_id != null ? " · owned by another client" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button size="sm" className="h-9 gap-1.5" onClick={linkAccount} disabled={!pickerValue || busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Link
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading Meta ad accounts…
          </div>
        ) : !accounts || accounts.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
            <AlertCircle className="h-4 w-4" />
            No Meta ad account linked to this client yet. Use the picker above to link one.
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {accounts.map((a) => {
              const active = a.is_active !== false && (a.account_status === 1 || a.account_status === null);
              const shared = a.client_id !== clientId;
              const counts = campaignCounts?.get(a.id);
              return (
                <div key={a.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {active ? (
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-warning shrink-0" />
                      )}
                      <span className="text-sm font-medium text-foreground truncate">
                        {a.account_name || a.act_id}
                      </span>
                      {a.currency && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {a.currency}
                        </span>
                      )}
                      {shared && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          Shared
                        </span>
                      )}
                      {shared && counts && counts.mine > 0 && (
                        <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
                          {counts.mine} mapped to this client
                        </span>
                      )}
                      {shared && counts && counts.unmapped > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning cursor-help">
                              {counts.unmapped} unmapped
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            Unmapped campaigns don&apos;t count toward any client. Open “Map campaigns” to assign them.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">
                      {a.act_id}
                      {a.business_name && ` · ${a.business_name}`}
                      {a.last_synced_at
                        ? ` · synced ${formatDistanceToNow(new Date(a.last_synced_at), { addSuffix: true })}`
                        : " · never synced"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {shared && (
                      <button
                        type="button"
                        onClick={() => setMapperAccount(a)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                        title="Assign specific campaigns to this client"
                      >
                        <Settings2 className="h-3 w-3" /> Map campaigns
                      </button>
                    )}
                    <a
                      href={`https://business.facebook.com/adsmanager/manage/accounts?act=${a.act_id.replace(/^act_/, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() => unlinkAccount(a)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                      title="Unlink from this client"
                    >
                      <Unlink className="h-3 w-3" /> Unlink
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {mapperAccount && (
          <CampaignClientMapperDialog
            open={!!mapperAccount}
            onOpenChange={(v) => { if (!v) setMapperAccount(null); }}
            adAccountId={mapperAccount.id}
            accountLabel={mapperAccount.account_name || mapperAccount.act_id}
            memberClients={mapperMembers ?? [{ id: clientId, name: "This client" }]}
            onSaved={refresh}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
