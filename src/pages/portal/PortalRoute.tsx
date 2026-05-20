import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalMapping } from "@/hooks/usePortalClient";

export function PortalRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const mapping = usePortalMapping();
  const location = useLocation();

  if (loading || (user && mapping.isLoading)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/portal/login" state={{ from: location }} replace />;
  }

  if (mapping.data === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-6 text-center">
        <h1 className="text-xl font-semibold text-foreground">No portal access yet</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          This account isn't linked to a client. Please contact your EMM account manager to finish setup.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
