-- Seed defaults for existing workspace members across all known event types
INSERT INTO public.notification_preferences (user_id, workspace_id, event_type, in_app_enabled, realtime_enabled)
SELECT wm.user_id, wm.workspace_id, evt.event_type, true, true
FROM public.workspace_members wm
CROSS JOIN (VALUES ('lead_received'), ('new_message'), ('info')) AS evt(event_type)
ON CONFLICT (user_id, workspace_id, event_type) DO NOTHING;

-- Trigger function to seed defaults whenever a user joins a workspace
CREATE OR REPLACE FUNCTION public.seed_notification_preferences_for_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id, workspace_id, event_type, in_app_enabled, realtime_enabled)
  SELECT NEW.user_id, NEW.workspace_id, evt.event_type, true, true
  FROM (VALUES ('lead_received'), ('new_message'), ('info')) AS evt(event_type)
  ON CONFLICT (user_id, workspace_id, event_type) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_notification_preferences_for_member() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_seed_notif_prefs_on_member ON public.workspace_members;
CREATE TRIGGER trg_seed_notif_prefs_on_member
AFTER INSERT ON public.workspace_members
FOR EACH ROW
EXECUTE FUNCTION public.seed_notification_preferences_for_member();

-- Add a unique constraint if not present (required by ON CONFLICT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_preferences_user_workspace_event_unique'
  ) THEN
    ALTER TABLE public.notification_preferences
      ADD CONSTRAINT notification_preferences_user_workspace_event_unique
      UNIQUE (user_id, workspace_id, event_type);
  END IF;
END$$;