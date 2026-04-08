import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const WATCHED_TABLES = [
  "clients",
  "campaigns",
  "reports",
  "onboarding",
  "leads",
  "activity_log",
  "team_members",
] as const;

/**
 * Subscribes to Postgres changes on all core tables and
 * invalidates the matching React-Query cache so the UI
 * refreshes automatically.
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase.channel("realtime-sync");

    WATCHED_TABLES.forEach((table) => {
      channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        () => {
          queryClient.invalidateQueries({ queryKey: [table] });
        }
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
