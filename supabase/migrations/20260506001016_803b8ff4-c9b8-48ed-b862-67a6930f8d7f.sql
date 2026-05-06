
-- Per-workspace integration credentials
CREATE TABLE public.integration_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE,
  ghl_api_key text,
  clickup_api_token text,
  clickup_default_list_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view integration_configs"
  ON public.integration_configs FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Owners/admins write integration_configs"
  ON public.integration_configs FOR INSERT
  WITH CHECK (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE POLICY "Owners/admins update integration_configs"
  ON public.integration_configs FOR UPDATE
  USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE POLICY "Owners/admins delete integration_configs"
  ON public.integration_configs FOR DELETE
  USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER trg_integration_configs_updated
  BEFORE UPDATE ON public.integration_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-client overrides
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ghl_location_id text,
  ADD COLUMN IF NOT EXISTS clickup_list_id text;

-- Lead-tracking columns
ALTER TABLE public.meta_leads
  ADD COLUMN IF NOT EXISTS ghl_check_status text,  -- null | 'pending' | 'found' | 'missing' | 'flagged'
  ADD COLUMN IF NOT EXISTS ghl_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS clickup_task_id text;

CREATE INDEX IF NOT EXISTS idx_meta_leads_ghl_check
  ON public.meta_leads (workspace_id, ghl_check_status, created_time);
