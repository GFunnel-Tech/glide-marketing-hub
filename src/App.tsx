import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useEffect } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { buildClientPath } from "@/lib/clientPath";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { AdAccountProvider } from "@/contexts/AdAccountContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ClientPortal from "./pages/ClientPortal";
import MetaCallback from "./pages/MetaCallback";
import ClientProfile from "./pages/ClientProfile";
import Campaigns from "./pages/Campaigns";
import Creatives from "./pages/Creatives";
import Ads from "./pages/Ads";
import AdCreator from "./pages/AdCreator";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Leads from "./pages/Leads";
import Notifications from "./pages/Notifications";
import Messages from "./pages/Messages";
import Onboarding from "./pages/Onboarding";
import AiAssistant from "./pages/AiAssistant";
import SuperAdmin from "./pages/SuperAdmin";
import Rebilling from "./pages/Rebilling";
import DemoGfunnel from "./pages/DemoGfunnel";
import BillingPage from "./pages/BillingPage";
import AffiliatePage from "./pages/AffiliatePage";
import ForecastPage from "./pages/ForecastPage";
import Tracking from "./pages/Tracking";
import Tasks from "./pages/Tasks";
import TrendBriefs from "./pages/TrendBriefs";
import CalendarPage from "./pages/Calendar";
import NotFound from "./pages/NotFound";
import PortalLayout from "./pages/portal/PortalLayout";
import PortalAuth from "./pages/portal/PortalAuth";
import { PortalRoute } from "./pages/portal/PortalRoute";
import PortalDashboard from "./pages/portal/PortalDashboard";
import PortalPerformance from "./pages/portal/PortalPerformance";
import PortalLeads from "./pages/portal/PortalLeads";
import PortalApprovals from "./pages/portal/PortalApprovals";
import PortalCreative from "./pages/portal/PortalCreative";
import PortalDocuments from "./pages/portal/PortalDocuments";
import PortalBilling from "./pages/portal/PortalBilling";
import PortalSupport from "./pages/portal/PortalSupport";
import PortalSettings from "./pages/portal/PortalSettings";
import PortalAcceptInvite from "./pages/portal/PortalAcceptInvite";
import PortalOnboarding from "./pages/portal/PortalOnboarding";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useNotificationsRealtime } from "@/hooks/useNotificationsRealtime";
import { useConversationsRealtime } from "@/hooks/useMessages";
import { useGFunnel } from "@/hooks/useGFunnel";
import { usePointerEventsGuard } from "@/hooks/usePointerEventsGuard";

const queryClient = new QueryClient();

const GFUNNEL_MODULE_SLUG = "metahub";

function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useRealtimeSync();
  useNotificationsRealtime();
  useConversationsRealtime();
  return <>{children}</>;
}

// Mounted once near the router root so a stuck Radix overlay can never leave the
// whole page unclickable (see usePointerEventsGuard).
function PointerEventsGuard() {
  usePointerEventsGuard();
  return null;
}

// Canonicalises the legacy `/client/:id` URL to the workspace-scoped
// `/{workspaceId}/client/:id` shape. While the workspace is still loading we
// keep rendering the page (no redirect) so deep links never dead-end.
function ScopedClientRedirect() {
  const { id } = useParams();
  const location = useLocation();
  const { currentWorkspace, loading } = useWorkspace();

  if (currentWorkspace?.id && id) {
    return (
      <Navigate
        to={buildClientPath(currentWorkspace.id, id, location.search)}
        replace
      />
    );
  }
  if (loading) {
    return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  }
  // No workspace available — fall back to the legacy (unscoped) page.
  return <ClientProfile />;
}

function ScopedClientRoute() {
  const { locationId } = useParams();
  const { workspaces, currentWorkspace, setCurrentWorkspace, loading } = useWorkspace();
  const matchedWorkspace = locationId
    ? workspaces.find((workspace) => workspace.id === locationId)
    : null;

  useEffect(() => {
    if (matchedWorkspace && currentWorkspace?.id !== matchedWorkspace.id) {
      setCurrentWorkspace(matchedWorkspace);
    }
  }, [matchedWorkspace, currentWorkspace?.id, setCurrentWorkspace]);

  if (loading || (matchedWorkspace && currentWorkspace?.id !== matchedWorkspace.id)) {
    return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  }

  return <ClientProfile />;
}

function GFunnelGate({ children }: { children: React.ReactNode }) {
  const { isEmbedded, error } = useGFunnel(GFUNNEL_MODULE_SLUG);
  if (isEmbedded && error) {
    console.warn("[GFunnel] SSO error:", error);
  }
  // Never block render on the GFunnel handshake — SSO completes in the background
  // and AuthProvider will pick up the session. Blocking caused a white screen
  // when the handshake didn't arrive (e.g. opened outside GFunnel iframe).
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <GFunnelGate>
            <WorkspaceProvider>
              <AdAccountProvider>
              <RealtimeProvider>
              <PointerEventsGuard />
              <Toaster />
              <Sonner />
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/meta/callback" element={<MetaCallback />} />
                <Route path="/client-portal/:id" element={<ClientPortal />} />
                <Route path="/demo/gfunnel" element={<DemoGfunnel />} />

                {/* Client Portal */}
                <Route path="/portal/login" element={<PortalAuth />} />
                <Route path="/portal/accept" element={<PortalAcceptInvite />} />
                <Route
                  path="/portal/onboarding"
                  element={
                    <PortalRoute>
                      <PortalOnboarding />
                    </PortalRoute>
                  }
                />
                <Route
                  path="/portal"
                  element={
                    <PortalRoute>
                      <PortalLayout />
                    </PortalRoute>
                  }
                >
                  <Route index element={<PortalDashboard />} />
                  <Route path="performance" element={<PortalPerformance />} />
                  <Route path="leads" element={<PortalLeads />} />
                  <Route path="approvals" element={<PortalApprovals />} />
                  <Route path="creative" element={<PortalCreative />} />
                  <Route path="documents" element={<PortalDocuments />} />
                  <Route path="billing" element={<PortalBilling />} />
                  <Route path="support" element={<PortalSupport />} />
                  <Route path="settings" element={<PortalSettings />} />
                </Route>

                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <DashboardLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Index />} />
                  <Route path="clients" element={<Index />} />
                  <Route path="client/:id" element={<ScopedClientRedirect />} />
                  <Route path=":locationId/client/:id" element={<ScopedClientRoute />} />
                  <Route path="campaigns" element={<Campaigns />} />
                  <Route path="creatives" element={<Creatives />} />
                  <Route path="ads" element={<Ads />} />
                  <Route path="ads/new" element={<AdCreator />} />
                  <Route path="leads" element={<Leads />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="billing" element={<BillingPage />} />
                  <Route path="affiliate" element={<AffiliatePage />} />
                  <Route path="forecast" element={<ForecastPage />} />
                  <Route path="tracking" element={<Tracking />} />
                  <Route path="tasks" element={<Tasks />} />
                  <Route path="calendar" element={<CalendarPage />} />
                  <Route path="trend-briefs" element={<TrendBriefs />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="settings/integrations" element={<Navigate to="/settings?tab=integrations" replace />} />
                  <Route path="onboarding" element={<Onboarding />} />
                  <Route path="rebilling" element={<Rebilling />} />
                  <Route path="ai" element={<AiAssistant />} />
                  <Route path="notifications" element={<Notifications />} />
                  <Route path="messages" element={<Messages />} />
                  <Route path="admin" element={<SuperAdmin />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
              </RealtimeProvider>
              </AdAccountProvider>
            </WorkspaceProvider>
          </GFunnelGate>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
