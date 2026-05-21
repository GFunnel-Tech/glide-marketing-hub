CREATE TABLE public.meta_oauth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.meta_connections(id) ON DELETE SET NULL,
  user_id UUID,
  correlation_id TEXT NOT NULL,
  step TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','error','warning')),
  error_code TEXT,
  error_message TEXT,
  meta_user_name TEXT,
  granted_scopes TEXT[] DEFAULT '{}',
  declined_scopes TEXT[] DEFAULT '{}',
  http_status INTEGER,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_meta_oauth_events_workspace ON public.meta_oauth_events(workspace_id, created_at DESC);
CREATE INDEX idx_meta_oauth_events_correlation ON public.meta_oauth_events(correlation_id);

ALTER TABLE public.meta_oauth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view meta_oauth_events"
  ON public.meta_oauth_events FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Owners/admins delete meta_oauth_events"
  ON public.meta_oauth_events FOR DELETE
  USING (workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role]));