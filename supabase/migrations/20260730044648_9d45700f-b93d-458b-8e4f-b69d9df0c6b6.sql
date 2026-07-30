CREATE TABLE public.ai_chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id integer,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  endpoint text NOT NULL DEFAULT 'ai-agent',
  title text NOT NULL DEFAULT 'New conversation',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_chat_threads_ws_idx ON public.ai_chat_threads (workspace_id, updated_at DESC);
CREATE INDEX ai_chat_threads_client_idx ON public.ai_chat_threads (client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_chat_threads TO authenticated;
GRANT ALL ON public.ai_chat_threads TO service_role;

ALTER TABLE public.ai_chat_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read workspace threads"
ON public.ai_chat_threads FOR SELECT TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "members create threads"
ON public.ai_chat_threads FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) AND user_id = auth.uid());

CREATE POLICY "owner or admin update threads"
ON public.ai_chat_threads FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.can_write_workspace(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "owner or admin delete threads"
ON public.ai_chat_threads FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.can_write_workspace(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER ai_chat_threads_updated_at
BEFORE UPDATE ON public.ai_chat_threads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();