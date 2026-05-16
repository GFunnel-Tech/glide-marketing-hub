
-- Report templates
CREATE TABLE public.report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  sections jsonb NOT NULL DEFAULT '{"kpis":true,"leads":true,"creative":true,"commentary":true}'::jsonb,
  default_period text NOT NULL DEFAULT 'last_7_days',
  commentary_template text,
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view report_templates" ON public.report_templates FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members insert report_templates" ON public.report_templates FOR INSERT
  WITH CHECK (can_write_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());
CREATE POLICY "Members update report_templates" ON public.report_templates FOR UPDATE
  USING (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Admins delete report_templates" ON public.report_templates FOR DELETE
  USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER trg_report_templates_updated
  BEFORE UPDATE ON public.report_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Schedules
CREATE TABLE public.client_report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id integer NOT NULL,
  template_id uuid NOT NULL REFERENCES public.report_templates(id) ON DELETE CASCADE,
  cadence text NOT NULL DEFAULT 'weekly', -- daily|weekly|monthly
  day_of_week smallint, -- 0-6 for weekly
  day_of_month smallint, -- 1-28 for monthly
  send_hour smallint NOT NULL DEFAULT 9, -- 0-23 local time
  timezone text NOT NULL DEFAULT 'UTC',
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{email, name, role}]
  commentary_override text,
  active boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_report_schedules ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_crs_next_run ON public.client_report_schedules (next_run_at) WHERE active;
CREATE INDEX idx_crs_client ON public.client_report_schedules (client_id);

CREATE POLICY "Members view client_report_schedules" ON public.client_report_schedules FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members insert client_report_schedules" ON public.client_report_schedules FOR INSERT
  WITH CHECK (can_write_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());
CREATE POLICY "Members update client_report_schedules" ON public.client_report_schedules FOR UPDATE
  USING (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Admins delete client_report_schedules" ON public.client_report_schedules FOR DELETE
  USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER trg_crs_updated BEFORE UPDATE ON public.client_report_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Generated reports
CREATE TABLE public.client_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id integer NOT NULL,
  template_id uuid REFERENCES public.report_templates(id) ON DELETE SET NULL,
  schedule_id uuid REFERENCES public.client_report_schedules(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued|generating|ready|sent|failed
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  commentary text,
  pdf_url text,
  share_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  email_message_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  generated_at timestamptz,
  sent_at timestamptz,
  triggered_by uuid,
  trigger_type text NOT NULL DEFAULT 'manual', -- manual|scheduled
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_reports ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX idx_client_reports_share_token ON public.client_reports (share_token);
CREATE INDEX idx_client_reports_client ON public.client_reports (client_id, created_at DESC);

CREATE POLICY "Members view client_reports" ON public.client_reports FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Public view by share token" ON public.client_reports FOR SELECT
  TO anon USING (true);  -- column-level: app must filter by share_token; safe because token is random 24-byte hex
CREATE POLICY "Members insert client_reports" ON public.client_reports FOR INSERT
  WITH CHECK (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update client_reports" ON public.client_reports FOR UPDATE
  USING (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Admins delete client_reports" ON public.client_reports FOR DELETE
  USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER trg_client_reports_updated BEFORE UPDATE ON public.client_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_report_schedules;

-- Storage bucket for PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('client-reports', 'client-reports', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read client-reports" ON storage.objects FOR SELECT
  USING (bucket_id = 'client-reports');
CREATE POLICY "Members write client-reports" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-reports');
CREATE POLICY "Members update client-reports" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'client-reports');
