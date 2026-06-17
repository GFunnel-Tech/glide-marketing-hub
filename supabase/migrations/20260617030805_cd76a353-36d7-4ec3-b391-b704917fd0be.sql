
CREATE TABLE public.client_churn_risk (
  client_id integer PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  risk_level text NOT NULL CHECK (risk_level IN ('low','medium','high')),
  score numeric NOT NULL CHECK (score >= 0 AND score <= 100),
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  model text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_churn_risk_workspace ON public.client_churn_risk(workspace_id, risk_level, score DESC);

GRANT SELECT ON public.client_churn_risk TO authenticated;
GRANT ALL ON public.client_churn_risk TO service_role;

ALTER TABLE public.client_churn_risk ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view churn risk in their workspace"
  ON public.client_churn_risk FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Owners/admins can update churn risk"
  ON public.client_churn_risk FOR UPDATE
  TO authenticated
  USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'))
  WITH CHECK (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE POLICY "Owners/admins can insert churn risk"
  ON public.client_churn_risk FOR INSERT
  TO authenticated
  WITH CHECK (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER trg_client_churn_risk_updated
  BEFORE UPDATE ON public.client_churn_risk
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
