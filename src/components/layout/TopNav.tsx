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
