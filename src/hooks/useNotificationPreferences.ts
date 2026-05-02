import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export type NotificationEventType =
  | "lead_received"
  | "new_message"
  | "info";

export interface NotificationEventDef {
  key: NotificationEventType;
  label: string;
  description: string;
}

export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  {
    key: "lead_received",
    label: "Meta lead received",
    description: "A new lead is captured from a Meta lead form.",
  },
  {
    key: "new_message",
    label: "New direct message",
    description: "A teammate sends you a message in a conversation.",
  },
  {
    key: "info",
    label: "General announcements",
    description: "System updates and informational notices.",
  },
];

export interface NotificationPreference {
  id: string;
  user_id: string;
  workspace_id: string;
  event_type: NotificationEventType;
  in_app_enabled: boolean;
  realtime_enabled: boolean;
}

export function useNotificationPreferences() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const qc = useQueryClient();

  const queryKey = ["notification_preferences", user?.id, currentWorkspace?.id];

  const query = useQuery({
    queryKey,
    enabled: !!user && !!currentWorkspace,
    queryFn: async (): Promise<NotificationPreference[]> => {
      const { data, error } = await (supabase as any)
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .eq("workspace_id", currentWorkspace!.id);
      if (error) throw error;
      return (data ?? []) as NotificationPreference[];
    },
  });

  // Defaults to "true" for both flags when no row exists yet.
  const getPref = (eventType: NotificationEventType) => {
    const row = query.data?.find(p => p.event_type === eventType);
    return {
      in_app_enabled: row?.in_app_enabled ?? true,
      realtime_enabled: row?.realtime_enabled ?? true,
    };
  };

  const upsert = useMutation({
    mutationFn: async (vars: {
      eventType: NotificationEventType;
      in_app_enabled?: boolean;
      realtime_enabled?: boolean;
    }) => {
      if (!user || !currentWorkspace) throw new Error("Not ready");
      const current = getPref(vars.eventType);
      const payload = {
        user_id: user.id,
        workspace_id: currentWorkspace.id,
        event_type: vars.eventType,
        in_app_enabled: vars.in_app_enabled ?? current.in_app_enabled,
        realtime_enabled: vars.realtime_enabled ?? current.realtime_enabled,
      };
      const { error } = await (supabase as any)
        .from("notification_preferences")
        .upsert(payload, { onConflict: "user_id,workspace_id,event_type" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { ...query, getPref, upsert };
}

/**
 * Returns the set of event types the current user wants live (realtime) updates for.
 * Defaults to "all on" when preferences haven't been loaded or saved yet.
 */
export function useRealtimeEnabledEvents(): {
  ready: boolean;
  realtimeFor: (eventType: NotificationEventType) => boolean;
  anyRealtime: boolean;
} {
  const { data, isLoading } = useNotificationPreferences();
  const ready = !isLoading;
  const realtimeFor = (eventType: NotificationEventType) => {
    const row = data?.find(p => p.event_type === eventType);
    return row?.realtime_enabled ?? true;
  };
  const anyRealtime = NOTIFICATION_EVENTS.some(e => realtimeFor(e.key));
  return { ready, realtimeFor, anyRealtime };
}
