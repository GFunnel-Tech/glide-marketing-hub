
CREATE TABLE public.ai_notification_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  slack_enabled boolean NOT NULL DEFAULT false,
  notify_workspace_members boolean NOT NULL DEFAULT true,
  extra_email_recipients text[] NOT NULL DEFAULT '{}',
  slack_channel_id text,
  slack_channel_name text,
  alert_on text NOT NULL DEFAULT 'queued' CHECK (alert_on IN ('queued','executed','both')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members view notif settings" ON public.ai_notification_settings
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws writers insert notif settings" ON public.ai_notification_settings
  FOR INSERT WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "ws writers update notif settings" ON public.ai_notification_settings
  FOR UPDATE USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE TRIGGER trg_ains_updated_at
  BEFORE UPDATE ON public.ai_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger on ai_pending_actions: when a new row is queued (status=pending), fire ai-notify
CREATE OR REPLACE FUNCTION public.notify_ai_pending_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := 'queued';
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'executed' AND OLD.status <> 'executed' THEN
    _event := 'executed';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://kkuvdoejqruszisyojap.supabase.co/functions/v1/ai-notify',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrdXZkb2VqcXJ1c3ppc3lvamFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNDk0NzYsImV4cCI6MjA5MDcyNTQ3Nn0.jTempbX08aDxY7Ak746DKTX1pRGEJw045nkGw2qqlaA"}'::jsonb,
    body := jsonb_build_object(
      'event', _event,
      'action_id', NEW.id,
      'workspace_id', NEW.workspace_id,
      'client_id', NEW.client_id,
      'action_type', NEW.action_type,
      'reasoning', NEW.reasoning,
      'payload', NEW.payload
    )
  );
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_ai_pending_insert
  AFTER INSERT ON public.ai_pending_actions
  FOR EACH ROW EXECUTE FUNCTION public.notify_ai_pending_action();

CREATE TRIGGER trg_notify_ai_pending_executed
  AFTER UPDATE ON public.ai_pending_actions
  FOR EACH ROW EXECUTE FUNCTION public.notify_ai_pending_action();
