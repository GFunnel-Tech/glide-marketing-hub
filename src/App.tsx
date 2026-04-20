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
import ClientProfile from "./pages/ClientProfile";
import Campaigns from "./pages/Campaigns";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Onboarding from "./pages/Onboarding";
import AiAssistant from "./pages/AiAssistant";
import NotFound from "./pages/NotFound";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

const queryClient = new QueryClient();

function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useRealtimeSync();
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
                  <Route path="reports" element={<Reports />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="onboarding" element={<Onboarding />} />
                  <Route path="ai" element={<AiAssistant />} />
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
