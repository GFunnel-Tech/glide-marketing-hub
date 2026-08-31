import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Megaphone, UserPlus, FileBarChart, Target,
  Bot, Settings, ChevronLeft, ChevronRight, LogOut, Calendar as CalendarIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Users, label: "Clients", path: "/clients" },
  { icon: Target, label: "Prospects", path: "/prospects" },
  { icon: Megaphone, label: "Campaigns", path: "/campaigns" },
  { icon: CalendarIcon, label: "Calendar", path: "/calendar" },
  { icon: UserPlus, label: "Onboarding", path: "/onboarding" },
  { icon: FileBarChart, label: "Reports", path: "/reports" },
  { icon: Bot, label: "AI Assistant", path: "/ai", badge: "NEW" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >

      {/* Nav */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
          const Icon = item.icon;

          const link = (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <span className="flex-1">{item.label}</span>
              )}
              {!collapsed && item.badge && (
                <span className="ml-auto text-[10px] bg-primary text-primary-foreground rounded px-1.5 py-0.5 font-medium">
                  {item.badge}
                </span>
              )}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }

          return link;
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-md px-3 py-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* User footer */}
      <div className={cn("border-t border-sidebar-border p-3 flex items-center gap-3", collapsed && "justify-center p-2")}>
        <div className="h-8 w-8 shrink-0 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-semibold">
          CM
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-sidebar-accent-foreground truncate">Cam Mitchell</p>
            <p className="text-xs text-sidebar-foreground">Admin</p>
          </div>
        )}
        {!collapsed && (
          <button className="text-sidebar-foreground hover:text-sidebar-accent-foreground transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
