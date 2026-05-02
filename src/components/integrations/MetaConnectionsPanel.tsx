import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useClients } from "@/hooks/useDatabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, RefreshCw, Trash2, Link2, Facebook, Info, RotateCw, AlertTriangle, KeyRound, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MetaConnection {
  id: string;
  meta_user_name: string | null;
  connection_type: string;
  status: string;
  token_expires_at: string | null;
  created_at: string;
  last_error: string | null;
}

interface SyncLogEntry {
  id: string;
  connection_id: string | null;
  status: string;
  trigger: string;
  rows_synced: number | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

interface MetaAdAccount {
  id: string;
  connection_id: string;
  client_id: number | null;
  act_id: string;
  account_name: string | null;
  business_name: string | null;
  currency: string | null;
  last_synced_at: string | null;
}

export function MetaConnectionsPanel() {
  const { currentWorkspace } = useWorkspace();
  const { data: clients = [] } = useClients();
  const [connections, setConnections] = useState<MetaConnection[]>([]);
  const [accounts, setAccounts] = useState<MetaAdAccount[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [manualReconnectId, setManualReconnectId] = useState<string | null>(null);
  const [manualReconnectToken, setManualReconnectToken] = useState("");

  const refresh = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    const [c, a, l] = await Promise.all([
      (supabase as any).from("meta_connections").select("*").eq("workspace_id", currentWorkspace.id).order("created_at", { ascending: false }),
      (supabase as any).from("meta_ad_accounts").select("*").eq("workspace_id", currentWorkspace.id).order("account_name"),
      (supabase as any).from("meta_sync_log").select("*").eq("workspace_id", currentWorkspace.id).order("started_at", { ascending: false }).limit(200),
    ]);
    setConnections(c.data ?? []);
    setAccounts(a.data ?? []);
    setSyncLogs(l.data ?? []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [currentWorkspace?.id]);

  const handleOAuthConnect = async () => {
    if (!currentWorkspace) return;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-oauth-start", {
        body: { workspaceId: currentWorkspace.id },
      });
      if (error) throw error;
      window.open(data.url, "_blank", "width=600,height=700");
      toast.info("Complete sign-in in the popup, then refresh this page.");
    } catch (e: any) {
      toast.error(e.message || "Failed to start OAuth");
    } finally {
      setConnecting(false);
    }
  };

  const handleManualConnect = async () => {
    if (!currentWorkspace || !manualToken.trim()) return;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-connect-manual", {
        body: { workspaceId: currentWorkspace.id, accessToken: manualToken.trim() },
      });
      if (error) throw error;
      toast.success(`Connected — ${data.accountsDiscovered} ad accounts discovered`);
      setManualToken("");
      setShowManual(false);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to connect");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm("Disconnect this Meta account? Linked ad accounts will be removed.")) return;
    await (supabase as any).from("meta_connections").delete().eq("id", id);
    toast.success("Disconnected");
    refresh();
  };

  const handleReconnectOAuth = async (id: string) => {
    if (!currentWorkspace) return;
    setReconnectingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("meta-oauth-start", {
        body: { workspaceId: currentWorkspace.id, reconnectId: id },
      });
      if (error) throw error;
      window.open(data.url, "_blank", "width=600,height=700");
      toast.info("Re-authorize in the popup, then refresh this page.");
    } catch (e: any) {
      toast.error(e.message || "Failed to start reconnect");
    } finally {
      setReconnectingId(null);
    }
  };

  const handleManualReconnect = async (id: string) => {
    if (!currentWorkspace || !manualReconnectToken.trim()) return;
    setReconnectingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("meta-connect-manual", {
        body: {
          workspaceId: currentWorkspace.id,
          accessToken: manualReconnectToken.trim(),
          reconnectId: id,
        },
      });
      if (error) throw error;
      toast.success(`Token refreshed — ${data.accountsDiscovered} ad accounts available`);
      setManualReconnectId(null);
      setManualReconnectToken("");
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to refresh token");
    } finally {
      setReconnectingId(null);
    }
  };

  const tokenState = (c: MetaConnection): { label: string; tone: "ok" | "warn" | "bad" } => {
    if (c.status !== "active") return { label: "needs reconnect", tone: "bad" };
    if (!c.token_expires_at) return { label: "no expiry", tone: "ok" };
    const ms = new Date(c.token_expires_at).getTime() - Date.now();
    const days = Math.floor(ms / 86_400_000);
    if (days < 0) return { label: "expired", tone: "bad" };
    if (days < 7) return { label: `expires in ${days}d`, tone: "warn" };
    return { label: `expires in ${days}d`, tone: "ok" };
  };

  const handleSync = async () => {
    if (!currentWorkspace) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-sync", {
        body: { workspaceId: currentWorkspace.id },
      });
      if (error) throw error;
      toast.success(`Synced ${data.rowsSynced} rows`);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleMap = async (adAccountId: string, clientId: number | null) => {
    const { error } = await supabase.functions.invoke("meta-map-account", {
      body: { adAccountId, clientId },
    });
    if (error) toast.error(error.message);
    else { toast.success("Updated mapping"); refresh(); }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Facebook className="h-4 w-4 text-primary" /> Meta Ads Connections
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Connect Meta Business Manager accounts. Performance data syncs hourly and rolls up to mapped clients.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing || !connections.length}>
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              <span className="ml-1">Sync now</span>
            </Button>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" onClick={handleOAuthConnect} disabled={connecting}>
                    {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    <span className="ml-1">Connect with Meta</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-semibold mb-1">What gets connected</p>
                  <ul className="text-xs space-y-0.5 list-disc pl-4">
                    <li>Ad accounts in your Business Manager</li>
                    <li>Campaigns, ad sets & ads</li>
                    <li>Performance metrics (spend, impressions, clicks, conversions)</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {connections.length === 0 && !loading && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Facebook className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">No Meta accounts connected yet</p>
              <p className="text-xs text-muted-foreground">
                Connect your Meta Business Manager to {currentWorkspace?.name ?? "this workspace"} to start syncing ad data.
              </p>
            </div>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="lg" onClick={handleOAuthConnect} disabled={connecting} className="mx-auto">
                    {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Facebook className="h-4 w-4 mr-2" />}
                    Connect with Meta
                    <Info className="h-3.5 w-3.5 ml-2 opacity-70" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-semibold mb-1">What gets connected</p>
                  <ul className="text-xs space-y-0.5 list-disc pl-4">
                    <li>Ad accounts in your Business Manager</li>
                    <li>Campaigns, ad sets & ads</li>
                    <li>Performance metrics (spend, impressions, clicks, conversions)</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              onClick={() => setShowManual(true)}
              className="block mx-auto text-xs text-primary hover:underline"
            >
              Connect with a manual access token instead
            </button>
          </div>
        )}

        <div className="space-y-2">
          {connections.map(c => {
            const ts = tokenState(c);
            const needsAction = ts.tone !== "ok";
            const isReconnecting = reconnectingId === c.id;
            return (
              <div key={c.id} className="rounded border border-border bg-accent/30 px-3 py-2 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn(
                      "h-2 w-2 rounded-full shrink-0",
                      ts.tone === "ok" ? "bg-success" : ts.tone === "warn" ? "bg-warning" : "bg-destructive",
                    )} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.meta_user_name || "Unknown user"}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                        <span>{c.connection_type === "oauth" ? "OAuth" : "Manual token"}</span>
                        <span>·</span>
                        <span className={cn(
                          ts.tone === "warn" && "text-warning",
                          ts.tone === "bad" && "text-destructive",
                        )}>
                          {needsAction && <AlertTriangle className="h-3 w-3 inline mr-0.5" />}
                          {ts.label}
                        </span>
                        {c.token_expires_at && (
                          <>
                            <span>·</span>
                            <span>{new Date(c.token_expires_at).toLocaleDateString()}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.connection_type === "oauth" ? (
                      <Button
                        size="sm"
                        variant={needsAction ? "default" : "outline"}
                        onClick={() => handleReconnectOAuth(c.id)}
                        disabled={isReconnecting}
                      >
                        {isReconnecting
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <RotateCw className="h-3 w-3" />}
                        <span className="ml-1">Reconnect</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant={needsAction ? "default" : "outline"}
                        onClick={() => {
                          setManualReconnectId(manualReconnectId === c.id ? null : c.id);
                          setManualReconnectToken("");
                        }}
                        disabled={isReconnecting}
                      >
                        <KeyRound className="h-3 w-3" />
                        <span className="ml-1">Refresh token</span>
                      </Button>
                    )}
                    <button
                      onClick={() => handleDisconnect(c.id)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      title="Disconnect"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {manualReconnectId === c.id && (
                  <div className="flex gap-2 pl-5">
                    <Input
                      value={manualReconnectToken}
                      onChange={e => setManualReconnectToken(e.target.value)}
                      placeholder="Paste new Meta access token"
                      className="text-xs"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleManualReconnect(c.id)}
                      disabled={isReconnecting || !manualReconnectToken.trim()}
                    >
                      {isReconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Update"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setManualReconnectId(null); setManualReconnectToken(""); }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {needsAction && (
                  <p className="text-xs text-muted-foreground pl-5">
                    {ts.tone === "bad"
                      ? "This connection is no longer syncing. Reconnect to restore data flow."
                      : "Token expires soon. Reconnect now to avoid sync interruptions."}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-border">
          <button onClick={() => setShowManual(s => !s)} className="text-xs text-primary hover:underline">
            {showManual ? "Hide" : "Use a manual access token instead"}
          </button>
          {showManual && (
            <div className="mt-2 flex gap-2">
              <Input
                value={manualToken}
                onChange={e => setManualToken(e.target.value)}
                placeholder="Paste Meta access token"
                className="text-xs"
              />
              <Button size="sm" onClick={handleManualConnect} disabled={connecting || !manualToken.trim()}>
                Connect
              </Button>
            </div>
          )}
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Link2 className="h-4 w-4" /> Ad Accounts ({accounts.length})
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Map each ad account to a client. Multiple ad accounts can roll up to one client.</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/50">
                {["Account", "Business", "Currency", "Client", "Last Sync"].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id} className="border-b border-border last:border-0 hover:bg-accent/20">
                  <td className="px-4 py-2">
                    <div className="font-medium text-foreground">{a.account_name || a.act_id}</div>
                    <div className="text-xs text-muted-foreground font-mono">{a.act_id}</div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{a.business_name || "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{a.currency || "—"}</td>
                  <td className="px-4 py-2">
                    <select
                      value={a.client_id ?? ""}
                      onChange={e => handleMap(a.id, e.target.value ? Number(e.target.value) : null)}
                      className="rounded border border-border bg-background px-2 py-1 text-xs"
                    >
                      <option value="">— Unmapped —</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {a.last_synced_at ? new Date(a.last_synced_at).toLocaleString() : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
