import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Megaphone, UserPlus, FileBarChart,
  Bot, Settings, Search, Bell, Moon, Sun
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { Input } from "@/components/ui/input";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Users, label: "Clients", path: "/clients" },
  { icon: Megaphone, label: "Campaigns", path: "/campaigns" },
  { icon: UserPlus, label: "Onboarding", path: "/onboarding" },
  { icon: FileBarChart, label: "Reports", path: "/reports" },
  { icon: Bot, label: "AI Assistant", path: "/ai", badge: "NEW" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export function TopNav() {
  const location = useLocation();
  const { isDark, toggle } = useTheme();

  return (
    <header className="border-b border-border bg-card">
      {/* Top row */}
      <div className="flex h-14 items-center justify-between px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            E
          </div>
          <span className="text-sm font-semibold text-foreground hidden sm:inline">
            Expert Mortgage Marketing
          </span>
        </div>

        {/* Search */}
        <div className="relative w-64 hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search clients, campaigns..."
            className="pl-9 bg-accent/10 border-border text-sm h-9"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors">
            <Bell className="h-4 w-4" />
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              3
            </span>
          </button>
          <button
            onClick={toggle}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <div className="ml-2 h-8 w-8 shrink-0 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-semibold">
            CM
          </div>
        </div>
      </div>

      {/* Nav row */}
      <nav className="flex items-center gap-1 px-6 overflow-x-auto">
        {navItems.map((item) => {
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
                <span className="text-[10px] bg-primary text-primary-foreground rounded px-1.5 py-0.5 font-medium leading-none">
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
