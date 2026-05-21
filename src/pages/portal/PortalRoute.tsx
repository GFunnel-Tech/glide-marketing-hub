import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalClient, useActiveOnboarding } from "@/hooks/usePortalClients";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { Card } from "@/components/ui/card";
import { Clock } from "lucide-react";

export function PortalRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { mappings, activeMapping, activeClientId, isLoading, hasAnyMapping } = usePortalClient();
  const { data: isSuperAdmin } = useIsSuperAdmin();
  const { data: onboarding, isLoading: onbLoading } = useActiveOnboarding(activeClientId);
  const location = useLocation();

  if (loading || (user && isLoading)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/portal/login" state={{ from: location }} replace />;
  }

  if (!hasAnyMapping) {
    if (isSuperAdmin) {
      return <>{children}</>;
    }
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-6 text-center">
        <h1 className="text-xl font-semibold text-foreground">No portal access yet</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          This account isn't linked to a client. Ask your agency for an invite code or invite link.
        </p>
      </div>
    );
  }

  // All mappings pending approval → show waiting screen
  const anyActive = mappings.some((m) => m.status === "active");
  if (!anyActive && !isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <Clock className="h-10 w-10 text-warning mx-auto mb-3" />
          <h1 className="text-xl font-semibold">Awaiting approval</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Your agency has been notified and will approve your access shortly. You'll be able to sign in here once approved.
          </p>
        </Card>
      </div>
    );
  }

  // Active mapping but onboarding not complete → redirect to onboarding (except when already there)
  if (
    activeMapping?.status === "active" &&
    !onbLoading &&
    (!onboarding || !onboarding.completed_at) &&
    !location.pathname.startsWith("/portal/onboarding")
  ) {
    return <Navigate to="/portal/onboarding" replace />;
  }

  return <>{children}</>;
}
