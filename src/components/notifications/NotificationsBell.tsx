import { Link, useNavigate } from "react-router-dom";
import { Bell, Check } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead,
} from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

const fmt = (s: string) => {
  const d = new Date(s);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function NotificationsBell() {
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();
  const unread = notifications.filter((n) => !n.read_at).length;
  // Payment issues are top priority: unread billing alerts always float to the top.
  const rank = (n: any) => (n.type === "payment_failed" && !n.read_at ? 0 : 1);
  const recent = [...notifications].sort((a, b) => rank(a) - rank(b)).slice(0, 8);
  const criticalUnread = notifications.filter((n) => n.type === "payment_failed" && !n.read_at).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className={cn(
              "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
              criticalUnread > 0 ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
            )}>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button
              onClick={() => markAll.mutate()}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              <Check className="h-3 w-3" /> Mark all read
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            You're all caught up.
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {recent.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.read_at) markRead.mutate(n.id);
                  if (n.link) navigate(n.link);
                }}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-b border-border hover:bg-accent/50 transition-colors flex gap-2",
                  !n.read_at && "bg-primary/5",
                  n.type === "payment_failed" && !n.read_at && "bg-destructive/5"
                )}
              >
                <span className={cn(
                  "mt-1.5 h-2 w-2 rounded-full shrink-0",
                  !n.read_at ? (n.type === "payment_failed" ? "bg-destructive" : "bg-primary") : "bg-transparent"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">{fmt(n.created_at)}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <Link
          to="/notifications"
          className="block text-center text-xs text-primary hover:underline py-2 border-t border-border"
        >
          View all notifications
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
