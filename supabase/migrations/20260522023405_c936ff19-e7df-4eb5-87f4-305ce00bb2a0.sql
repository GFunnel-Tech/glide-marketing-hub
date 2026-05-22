
-- Per-client autonomous optimization toggle
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS autonomous_optimization boolean NOT NULL DEFAULT false;

-- Queue of AI-proposed actions awaiting human approval (when autonomous is off)
CREATE TABLE IF NOT EXISTS public.ai_pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id integer,
  proposed_by uuid NOT NULL,
  action_type text NOT NULL,         -- pause_ads, resume_ads, pause_adsets, resume_adsets, update_adset_budget, duplicate_ad
  payload jsonb NOT NULL,            -- args passed to the tool
  reasoning text,                    -- model's explanation
  status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected, executed, failed
  result jsonb,
  error_message text,
  approved_by uuid,
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_ws_status ON public.ai_pending_actions(workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_client ON public.ai_pending_actions(client_id, status, created_at DESC);

ALTER TABLE public.ai_pending_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pending actions in their workspace"
  ON public.ai_pending_actions FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can update pending actions in their workspace"
  ON public.ai_pending_actions FOR UPDATE
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Members can insert pending actions in their workspace"
  ON public.ai_pending_actions FOR INSERT
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
