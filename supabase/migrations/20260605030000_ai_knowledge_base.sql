-- Knowledge base the AI agent can search for account-specific context,
-- SOPs, playbooks, and notes. Workspace-scoped; client_id is optional so an
-- entry can be global to the workspace or tied to a single client.
CREATE TABLE IF NOT EXISTS public.ai_knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id integer REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_kb_ws ON public.ai_knowledge_base(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_kb_client ON public.ai_knowledge_base(client_id, created_at DESC);

ALTER TABLE public.ai_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members view knowledge base"
  ON public.ai_knowledge_base FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "ws writers insert knowledge base"
  ON public.ai_knowledge_base FOR INSERT
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "ws writers update knowledge base"
  ON public.ai_knowledge_base FOR UPDATE
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "ws writers delete knowledge base"
  ON public.ai_knowledge_base FOR DELETE
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE TRIGGER trg_ai_kb_updated_at
  BEFORE UPDATE ON public.ai_knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
