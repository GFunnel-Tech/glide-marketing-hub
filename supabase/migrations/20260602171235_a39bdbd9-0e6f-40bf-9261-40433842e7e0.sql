-- Review queue for medium-confidence automap suggestions (both Meta and GHL)
CREATE TABLE public.account_match_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('meta','ghl')),
  -- For 'meta': meta_ad_accounts.id (uuid as text). For 'ghl': ghl_locations.location_id (text).
  source_ref TEXT NOT NULL,
  source_name TEXT,
  source_business_name TEXT,
  client_id INTEGER NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  score NUMERIC(4,3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, source, source_ref)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_match_suggestions TO authenticated;
GRANT ALL ON public.account_match_suggestions TO service_role;

ALTER TABLE public.account_match_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view match suggestions"
  ON public.account_match_suggestions FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace writers can insert match suggestions"
  ON public.account_match_suggestions FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Workspace writers can update match suggestions"
  ON public.account_match_suggestions FOR UPDATE TO authenticated
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Workspace writers can delete match suggestions"
  ON public.account_match_suggestions FOR DELETE TO authenticated
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE INDEX idx_account_match_suggestions_ws_status
  ON public.account_match_suggestions(workspace_id, status);

CREATE TRIGGER trg_match_suggestions_updated_at
  BEFORE UPDATE ON public.account_match_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Map a Meta lead form to a specific GHL pipeline/stage for a client
CREATE TABLE public.meta_form_pipeline_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL,
  form_name TEXT,
  pipeline_id TEXT NOT NULL,
  pipeline_name TEXT,
  stage_id TEXT,
  stage_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, form_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_form_pipeline_map TO authenticated;
GRANT ALL ON public.meta_form_pipeline_map TO service_role;

ALTER TABLE public.meta_form_pipeline_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view form pipeline map"
  ON public.meta_form_pipeline_map FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace writers can insert form pipeline map"
  ON public.meta_form_pipeline_map FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Workspace writers can update form pipeline map"
  ON public.meta_form_pipeline_map FOR UPDATE TO authenticated
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Workspace writers can delete form pipeline map"
  ON public.meta_form_pipeline_map FOR DELETE TO authenticated
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE INDEX idx_meta_form_pipeline_map_client
  ON public.meta_form_pipeline_map(client_id);

CREATE TRIGGER trg_meta_form_pipeline_map_updated_at
  BEFORE UPDATE ON public.meta_form_pipeline_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();