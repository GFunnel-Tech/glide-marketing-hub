import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ExternalLink, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Row = {
  id: string;
  act_id: string;
  account_name: string | null;
  business_name: string | null;
  currency: string | null;
  account_status: number | null;
  is_active: boolean | null;
  last_synced_at: string | null;
};

export function MetaAccountsForClient({ clientId }: { clientId: number }) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["client-meta-accounts", wsId, clientId],
    enabled: !!wsId,
    queryFn: async () => {
      // 1. Accounts where this client is the single owner
      const ownedP = supabase
        .from("meta_ad_accounts")
        .select("id, act_id, account_name, business_name, currency, account_status, is_active, last_synced_at")
        .eq("workspace_id", wsId!)
        .eq("client_id", clientId);
      // 2. Accounts shared with this client via membership table
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
          .select("id, act_id, account_name, business_name, currency, account_status, is_active, last_synced_at")
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

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Meta ad accounts…
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
        <AlertCircle className="h-4 w-4" />
        No Meta ad account linked to this client. Use Account Mapping to link one.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card">
      {accounts.map((a) => {
        const active = a.is_active !== false && (a.account_status === 1 || a.account_status === null);
        return (
          <div key={a.id} className="flex items-start justify-between gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
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
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground truncate">
                {a.act_id}
                {a.business_name && ` · ${a.business_name}`}
                {a.last_synced_at
                  ? ` · synced ${formatDistanceToNow(new Date(a.last_synced_at), { addSuffix: true })}`
                  : " · never synced"}
              </div>
            </div>
            <a
              href={`https://business.facebook.com/adsmanager/manage/accounts?act=${a.act_id.replace(/^act_/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
            >
              Open <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        );
      })}
    </div>
  );
}
