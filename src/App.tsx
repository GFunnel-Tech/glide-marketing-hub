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
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Leads from "./pages/Leads";
import Notifications from "./pages/Notifications";
import Messages from "./pages/Messages";
import Onboarding from "./pages/Onboarding";
import AiAssistant from "./pages/AiAssistant";
import SuperAdmin from "./pages/SuperAdmin";
import Rebilling from "./pages/Rebilling";
import NotFound from "./pages/NotFound";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useNotificationsRealtime } from "@/hooks/useNotificationsRealtime";
import { useConversationsRealtime } from "@/hooks/useMessages";

const queryClient = new QueryClient();

function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useRealtimeSync();
  useNotificationsRealtime();
  useConversationsRealtime();
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <WorkspaceProvider>
            <RealtimeProvider>
              <Toaster />
              <Sonner />
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/meta/callback" element={<MetaCallback />} />
                <Route path="/client-portal/:id" element={<ClientPortal />} />
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
                  <Route path="leads" element={<Leads />} />
                  <Route path="reports" element={<Reports />} />
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
