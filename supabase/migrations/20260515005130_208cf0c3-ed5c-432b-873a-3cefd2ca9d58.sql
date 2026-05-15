
CREATE TABLE public.ad_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id integer,
  channel text NOT NULL,
  action text NOT NULL,
  source_object_id text,
  result_object_id text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  meta jsonb DEFAULT '{}'::jsonb,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ad_action_log_workspace ON public.ad_action_log(workspace_id, created_at DESC);

ALTER TABLE public.ad_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view ad_action_log" ON public.ad_action_log
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members insert ad_action_log" ON public.ad_action_log
  FOR INSERT WITH CHECK (can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Owners/admins update ad_action_log" ON public.ad_action_log
  FOR UPDATE USING (workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role]));

CREATE POLICY "Owners/admins delete ad_action_log" ON public.ad_action_log
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role]));
