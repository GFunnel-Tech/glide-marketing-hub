import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ForcePasswordChange } from "@/components/auth/ForcePasswordChange";

const AUTH_REDIRECT_KEY = "metahub-auth-redirect";


export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    const intendedPath = `${location.pathname}${location.search}${location.hash}`;
    if (intendedPath !== "/auth") {
      sessionStorage.setItem(AUTH_REDIRECT_KEY, intendedPath);
    }
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
