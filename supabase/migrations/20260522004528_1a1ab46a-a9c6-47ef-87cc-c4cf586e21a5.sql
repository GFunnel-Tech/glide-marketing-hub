-- Guarantee templates (workspace-level reusable)
CREATE TABLE public.guarantee_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  terms TEXT,
  duration_days INTEGER NOT NULL DEFAULT 30,
  criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.guarantee_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view guarantee_templates" ON public.guarantee_templates
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write guarantee_templates" ON public.guarantee_templates
  FOR INSERT WITH CHECK (can_write_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());
CREATE POLICY "Members update guarantee_templates" ON public.guarantee_templates
  FOR UPDATE USING (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Admins delete guarantee_templates" ON public.guarantee_templates
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role]));

CREATE TRIGGER guarantee_templates_updated_at
  BEFORE UPDATE ON public.guarantee_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Client guarantee instances
CREATE TABLE public.client_guarantees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  client_id INTEGER NOT NULL,
  template_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  terms TEXT,
  criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  deadline DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'on_track',
  visible_to_client BOOLEAN NOT NULL DEFAULT true,
  last_evaluated_at TIMESTAMPTZ,
  last_status_change_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_guarantees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view client_guarantees" ON public.client_guarantees
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write client_guarantees" ON public.client_guarantees
  FOR INSERT WITH CHECK (can_write_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());
CREATE POLICY "Members update client_guarantees" ON public.client_guarantees
  FOR UPDATE USING (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Admins delete client_guarantees" ON public.client_guarantees
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role]));
CREATE POLICY "Portal user reads own client_guarantees" ON public.client_guarantees
  FOR SELECT USING (visible_to_client = true AND is_portal_user_for_client(auth.uid(), client_id));

CREATE INDEX idx_client_guarantees_client ON public.client_guarantees(client_id);
CREATE INDEX idx_client_guarantees_workspace ON public.client_guarantees(workspace_id);

CREATE TRIGGER client_guarantees_updated_at
  BEFORE UPDATE ON public.client_guarantees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Periodic evaluation snapshots
CREATE TABLE public.guarantee_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  client_id INTEGER NOT NULL,
  guarantee_id UUID NOT NULL,
  status TEXT NOT NULL,
  criteria_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  overall_progress NUMERIC NOT NULL DEFAULT 0,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.guarantee_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view guarantee_evaluations" ON public.guarantee_evaluations
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write guarantee_evaluations" ON public.guarantee_evaluations
  FOR INSERT WITH CHECK (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Admins delete guarantee_evaluations" ON public.guarantee_evaluations
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role]));
CREATE POLICY "Portal user reads own guarantee_evaluations" ON public.guarantee_evaluations
  FOR SELECT USING (is_portal_user_for_client(auth.uid(), client_id) AND EXISTS (
    SELECT 1 FROM public.client_guarantees g
    WHERE g.id = guarantee_id AND g.visible_to_client = true
  ));

CREATE INDEX idx_guarantee_evals_guarantee ON public.guarantee_evaluations(guarantee_id, evaluated_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_guarantees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.guarantee_evaluations;