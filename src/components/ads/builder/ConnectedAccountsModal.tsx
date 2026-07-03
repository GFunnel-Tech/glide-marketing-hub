import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Facebook, Instagram, Wallet, CheckCircle2, RefreshCw, Plug, AlertTriangle, Search, ExternalLink, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface IdentityPage {
  id: string;
  name: string;
  avatar: string | null;
  canAdvertise: boolean;
  instagram: { id: string; username: string; avatar: string | null } | null;
}
interface IdentityAdAccount {
  act_id: string;
  account_name: string | null;
  business_name: string | null;
  currency: string | null;
}
interface IdentitiesPayload {
  connection: { id: string; userName: string | null; status: string; expiresAt: string | null } | null;
  pages: IdentityPage[];
  adAccounts: IdentityAdAccount[];
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectedAccountsModal({ open, onOpenChange }: Props) {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const state = useAdDraftStore((s) => s.state);
  const patchMany = useAdDraftStore((s) => s.patchMany);

  const [pageQuery, setPageQuery] = useState("");
  const [acctQuery, setAcctQuery] = useState("");
  const [draftPageId, setDraftPageId] = useState<string | null>(state.pageId);
  const [draftIgId, setDraftIgId] = useState<string | null>(state.igAccountId);
  const [draftAcctId, setDraftAcctId] = useState<string | null>(state.adAccountId);
  const [reconnecting, setReconnecting] = useState(false);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["meta_identities", currentWorkspace?.id],
    queryFn: async (): Promise<IdentitiesPayload> => {
      const { data, error } = await supabase.functions.invoke("meta-list-identities", {
        body: { workspaceId: currentWorkspace!.id },
      });
      if (error) throw error;
      return data as IdentitiesPayload;
    },
    enabled: !!currentWorkspace?.id && open,
    staleTime: 60 * 1000,
  });

  // Sync local picker state when modal opens or draft changes
  useEffect(() => {
    if (!open) return;
    setDraftPageId(state.pageId);
    setDraftIgId(state.igAccountId);
    setDraftAcctId(state.adAccountId);
  }, [open, state.pageId, state.igAccountId, state.adAccountId]);

  const pages = data?.pages ?? [];
  const adAccounts = data?.adAccounts ?? [];
  const selectedPage = useMemo(() => pages.find((p) => p.id === draftPageId) ?? null, [pages, draftPageId]);
  const selectedAcct = useMemo(() => adAccounts.find((a) => a.act_id === draftAcctId) ?? null, [adAccounts, draftAcctId]);

  // Auto-pick IG when page changes if it has a linked IG and nothing is selected
  useEffect(() => {
    if (!selectedPage) { setDraftIgId(null); return; }
    if (!draftIgId && selectedPage.instagram) setDraftIgId(selectedPage.instagram.id);
  }, [selectedPage?.id]);

  const filteredPages = useMemo(() => {
    const q = pageQuery.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((p) => p.name.toLowerCase().includes(q) || (p.instagram?.username ?? "").toLowerCase().includes(q));
  }, [pages, pageQuery]);

  const filteredAccts = useMemo(() => {
    const q = acctQuery.trim().toLowerCase();
    if (!q) return adAccounts;
    return adAccounts.filter(
      (a) =>
        (a.account_name ?? "").toLowerCase().includes(q) ||
        (a.business_name ?? "").toLowerCase().includes(q) ||
        a.act_id.toLowerCase().includes(q),
    );
  }, [adAccounts, acctQuery]);

  const hasConnection = !!data?.connection;
  const tokenExpiringSoon =
    data?.connection?.expiresAt &&
    new Date(data.connection.expiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

  const startOAuth = async () => {
    if (!currentWorkspace) return;
    setReconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-oauth-start", {
        body: { workspaceId: currentWorkspace.id },
      });
      if (error) throw error;
      window.open(data.url, "_blank", "width=600,height=700");
      toast.info("Complete sign-in in the popup, then click Refresh.");
    } catch (e: any) {
      toast.error(e.message || "Failed to start OAuth");
    } finally {
      setReconnecting(false);
    }
  };

  const handleRefresh = async () => {
    await refetch();
    await qc.invalidateQueries({ queryKey: ["meta_identities"] });
  };

  const handleSave = () => {
    if (!draftPageId) { toast.error("Pick a Facebook Page"); return; }
    if (!draftAcctId) { toast.error("Pick an Ad Account"); return; }
    const p = pages.find((x) => x.id === draftPageId);
    const a = adAccounts.find((x) => x.act_id === draftAcctId);
    const ig = p?.instagram && p.instagram.id === draftIgId ? p.instagram : null;
    patchMany({
      pageId: draftPageId,
      pageName: p?.name ?? null,
      pageAvatar: p?.avatar ?? null,
      igAccountId: ig?.id ?? null,
      igUsername: ig?.username ?? null,
      adAccountId: draftAcctId,
      adAccountName: a?.account_name ?? null,
      currency: a?.currency ?? state.currency,
    });
    toast.success("Connected accounts saved");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Plug className="h-4 w-4 text-primary" /> Connected Accounts
          </DialogTitle>
          <DialogDescription className="text-xs">
            First pick the Ad Account that will be billed, then the Facebook Page (and optional Instagram) this campaign publishes as.
          </DialogDescription>
        </DialogHeader>

        {/* Connection status */}
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking Meta connection…
            </div>
          ) : !hasConnection ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span>No active Meta connection for this workspace.</span>
              </div>
              <Button size="sm" onClick={startOAuth} disabled={reconnecting} className="h-7 text-xs">
                {reconnecting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Facebook className="h-3 w-3 mr-1" />}
                Connect Meta
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { onOpenChange(false); navigate("/settings?tab=integrations"); }}>
                Advanced setup <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Connected as <strong>{data?.connection?.userName ?? "Meta user"}</strong></span>
                {tokenExpiringSoon && (
                  <Badge variant="outline" className="h-5 text-[10px] border-amber-500/40 text-amber-600">
                    Token expires soon
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleRefresh} disabled={isFetching}>
                  <RefreshCw className={cn("h-3 w-3 mr-1", isFetching && "animate-spin")} /> Refresh
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={startOAuth} disabled={reconnecting}>
                  Reconnect
                </Button>
              </div>
            </div>
          )}
          {error && <p className="text-xs text-destructive mt-2">{(error as any).message}</p>}
          {data?.error && <p className="text-xs text-destructive mt-2">{data.error}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 max-h-[60vh]">
          {/* Ad Accounts — step 1 */}
          <div className="border-r border-border flex flex-col">
            <div className="p-4 pb-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
                  <Wallet className="h-3.5 w-3.5 text-emerald-500" /> Ad Account
                </h3>
                <span className="text-[10px] text-muted-foreground">{adAccounts.length} available</span>
              </div>
              <div className="relative">
                <Search className="h-3 w-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={acctQuery} onChange={(e) => setAcctQuery(e.target.value)} placeholder="Search ad accounts…" className="h-8 pl-7 text-xs" />
              </div>
            </div>
            <ScrollArea className="flex-1 px-3 pb-3">
              {hasConnection && filteredAccts.length === 0 && (
                <div className="text-center p-4">
                  <p className="text-xs text-muted-foreground mb-2">No ad accounts found.</p>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { onOpenChange(false); navigate("/settings?tab=integrations"); }}>
                    <Plus className="h-3 w-3 mr-1" /> Add ad accounts
                  </Button>
                </div>
              )}
              <div className="space-y-1.5">
                {filteredAccts.map((a) => {
                  const active = draftAcctId === a.act_id;
                  return (
                    <button
                      key={a.act_id}
                      type="button"
                      onClick={() => setDraftAcctId(a.act_id)}
                      className={cn(
                        "w-full text-left rounded-lg border px-3 py-2 flex items-center gap-3 transition-all",
                        active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-primary/40 hover:bg-muted/40",
                      )}
                    >
                      <div className="h-9 w-9 rounded-md bg-emerald-500/10 shrink-0 flex items-center justify-center">
                        <Wallet className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{a.account_name || a.act_id}</div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                          <span>{a.act_id}</span>
                          {a.currency && <span>• {a.currency}</span>}
                          {a.business_name && <span>• {a.business_name}</span>}
                        </div>
                      </div>
                      {active && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Pages + IG — step 2 */}
          <div className="flex flex-col">
            <div className="p-4 pb-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <span className={cn("inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold", draftAcctId ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>2</span>
                  <Facebook className="h-3.5 w-3.5 text-[#1877F2]" /> Facebook Page
                </h3>
                <span className="text-[10px] text-muted-foreground">{pages.length} available</span>
              </div>
              <div className="relative">
                <Search className="h-3 w-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={pageQuery} onChange={(e) => setPageQuery(e.target.value)} placeholder="Search pages…" className="h-8 pl-7 text-xs" disabled={!draftAcctId} />
              </div>
            </div>
            <ScrollArea className="flex-1 px-3 pb-3">
              {!draftAcctId ? (
                <div className="text-center p-6">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Pick an Ad Account first. The page you publish as must have advertising access to the selected account.</p>
                </div>
              ) : (
                <>
                  {hasConnection && filteredPages.length === 0 && (
                    <p className="text-xs text-muted-foreground p-3 text-center">No pages match.</p>
                  )}
                  <div className="space-y-1.5">
                    {filteredPages.map((p) => {
                      const active = draftPageId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setDraftPageId(p.id); setDraftIgId(p.instagram?.id ?? null); }}
                          disabled={!p.canAdvertise}
                          className={cn(
                            "w-full text-left rounded-lg border px-3 py-2 flex items-center gap-3 transition-all",
                            active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-primary/40 hover:bg-muted/40",
                            !p.canAdvertise && "opacity-50 cursor-not-allowed",
                          )}
                        >
                          <div className="h-9 w-9 rounded-full bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                            {p.avatar ? <img src={p.avatar} alt="" className="h-full w-full object-cover" /> : <Facebook className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{p.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {p.instagram ? (
                                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                                  <Instagram className="h-3 w-3" /> @{p.instagram.username}
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">No linked Instagram</span>
                              )}
                              {!p.canAdvertise && <span className="text-[10px] text-destructive">No ads access</span>}
                            </div>
                          </div>
                          {active && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </ScrollArea>

            {/* Instagram override */}
            {selectedPage && draftAcctId && (
              <div className="border-t border-border p-3 bg-muted/20">
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-semibold flex items-center gap-1.5"><Instagram className="h-3 w-3 text-pink-500" /> Instagram identity</h4>
                </div>
                {selectedPage.instagram ? (
                  <button
                    type="button"
                    onClick={() => setDraftIgId(draftIgId === selectedPage.instagram!.id ? null : selectedPage.instagram!.id)}
                    className={cn(
                      "w-full rounded-md border px-2.5 py-1.5 flex items-center gap-2 transition-all",
                      draftIgId === selectedPage.instagram.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                    )}
                  >
                    <div className="h-6 w-6 rounded-full bg-muted overflow-hidden shrink-0">
                      {selectedPage.instagram.avatar && <img src={selectedPage.instagram.avatar} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="text-xs font-medium">@{selectedPage.instagram.username}</div>
                    {draftIgId === selectedPage.instagram.id && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto" />}
                  </button>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    No Instagram business account linked to this Page. The ad will run on Facebook only unless you{" "}
                    <a href={`https://www.facebook.com/${selectedPage.id}/settings/?tab=instagram_management`} target="_blank" rel="noreferrer" className="underline">link an Instagram account</a>.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>


        <DialogFooter className="p-4 border-t border-border bg-muted/20">
          <div className="flex-1 text-[11px] text-muted-foreground">
            {selectedPage && selectedAcct ? (
              <span>
                Publishing as <strong>{selectedPage.name}</strong>
                {draftIgId && selectedPage.instagram && <> + <strong>@{selectedPage.instagram.username}</strong></>}
                {" "}from <strong>{selectedAcct.account_name || selectedAcct.act_id}</strong>
              </span>
            ) : (
              <span>Pick an Ad Account, then a Page to continue.</span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!draftPageId || !draftAcctId}>Save selection</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
