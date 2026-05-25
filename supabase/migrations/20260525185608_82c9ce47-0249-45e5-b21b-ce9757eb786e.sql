
-- Scheduled optimization runs (recurring AI agent invocations per client)
CREATE TABLE public.client_optimization_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id integer NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cadence text NOT NULL DEFAULT 'daily' CHECK (cadence IN ('daily','weekly')),
  day_of_week smallint CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)), -- 0=Sun
  run_hour smallint NOT NULL DEFAULT 9 CHECK (run_hour >= 0 AND run_hour <= 23),
  timezone text NOT NULL DEFAULT 'UTC',
  prompt_override text,
  active boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  last_status text,
  last_summary text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

CREATE INDEX idx_cos_next_run ON public.client_optimization_schedules (next_run_at) WHERE active;
CREATE INDEX idx_cos_workspace ON public.client_optimization_schedules (workspace_id);

ALTER TABLE public.client_optimization_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members view opt schedules" ON public.client_optimization_schedules
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members insert opt schedules" ON public.client_optimization_schedules
  FOR INSERT WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());
CREATE POLICY "ws members update opt schedules" ON public.client_optimization_schedules
  FOR UPDATE USING (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "ws admins delete opt schedules" ON public.client_optimization_schedules
  FOR DELETE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER trg_cos_updated_at
  BEFORE UPDATE ON public.client_optimization_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Log of every scheduled run for transparency
CREATE TABLE public.optimization_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES public.client_optimization_schedules(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL,
  client_id integer NOT NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL, -- 'ok' | 'error' | 'skipped'
  summary text,
  tool_events jsonb,
  error text
);

CREATE INDEX idx_orl_client ON public.optimization_run_log (client_id, triggered_at DESC);
CREATE INDEX idx_orl_workspace ON public.optimization_run_log (workspace_id, triggered_at DESC);

ALTER TABLE public.optimization_run_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members view opt logs" ON public.optimization_run_log
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
