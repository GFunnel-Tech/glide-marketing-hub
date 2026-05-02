import { Link } from "react-router-dom";
import { Check, Trash2, Bell } from "lucide-react";
import {
  useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useDeleteNotification,
} from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

const fmt = (s: string) => new Date(s).toLocaleString();

export default function Notifications() {
  const { data: notifications = [], isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const del = useDeleteNotification();
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unread > 0 ? `${unread} unread` : "You're all caught up."}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={() => markAll.mutate()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <Check className="h-4 w-4" /> Mark all as read
          </button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Bell className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={cn(
                "flex items-start gap-3 p-4 hover:bg-accent/30 transition-colors",
                !n.read_at && "bg-primary/5"
              )}
            >
              <span className={cn("mt-2 h-2 w-2 rounded-full shrink-0", !n.read_at ? "bg-primary" : "bg-muted")} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {n.link ? (
                      <Link
                        to={n.link}
                        onClick={() => !n.read_at && markRead.mutate(n.id)}
                        className="text-sm font-semibold text-foreground hover:text-primary"
                      >
                        {n.title}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-foreground">{n.title}</span>
                    )}
                    {n.body && <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{fmt(n.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!n.read_at && (
                      <button
                        onClick={() => markRead.mutate(n.id)}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                        title="Mark as read"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => del.mutate(n.id)}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
