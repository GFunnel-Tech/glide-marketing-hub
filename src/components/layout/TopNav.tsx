import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useUnreadMessageCount } from "@/hooks/useMessages";
import {
  LayoutDashboard, Users, Megaphone, UserPlus, FileBarChart,
  Bot, Settings, Moon, Sun, MessageSquare, Facebook, Loader2, Inbox, Shield, Receipt, Sparkles, CreditCard, Coins
} from "lucide-react";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { UserMenu } from "./UserMenu";
import { useHasActiveMetaConnection } from "@/hooks/useMetaConnections";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Users, label: "Clients", path: "/clients" },
  { icon: Megaphone, label: "Campaigns", path: "/campaigns" },
  { icon: Sparkles, label: "Creatives", path: "/creatives", badge: "NEW" },
  { icon: Inbox, label: "Leads", path: "/leads" },
  { icon: UserPlus, label: "Onboarding", path: "/onboarding" },
  { icon: FileBarChart, label: "Reports", path: "/reports" },
  { icon: Receipt, label: "Rebilling", path: "/rebilling" },
  { icon: Bot, label: "AI Assistant", path: "/ai", badge: "NEW" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggle } = useTheme();
  const { hasConnection } = useHasActiveMetaConnection();
  const { currentWorkspace } = useWorkspace();
  const { data: unreadMessages = 0 } = useUnreadMessageCount();
  const { data: isSuperAdmin } = useIsSuperAdmin();
  const [connecting, setConnecting] = useState(false);
  const items = isSuperAdmin
    ? [...navItems, { icon: Shield, label: "Admin", path: "/admin" }]
    : navItems;

  const connectMeta = async () => {
    if (!currentWorkspace) return;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-oauth-start", {
        body: { workspaceId: currentWorkspace.id },
      });
      if (error) throw error;
      window.open(data.url, "_blank", "width=600,height=700");
      toast.info("Complete sign-in in the popup, then refresh.");
    } catch (e: any) {
      toast.error(e.message || "Failed to start OAuth");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
      {/* Top row: brand + workspace + user */}
      <div className="flex h-14 items-center justify-between px-6 border-b border-border/60">
        <div className="flex items-center gap-3">
          <WorkspaceSwitcher />
        </div>

        <div className="flex items-center gap-2">
          {!hasConnection && (
            <button
              onClick={connectMeta}
              disabled={connecting}
              className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Facebook className="h-3.5 w-3.5" />}
              Connect Meta
            </button>
          )}

          <button
            onClick={() => navigate("/messages")}
            className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label={`Messages${unreadMessages ? `, ${unreadMessages} unread` : ""}`}
          >
            <MessageSquare className="h-4 w-4" />
            {unreadMessages > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {unreadMessages > 99 ? "99+" : unreadMessages}
              </span>
            )}
          </button>

          <NotificationsBell />

          <button
            onClick={toggle}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <UserMenu />
        </div>
      </div>

      {/* Nav row */}
      <nav className="flex items-center gap-1 px-6 overflow-x-auto">
        {items.map((item: any) => {
          const isActive =
            location.pathname === item.path ||
            (item.path !== "/" && location.pathname.startsWith(item.path));
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors border-b-2 whitespace-nowrap",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
              {item.badge && (
                <span className="text-[10px] bg-gradient-primary text-primary-foreground rounded px-1.5 py-0.5 font-medium leading-none">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
