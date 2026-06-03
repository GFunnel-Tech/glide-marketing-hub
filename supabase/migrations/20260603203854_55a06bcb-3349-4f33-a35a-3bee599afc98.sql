CREATE TABLE public.archived_entities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('campaign','adset','ad')),
  entity_id TEXT NOT NULL,
  archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, entity_type, entity_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.archived_entities TO authenticated;
GRANT ALL ON public.archived_entities TO service_role;

ALTER TABLE public.archived_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view archived entities in their workspace"
  ON public.archived_entities FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can archive entities in their workspace"
  ON public.archived_entities FOR INSERT
  TO authenticated
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Members can unarchive entities in their workspace"
  ON public.archived_entities FOR DELETE
  TO authenticated
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE INDEX idx_archived_entities_ws_type ON public.archived_entities (workspace_id, entity_type);