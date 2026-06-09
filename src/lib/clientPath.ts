import { useWorkspace } from "@/contexts/WorkspaceContext";

/**
 * Builds a workspace-scoped client URL: `/{location.id}/client/{client.id}`.
 *
 * The leading segment is the current workspace ("location") id, which keeps
 * client URLs scoped per workspace and scalable across multiple locations.
 * Falls back to the legacy `/client/{id}` shape when no workspace is loaded
 * yet so links never break mid-handshake.
 */
export function buildClientPath(
  workspaceId: string | null | undefined,
  clientId: string | number,
  suffix = "",
) {
  const base = workspaceId
    ? `/${workspaceId}/client/${clientId}`
    : `/client/${clientId}`;
  return `${base}${suffix}`;
}

/** Hook variant that resolves the current workspace id for callers. */
export function useClientPath() {
  const { currentWorkspace } = useWorkspace();
  return (clientId: string | number, suffix = "") =>
    buildClientPath(currentWorkspace?.id, clientId, suffix);
}
