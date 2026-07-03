import { Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";

/**
 * Restricts finance pages (billing, rebilling, affiliate, forecast) to
 * workspace owners/admins and super admins. Non-admins are redirected home.
 */
export function FinanceRoute({ children }: { children: ReactNode }) {
  const { currentWorkspace, loading } = useWorkspace();
  const { data: isSuperAdmin, isLoading: superLoading } = useIsSuperAdmin();
  if (loading || superLoading) return null;
  const role = currentWorkspace?.role;
  const allowed = isSuperAdmin || role === "owner" || role === "admin";
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}
