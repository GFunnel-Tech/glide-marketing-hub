import { NavLink, useNavigate } from "react-router-dom";
import {
  Home, BarChart3, Users, CheckSquare, Image as ImageIcon,
  FileText, CreditCard, LifeBuoy, Settings as SettingsIcon, Bot, LogOut,
  Sparkles, Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { usePortalClient } from "@/hooks/usePortalClient";
import { PortalClientSwitcher } from "@/components/portal/PortalClientSwitcher";
import { usePortalBasePath, usePortalLocationId } from "@/hooks/usePortalLocationScope";

const nav = [
  { to: "", end: true, icon: Home, label: "Dashboard" },
  { to: "/performance", icon: BarChart3, label: "Performance" },
  { to: "/leads", icon: Users, label: "Leads" },
  { to: "/requests", icon: Sparkles, label: "Requests" },
  { to: "/reports", icon: FileText, label: "Reports" },
  { to: "/integrations", icon: Plug, label: "Integrations" },
  { to: "/approvals", icon: CheckSquare, label: "Approvals" },
  { to: "/creative", icon: ImageIcon, label: "Creative" },
  { to: "/documents", icon: FileText, label: "Documents" },
  { to: "/billing", icon: CreditCard, label: "Billing" },
  { to: "/support", icon: LifeBuoy, label: "Support" },
  { to: "/settings", icon: SettingsIcon, label: "Settings" },
];

export function PortalTopNav() {
  const navigate = useNavigate();
  const { client, isLoading } = usePortalClient();
  const base = usePortalBasePath();
  const locationScoped = !!usePortalLocationId();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/portal/login");
  };

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="flex h-14 items-center justify-between gap-3 px-6 border-b border-border/60">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">E</div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {isLoading ? "Loading…" : client?.name ?? "Your account"}
            </p>
          </div>
          {!locationScoped && (
            <div className="hidden md:block w-56 ml-2">
              <PortalClientSwitcher />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <NavLink
            to={`${base}/support`}
            className="hidden sm:flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Bot className="h-4 w-4" /> AI Assistant
          </NavLink>
          <button
            onClick={handleLogout}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav className="flex items-center gap-1 px-6 overflow-x-auto">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={`${base}${item.to}`}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors border-b-2 whitespace-nowrap",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </header>
  );
}
