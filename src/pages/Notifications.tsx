import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { Check, Trash2, Bell, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import {
  useInfiniteNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
} from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const fmt = (s: string) => new Date(s).toLocaleString();

export default function Notifications() {
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isError,
    error,
    refetch,
    isRefetching,
  } = useInfiniteNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const del = useDeleteNotification();

  // Toast on next-page errors (only when we already have items rendered).
  useEffect(() => {
    if (isError && (data?.pages?.length ?? 0) > 0) {
      toast.error((error as Error)?.message ?? "Couldn't load more notifications");
    }
  }, [isError, error, data?.pages?.length]);

  const notifications = useMemo(
    () => (data?.pages ?? []).flat(),
    [data],
  );
  const unread = notifications.filter((n) => !n.read_at).length;

  // IntersectionObserver sentinel for auto-loading the next page.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px 0px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
        ) : isError && notifications.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Couldn't load notifications</p>
              <p className="text-xs text-muted-foreground">
                {(error as Error)?.message ?? "Something went wrong. Please try again."}
              </p>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
            >
              {isRefetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Retry
            </button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Bell className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          <>
            {notifications.map((n) => (
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
            ))}

            {/* Sentinel + load-more / retry fallback */}
            <div ref={sentinelRef} className="p-4 flex items-center justify-center">
              {isError && hasNextPage ? (
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-xs text-destructive inline-flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Failed to load more
                  </span>
                  <button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
                  >
                    {isFetchingNextPage ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Retry
                  </button>
                </div>
              ) : hasNextPage ? (
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading more…
                    </>
                  ) : (
                    "Load more"
                  )}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {notifications.length} notification{notifications.length === 1 ? "" : "s"} · end of list
                </span>
              )}
            </div>

          </>
        )}
      </div>
    </div>
  );
}
