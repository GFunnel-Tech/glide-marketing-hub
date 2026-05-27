ALTER TABLE public.ghl_webhook_events ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.ghl_webhook_events ADD COLUMN IF NOT EXISTS ghl_contact_id text;
ALTER TABLE public.ghl_webhook_events ADD COLUMN IF NOT EXISTS ghl_opportunity_id text;
ALTER TABLE public.ghl_webhook_events ADD COLUMN IF NOT EXISTS matched_lead_id uuid;
ALTER TABLE public.ghl_webhook_events ADD COLUMN IF NOT EXISTS applied boolean NOT NULL DEFAULT false;
ALTER TABLE public.ghl_webhook_events ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_ghl_webhook_events_ws ON public.ghl_webhook_events(workspace_id, received_at DESC);
CREATE POLICY "Workspace members view ghl webhook events"
  ON public.ghl_webhook_events FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id));