import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeEnabledEvents } from "./useNotificationPreferences";

/**
 * Subscribes to notifications inserted/updated for the current user and
 * invalidates the React-Query cache so the bell updates live.
 *
 * Honors the user's notification preferences: if all event types have
 * realtime disabled, no channel is opened. When a notification arrives,
 * the cache is only invalidated if the user wants realtime updates for
 * that event type.
 */
export function useNotificationsRealtime() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { anyRealtime, realtimeFor } = useRealtimeEnabledEvents();

  useEffect(() => {
    if (!user || !anyRealtime) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const eventType = (payload?.new?.type ?? payload?.old?.type) as string | undefined;
          if (eventType && !realtimeFor(eventType as any)) return;
          qc.invalidateQueries({ queryKey: ["notifications", user.id] });
          qc.invalidateQueries({ queryKey: ["notifications_infinite", user.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc, anyRealtime, realtimeFor]);
}
