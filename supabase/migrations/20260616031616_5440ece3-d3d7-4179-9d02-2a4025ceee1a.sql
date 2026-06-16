CREATE OR REPLACE FUNCTION public.seed_notification_preferences_for_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.notification_preferences (user_id, workspace_id, event_type, in_app_enabled, realtime_enabled)
  SELECT NEW.user_id, NEW.workspace_id, evt.event_type, evt.enabled, evt.enabled
  FROM (VALUES
    ('lead_received',       false),
    ('new_message',         true),
    ('info',                true),
    ('lead_sync_missing',   true),
    ('lead_sync_recovered', true),
    ('lead_sync_failed',    true),
    ('client_status_red',   true),
    ('payment_failed',      true)
  ) AS evt(event_type, enabled)
  ON CONFLICT (user_id, workspace_id, event_type) DO NOTHING;
  RETURN NEW;
END;
$function$;