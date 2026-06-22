import { CSSProperties } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Home, BarChart3, Users, CheckSquare, Image as ImageIcon,
  FileText, CreditCard, LifeBuoy, Settings as SettingsIcon, Bot, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { usePortalClient } from "@/hooks/usePortalClient";
import { Badge } from "@/components/ui/badge";
import { PortalClientSwitcher } from "@/components/portal/PortalClientSwitcher";
import { PortalChatBubble } from "@/components/portal/PortalChatBubble";

// EMM brand palette as CSS-var overrides scoped to this subtree.
const emmTheme: CSSProperties = {
  ["--background" as any]: "210 40% 98%",          // #F8FAFC
  ["--foreground" as any]: "222 47% 11%",          // #0F172A
  ["--card" as any]: "0 0% 100%",                  // #FFFFFF
  ["--card-foreground" as any]: "222 47% 11%",
  ["--popover" as any]: "0 0% 100%",
  ["--popover-foreground" as any]: "222 47% 11%",
  ["--primary" as any]: "218 64% 30%",             // #1B3F7B navy
  ["--primary-foreground" as any]: "0 0% 100%",
  ["--secondary" as any]: "210 40% 96%",
  ["--secondary-foreground" as any]: "222 47% 11%",
  ["--muted" as any]: "210 40% 96%",
  ["--muted-foreground" as any]: "215 16% 47%",    // #64748B
  ["--accent" as any]: "217 91% 60%",              // blue accent
  ["--accent-foreground" as any]: "0 0% 100%",
  ["--destructive" as any]: "0 73% 51%",           // #DC2626
  ["--destructive-foreground" as any]: "0 0% 100%",
  ["--border" as any]: "214 32% 91%",              // #E2E8F0
  ["--input" as any]: "214 32% 91%",
  ["--ring" as any]: "218 64% 30%",
  ["--success" as any]: "142 71% 35%",             // #16A34A
  ["--warning" as any]: "32 95% 44%",              // #D97706
};

const nav = [
  { to: "/portal", end: true, icon: Home, label: "Dashboard" },
  { to: "/portal/performance", icon: BarChart3, label: "Performance" },
  { to: "/portal/leads", icon: Users, label: "Leads" },
  { to: "/portal/approvals", icon: CheckSquare, label: "Approvals", badgeKey: "approvals" as const },
  { to: "/portal/creative", icon: ImageIcon, label: "Creative Hub" },
  { to: "/portal/documents", icon: FileText, label: "Documents" },
  { to: "/portal/billing", icon: CreditCard, label: "Billing" },
  { to: "/portal/support", icon: LifeBuoy, label: "Support", badgeKey: "tickets" as const },
  { to: "/portal/settings", icon: SettingsIcon, label: "Settings" },
];

const mobileNav = [
  { to: "/portal", end: true, icon: Home, label: "Home" },
  { to: "/portal/approvals", icon: CheckSquare, label: "Approve" },
  { to: "/portal/creative", icon: ImageIcon, label: "Creative" },
  { to: "/portal/support", icon: LifeBuoy, label: "Support" },
];

const statusStyles: Record<string, string> = {
  GREEN: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30",
  YELLOW: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30",
  RED: "bg-destructive/15 text-destructive border-destructive/30",
  BLOCKED: "bg-muted text-muted-foreground border-border",
};

export default function PortalLayout() {
  const navigate = useNavigate();
  const { client, isLoading } = usePortalClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/portal/login");
  };

  return (
    <div style={emmTheme} className="flex min-h-screen bg-background text-foreground" data-portal-root>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-[hsl(var(--primary))] text-primary-foreground">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-white/10 flex items-center justify-center font-bold">E</div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">EMM Portal</p>
              <p className="text-[11px] text-white/60">Expert Mortgage Marketing</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <PortalClientSwitcher />
            <p className="text-sm font-medium truncate">
              {isLoading ? "Loading…" : client?.name ?? "Your account"}
            </p>
            {client && (
              <span className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                statusStyles[client.status as keyof typeof statusStyles] ?? statusStyles.BLOCKED,
              )}>
                {client.status}
              </span>
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-white/15 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-2 border-t border-white/10 space-y-1">
          <a
            href="https://agents.gfunnel.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/15 transition-colors"
          >
            <Bot className="h-4 w-4" />
            AI Assistant
          </a>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar (mobile shows client name + status) */}
        <header className="md:hidden flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{client?.name ?? "EMM Portal"}</p>
            {client && (
              <span className={cn(
                "mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                statusStyles[client.status],
              )}>
                {client.status}
              </span>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <main className="flex-1 overflow-auto px-4 md:px-8 py-6 pb-24 md:pb-10">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-4 border-t border-border bg-card">
          {mobileNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )
                }
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Floating chat — routes messages to the client's point of contact */}
      <PortalChatBubble />
    </div>
  );
}
