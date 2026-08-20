import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { REQUIRED_META_SCOPES } from "@/components/integrations/MetaScopesBanner";

export type MetaScopeState =
  | "no_connection"
  | "expired"
  | "missing_scopes"
  | "errored"
  | "ok";

export interface MetaConnectionScopeRow {
  id: string;
  meta_user_name: string | null;
  status: string;
  scopes: string[] | null;
  token_expires_at: string | null;
  last_error: string | null;
  missingScopes: string[];
  isExpired: boolean;
}

export interface MetaScopeStatus {
  state: MetaScopeState;
  connections: MetaConnectionScopeRow[];
  missingScopes: string[]; // union across all active connections
  // Stable signature so the banner can be re-shown when scopes/status change
  signature: string;
}

/**
 * Workspace-wide Meta connection health. Aggregates every Meta connection
 * for the active workspace and reports the worst state so a single banner
 * can render the correct call-to-action.
 */
export function useMetaScopeStatus() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;

  return useQuery<MetaScopeStatus>({
    queryKey: ["meta_scope_status", wsId],
    enabled: !!wsId,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("meta_connections")
        .select("id, meta_user_name, status, scopes, token_expires_at, last_error")
        .eq("workspace_id", wsId);
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        id: string;
        meta_user_name: string | null;
        status: string;
        scopes: string[] | null;
        token_expires_at: string | null;
        last_error: string | null;
      }>;

      const now = Date.now();
      const connections: MetaConnectionScopeRow[] = rows.map((c) => {
        const granted = c.scopes ?? [];
        const missingScopes = REQUIRED_META_SCOPES.filter(
          (s) => !granted.includes(s),
        );
        const isExpired = !!c.token_expires_at && new Date(c.token_expires_at).getTime() < now;
        return { ...c, missingScopes, isExpired };
      });

      if (!connections.length) {
        return {
          state: "no_connection",
          connections,
          missingScopes: [],
          signature: `${wsId}:none`,
        };
      }

      const active = connections.filter((c) => c.status === "active");
      const anyExpired =
        active.some((c) => c.isExpired) ||
        connections.some((c) => c.status === "expired");
      const missingUnion = Array.from(
        new Set(active.flatMap((c) => c.missingScopes)),
      );
      const anyErrored = connections.some(
        (c) => c.status !== "active" || !!c.last_error,
      );

      let state: MetaScopeState = "ok";
      if (anyExpired) state = "expired";
      else if (!active.length) state = "errored";
      else if (missingUnion.length) state = "missing_scopes";
      else if (anyErrored) state = "errored";


      const signature = [
        wsId,
        state,
        connections
          .map(
            (c) =>
              `${c.id}:${c.status}:${(c.scopes ?? []).slice().sort().join(",")}:${c.token_expires_at ?? ""}`,
          )
          .join("|"),
      ].join("::");

      return { state, connections, missingScopes: missingUnion, signature };
    },
  });
}
