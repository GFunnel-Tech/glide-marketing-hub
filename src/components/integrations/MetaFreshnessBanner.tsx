import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";

/** Hours after which Meta data is considered stale. */
const STALE_HOURS = 6;

/**
 * Shows how old the Meta numbers on the dashboard are. Meta stops syncing
 * silently when a token is invalidated, so surface the age of the data
 * instead of letting frozen KPIs look live.
 */
export function MetaFreshnessBanner() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;

  const { data } = useQuery<{ lastSynced: string | null }>({
    queryKey: ["meta_sync_freshness", wsId],
    enabled: !!wsId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("meta_ad_accounts")
        .select("last_synced_at")
        .eq("workspace_id", wsId)
        .not("last_synced_at", "is", null)
        .order("last_synced_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return { lastSynced: data?.[0]?.last_synced_at ?? null };
    },
  });

  if (!data?.lastSynced) return null;
  const ageMs = Date.now() - new Date(data.lastSynced).getTime();
  const ageHours = ageMs / 3_600_000;
  if (ageHours < STALE_HOURS) return null;

  const label =
    ageHours >= 48
      ? `${Math.floor(ageHours / 24)} days`
      : `${Math.floor(ageHours)} hours`;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">Meta data is {label} old</span>
        <span className="ml-2 hidden text-muted-foreground sm:inline">
          Spend, leads and CPL below are from the last successful sync (
          {new Date(data.lastSynced).toLocaleString()}). Reconnect Meta to
          resume live syncing.
        </span>
      </div>
      <Button asChild size="sm" variant="outline" className="h-7">
        <Link to="/settings?tab=integrations">Fix connection</Link>
      </Button>
    </div>
  );
}
