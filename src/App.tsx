import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
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

const queryClient = new QueryClient();

const GFUNNEL_MODULE_SLUG = "metahub";

function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useRealtimeSync();
  useNotificationsRealtime();
  useConversationsRealtime();
  return <>{children}</>;
}

function GFunnelGate({ children }: { children: React.ReactNode }) {
  const { isEmbedded, isReady, error } = useGFunnel(GFUNNEL_MODULE_SLUG);
  if (isEmbedded && !isReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Connecting to GFunnel…
      </div>
    );
  }
  if (isEmbedded && error) {
    console.warn("[GFunnel] SSO error:", error);
  }
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <GFunnelGate>
            <WorkspaceProvider>
              <RealtimeProvider>
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
                  <Route path="client/:id" element={<ClientProfile />} />
                  <Route path="campaigns" element={<Campaigns />} />
                  <Route path="creatives" element={<Creatives />} />
                  <Route path="ads" element={<Ads />} />
                  <Route path="ads/new" element={<AdCreator />} />
                  <Route path="leads" element={<Leads />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="billing" element={<BillingPage />} />
                  <Route path="affiliate" element={<AffiliatePage />} />
                  <Route path="forecast" element={<ForecastPage />} />
                  <Route path="settings" element={<Settings />} />
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
          </WorkspaceProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
