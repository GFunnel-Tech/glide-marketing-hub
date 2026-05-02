
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  subject text NOT NULL DEFAULT 'New conversation',
  created_by uuid NOT NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conversation_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conv_workspace ON public.conversations(workspace_id, last_message_at DESC);
CREATE INDEX idx_part_user ON public.conversation_participants(user_id);
CREATE INDEX idx_msg_conv ON public.messages(conversation_id, created_at DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Helper: is a user a participant of a conversation? (SECURITY DEFINER avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE user_id = _user_id AND conversation_id = _conversation_id
  )
$$;

-- conversations policies
CREATE POLICY "Participants view conversations"
  ON public.conversations FOR SELECT
  USING (is_conversation_participant(auth.uid(), id));

CREATE POLICY "Workspace members create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (can_write_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());

CREATE POLICY "Participants update conversations"
  ON public.conversations FOR UPDATE
  USING (is_conversation_participant(auth.uid(), id));

-- conversation_participants policies
CREATE POLICY "Users view their own participation"
  ON public.conversation_participants FOR SELECT
  USING (user_id = auth.uid() OR is_conversation_participant(auth.uid(), conversation_id));

CREATE POLICY "Participants add others"
  ON public.conversation_participants FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR is_conversation_participant(auth.uid(), conversation_id)
  );

CREATE POLICY "Users update own participation"
  ON public.conversation_participants FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users leave conversations"
  ON public.conversation_participants FOR DELETE
  USING (user_id = auth.uid());

-- messages policies
CREATE POLICY "Participants view messages"
  ON public.messages FOR SELECT
  USING (is_conversation_participant(auth.uid(), conversation_id));

CREATE POLICY "Participants send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND is_conversation_participant(auth.uid(), conversation_id)
  );

-- Bump conversation last_message_at and notify other participants when a message is sent
CREATE OR REPLACE FUNCTION public.handle_new_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
    AND cp.user_id <> NEW.sender_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_message();

CREATE TRIGGER trg_conversations_updated
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
