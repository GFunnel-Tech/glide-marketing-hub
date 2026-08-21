import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useUnreadMessageCount } from "@/hooks/useMessages";
import {
  LayoutDashboard, Megaphone, UserPlus, FileBarChart,
  Bot, Settings, Moon, Sun, MessageSquare, Facebook, Loader2, Inbox, Shield, Receipt, Sparkles, CreditCard, Coins, TrendingUp, ChevronDown, Radar, Calendar as CalendarIcon,
  Rocket, Microscope, FlaskConical, Boxes, ChevronRight
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger
} from "@/components/ui/dropdown-menu";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { UserMenu } from "./UserMenu";
import { TasksButton } from "./TasksButton";
import { useHasActiveMetaConnection } from "@/hooks/useMetaConnections";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";

type NavLeaf = { icon: any; label: string; path: string; badge?: string };
type NavBranch = { icon: any; label: string; financeOnly?: boolean; children: NavLeaf[] };
type NavChild = NavLeaf | NavBranch;
type NavGroup = { icon: any; label: string; financeOnly?: boolean; children: NavChild[] };
type NavSingle = NavLeaf;
type NavEntry = NavSingle | NavGroup;

const isGroup = (e: NavEntry | NavChild): e is NavGroup | NavBranch => "children" in e;


const navItems: NavEntry[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: CalendarIcon, label: "Calendar", path: "/calendar" },
  {
    icon: Boxes, label: "Operations", children: [
      { icon: UserPlus, label: "Onboarding", path: "/onboarding" },
      {
        icon: Rocket, label: "Launch", children: [
          { icon: Megaphone, label: "Campaigns", path: "/campaigns" },
          { icon: Sparkles, label: "Creatives", path: "/creatives" },
          { icon: Megaphone, label: "Ads", path: "/ads" },
          { icon: Inbox, label: "Leads", path: "/leads" },
        ]
      },
      {
        icon: FileBarChart, label: "Insights", children: [
          { icon: FileBarChart, label: "Reports", path: "/reports" },
          { icon: Radar, label: "Tracking", path: "/tracking" },
          { icon: Bot, label: "AI Assistant", path: "/ai" },
          { icon: TrendingUp, label: "Trend Briefs", path: "/trend-briefs", badge: "NEW" },
        ]
      },
      { icon: Microscope, label: "Research", path: "/operations/research" },
      {
        icon: CreditCard, label: "Finances", financeOnly: true, children: [
          { icon: CreditCard, label: "Billing", path: "/billing" },
          { icon: Receipt, label: "Rebilling", path: "/rebilling" },
          { icon: Coins, label: "Affiliates", path: "/affiliate" },
          { icon: TrendingUp, label: "Forecast", path: "/forecast" },
        ]
      },
      { icon: FlaskConical, label: "Sandbox", path: "/operations/sandbox", badge: "SOON" },
    ]
  },
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
  const isWorkspaceAdmin =
    currentWorkspace?.role === "owner" || currentWorkspace?.role === "admin";
  const canSeeFinance = isSuperAdmin || isWorkspaceAdmin;
  // Finance lives inside Operations now — strip it for non-admins.
  const filtered = canSeeFinance
    ? navItems
    : navItems.map((e) =>
        isGroup(e)
          ? { ...e, children: e.children.filter((c) => !(isGroup(c) && c.financeOnly)) }
          : e,
      );
  const items: NavEntry[] = isSuperAdmin
    ? [...filtered, { icon: Shield, label: "Admin", path: "/admin" }]
    : filtered;

  const leafActive = (leaf: NavLeaf) =>
    location.pathname === leaf.path ||
    (leaf.path !== "/" && location.pathname.startsWith(leaf.path));
  const groupOrLeafActive = (c: NavChild): boolean =>
    isGroup(c) ? c.children.some((g) => leafActive(g)) : leafActive(c);




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
            onClick={() => navigate("/ai")}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="AI Assistant"
          >
            <Bot className="h-4 w-4" />
          </button>

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


          <TasksButton />

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
        {items.map((item) => {
          const Icon = item.icon;

          if (isGroup(item)) {
            const isActive = item.children.some((c) => groupOrLeafActive(c));
            return (
              <DropdownMenu key={item.label}>
                <DropdownMenuTrigger
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors border-b-2 whitespace-nowrap outline-none",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[190px]">
                  {item.children.map((child) => {
                    const ChildIcon = child.icon;

                    // Nested section (e.g. Operations → Launch → Campaigns)
                    if (isGroup(child)) {
                      const branchActive = child.children.some((g) => leafActive(g));
                      return (
                        <DropdownMenuSub key={child.label}>
                          <DropdownMenuSubTrigger
                            className={cn(
                              "flex items-center gap-2 cursor-pointer",
                              branchActive && "text-primary font-medium"
                            )}
                          >
                            <ChildIcon className="h-4 w-4 shrink-0" />
                            <span className="flex-1">{child.label}</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="min-w-[180px]">
                            {child.children.map((leaf) => (
                              <DropdownMenuItem key={leaf.path} asChild>
                                <Link
                                  to={leaf.path}
                                  className={cn(
                                    "flex items-center gap-2 cursor-pointer",
                                    leafActive(leaf) && "text-primary font-medium"
                                  )}
                                >
                                  <leaf.icon className="h-4 w-4 shrink-0" />
                                  <span className="flex-1">{leaf.label}</span>
                                  {leaf.badge && (
                                    <span className="text-[10px] bg-gradient-primary text-primary-foreground rounded px-1.5 py-0.5 font-medium leading-none">
                                      {leaf.badge}
                                    </span>
                                  )}
                                </Link>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      );
                    }

                    return (
                      <DropdownMenuItem key={child.path} asChild>
                        <Link
                          to={child.path}
                          className={cn(
                            "flex items-center gap-2 cursor-pointer",
                            leafActive(child) && "text-primary font-medium"
                          )}
                        >
                          <ChildIcon className="h-4 w-4 shrink-0" />
                          <span className="flex-1">{child.label}</span>
                          {child.badge && (
                            <span className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-medium leading-none">
                              {child.badge}
                            </span>
                          )}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }


          const isActive =
            location.pathname === item.path ||
            (item.path !== "/" && location.pathname.startsWith(item.path));
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
