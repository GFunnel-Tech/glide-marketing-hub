
CREATE TABLE public.meta_lead_form_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  ad_account_id uuid NOT NULL,
  form_id text NOT NULL,
  form_name text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_error_code text,
  consecutive_failures int NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, form_id)
);

GRANT SELECT ON public.meta_lead_form_sync_state TO authenticated;
GRANT ALL ON public.meta_lead_form_sync_state TO service_role;

ALTER TABLE public.meta_lead_form_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their workspace lead-form sync state"
  ON public.meta_lead_form_sync_state FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX meta_lead_form_sync_state_retry_idx
  ON public.meta_lead_form_sync_state (next_retry_at)
  WHERE next_retry_at IS NOT NULL;

CREATE INDEX meta_lead_form_sync_state_account_idx
  ON public.meta_lead_form_sync_state (ad_account_id);

CREATE TRIGGER meta_lead_form_sync_state_updated_at
  BEFORE UPDATE ON public.meta_lead_form_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
