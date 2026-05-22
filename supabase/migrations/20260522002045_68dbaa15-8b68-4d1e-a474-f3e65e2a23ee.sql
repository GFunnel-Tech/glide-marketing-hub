
-- ============ custom_kpis ============
CREATE TABLE public.custom_kpis (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  client_id integer NULL,
  name text NOT NULL,
  description text NULL,
  unit text NOT NULL DEFAULT 'number',          -- currency | percent | number | ratio
  format jsonb NOT NULL DEFAULT '{"decimals":2,"prefix":"","suffix":""}'::jsonb,
  direction text NOT NULL DEFAULT 'lower_better', -- lower_better | higher_better | range
  formula jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_kpis_unit_chk CHECK (unit IN ('currency','percent','number','ratio')),
  CONSTRAINT custom_kpis_direction_chk CHECK (direction IN ('lower_better','higher_better','range'))
);
CREATE INDEX idx_custom_kpis_ws ON public.custom_kpis(workspace_id);
CREATE INDEX idx_custom_kpis_client ON public.custom_kpis(client_id) WHERE client_id IS NOT NULL;

ALTER TABLE public.custom_kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view custom_kpis"
  ON public.custom_kpis FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Portal user reads own custom_kpis"
  ON public.custom_kpis FOR SELECT
  USING (client_id IS NOT NULL AND public.is_portal_user_for_client(auth.uid(), client_id));

CREATE POLICY "Members write custom_kpis"
  ON public.custom_kpis FOR INSERT
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());

CREATE POLICY "Members update custom_kpis"
  ON public.custom_kpis FOR UPDATE
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Admins delete custom_kpis"
  ON public.custom_kpis FOR DELETE
  USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER trg_custom_kpis_updated_at
  BEFORE UPDATE ON public.custom_kpis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ custom_kpi_alerts ============
CREATE TABLE public.custom_kpi_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  custom_kpi_id uuid NOT NULL REFERENCES public.custom_kpis(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  client_id integer NULL,
  trigger_type text NOT NULL,                  -- threshold | trend
  threshold jsonb NULL,
  trend jsonb NULL,
  severity text NOT NULL DEFAULT 'warning',    -- info | warning | critical
  cooldown_minutes integer NOT NULL DEFAULT 60,
  notify_channels jsonb NOT NULL DEFAULT '{"in_app":true,"email":[]}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_fired_at timestamptz NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_kpi_alerts_trigger_chk CHECK (trigger_type IN ('threshold','trend')),
  CONSTRAINT custom_kpi_alerts_severity_chk CHECK (severity IN ('info','warning','critical'))
);
CREATE INDEX idx_custom_kpi_alerts_kpi ON public.custom_kpi_alerts(custom_kpi_id);
CREATE INDEX idx_custom_kpi_alerts_ws ON public.custom_kpi_alerts(workspace_id);

ALTER TABLE public.custom_kpi_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view custom_kpi_alerts"
  ON public.custom_kpi_alerts FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Portal user reads own custom_kpi_alerts"
  ON public.custom_kpi_alerts FOR SELECT
  USING (client_id IS NOT NULL AND public.is_portal_user_for_client(auth.uid(), client_id));

CREATE POLICY "Members write custom_kpi_alerts"
  ON public.custom_kpi_alerts FOR INSERT
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());

CREATE POLICY "Members update custom_kpi_alerts"
  ON public.custom_kpi_alerts FOR UPDATE
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Admins delete custom_kpi_alerts"
  ON public.custom_kpi_alerts FOR DELETE
  USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER trg_custom_kpi_alerts_updated_at
  BEFORE UPDATE ON public.custom_kpi_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ custom_kpi_evaluations ============
CREATE TABLE public.custom_kpi_evaluations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  custom_kpi_id uuid NOT NULL REFERENCES public.custom_kpis(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  client_id integer NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  value numeric NULL,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_custom_kpi_evals_kpi_client_period
  ON public.custom_kpi_evaluations(custom_kpi_id, client_id, period_end DESC);
CREATE INDEX idx_custom_kpi_evals_ws ON public.custom_kpi_evaluations(workspace_id);

ALTER TABLE public.custom_kpi_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view custom_kpi_evaluations"
  ON public.custom_kpi_evaluations FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Portal user reads own custom_kpi_evaluations"
  ON public.custom_kpi_evaluations FOR SELECT
  USING (client_id IS NOT NULL AND public.is_portal_user_for_client(auth.uid(), client_id));

CREATE POLICY "Members write custom_kpi_evaluations"
  ON public.custom_kpi_evaluations FOR INSERT
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Admins delete custom_kpi_evaluations"
  ON public.custom_kpi_evaluations FOR DELETE
  USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
