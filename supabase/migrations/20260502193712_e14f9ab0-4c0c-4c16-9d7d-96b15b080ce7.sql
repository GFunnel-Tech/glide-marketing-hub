-- 1. Preferences table
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  event_type text NOT NULL,
  in_app_enabled boolean NOT NULL DEFAULT true,
  realtime_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id, event_type)
);

CREATE INDEX idx_notif_prefs_lookup
  ON public.notification_preferences (user_id, workspace_id, event_type);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own preferences"
  ON public.notification_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Users update own preferences"
  ON public.notification_preferences FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own preferences"
  ON public.notification_preferences FOR DELETE
  USING (user_id = auth.uid());

CREATE TRIGGER trg_notif_prefs_updated
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Helper to check if a user wants in-app notifications for an event in a workspace.
-- Defaults to TRUE if no preference row exists.
CREATE OR REPLACE FUNCTION public.notif_pref_enabled(_user_id uuid, _workspace_id uuid, _event_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT in_app_enabled
       FROM public.notification_preferences
       WHERE user_id = _user_id
         AND workspace_id = _workspace_id
         AND event_type = _event_type
       LIMIT 1),
    true
  );
$$;

REVOKE ALL ON FUNCTION public.notif_pref_enabled(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- 3. Update Meta-lead trigger to honor preferences
CREATE OR REPLACE FUNCTION public.notify_on_meta_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
  WHERE wm.workspace_id = NEW.workspace_id
    AND public.notif_pref_enabled(wm.user_id, NEW.workspace_id, 'lead_received');

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_on_meta_lead() FROM PUBLIC, anon, authenticated;

-- 4. Update new-message trigger to honor preferences
CREATE OR REPLACE FUNCTION public.handle_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _conv RECORD;
  _sender_name text;
BEGIN
  UPDATE public.conversations
    SET last_message_at = NEW.created_at, updated_at = NEW.created_at
    WHERE id = NEW.conversation_id
    RETURNING * INTO _conv;

  SELECT COALESCE(display_name, email) INTO _sender_name
    FROM public.profiles WHERE id = NEW.sender_id;

  INSERT INTO public.notifications (user_id, workspace_id, type, title, body, link, meta)
  SELECT
    cp.user_id,
    _conv.workspace_id,
    'new_message',
    'New message from ' || COALESCE(_sender_name, 'a teammate'),
    LEFT(NEW.body, 140),
    '/messages?c=' || NEW.conversation_id,
    jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id)
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id
    AND public.notif_pref_enabled(cp.user_id, _conv.workspace_id, 'new_message');

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_message() FROM PUBLIC, anon, authenticated;