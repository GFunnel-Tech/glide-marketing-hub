
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  workspace_id uuid,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read_at, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Auto-create a notification for each workspace member when a meta_lead arrives
CREATE OR REPLACE FUNCTION public.notify_on_meta_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_name text;
  _link text;
BEGIN
  SELECT name INTO _client_name FROM public.clients WHERE id = NEW.client_id;

  IF NEW.client_id IS NOT NULL THEN
    _link := '/client/' || NEW.client_id;
  ELSE
    _link := '/leads';
  END IF;

  INSERT INTO public.notifications (user_id, workspace_id, type, title, body, link, meta)
  SELECT
    wm.user_id,
    NEW.workspace_id,
    'lead_received',
    'New lead' || COALESCE(' from ' || _client_name, ''),
    COALESCE(NEW.full_name, NEW.email, NEW.phone, 'New Meta lead'),
    _link,
    jsonb_build_object('lead_id', NEW.lead_id, 'client_id', NEW.client_id)
  FROM public.workspace_members wm
  WHERE wm.workspace_id = NEW.workspace_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_meta_lead
  AFTER INSERT ON public.meta_leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_meta_lead();
