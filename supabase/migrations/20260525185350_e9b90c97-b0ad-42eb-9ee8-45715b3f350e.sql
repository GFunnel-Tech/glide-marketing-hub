CREATE TABLE IF NOT EXISTS public.client_optimization_rules (
  client_id integer PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  max_cpl_absolute numeric(10,2),
  max_cpl_multiplier numeric(4,2) NOT NULL DEFAULT 1.50,
  min_ctr numeric(5,2) NOT NULL DEFAULT 1.00,
  max_frequency numeric(4,2) NOT NULL DEFAULT 3.50,
  min_spend_before_pause numeric(10,2) NOT NULL DEFAULT 50.00,
  min_leads_threshold integer NOT NULL DEFAULT 3,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cor_cpl_mult_pos CHECK (max_cpl_multiplier > 0),
  CONSTRAINT cor_ctr_range CHECK (min_ctr >= 0 AND min_ctr <= 100),
  CONSTRAINT cor_freq_pos CHECK (max_frequency > 0),
  CONSTRAINT cor_spend_pos CHECK (min_spend_before_pause >= 0),
  CONSTRAINT cor_leads_pos CHECK (min_leads_threshold >= 0),
  CONSTRAINT cor_cpl_abs_pos CHECK (max_cpl_absolute IS NULL OR max_cpl_absolute > 0)
);

ALTER TABLE public.client_optimization_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members view rules"
  ON public.client_optimization_rules FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "ws members write rules"
  ON public.client_optimization_rules FOR INSERT
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "ws members update rules"
  ON public.client_optimization_rules FOR UPDATE
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "ws members delete rules"
  ON public.client_optimization_rules FOR DELETE
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE TRIGGER trg_cor_updated_at
  BEFORE UPDATE ON public.client_optimization_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_cor_workspace ON public.client_optimization_rules(workspace_id);