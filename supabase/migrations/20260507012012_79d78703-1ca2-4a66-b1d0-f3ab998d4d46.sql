
-- Enums
CREATE TYPE public.rebill_cadence AS ENUM ('monthly', 'weekly', 'custom');
CREATE TYPE public.rebill_assignment_level AS ENUM ('account', 'campaign', 'adset', 'ad');
CREATE TYPE public.rebill_invoice_status AS ENUM ('draft', 'sent', 'paid', 'void');

-- Per-client rebill configuration
CREATE TABLE public.rebill_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  client_id INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  markup_pct NUMERIC NOT NULL DEFAULT 100,        -- 103 = 103% of spend
  fixed_fee NUMERIC NOT NULL DEFAULT 0,           -- flat per-period fee
  monthly_minimum NUMERIC NOT NULL DEFAULT 0,     -- floor on total
  cadence public.rebill_cadence NOT NULL DEFAULT 'monthly',
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, client_id)
);

ALTER TABLE public.rebill_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view rebill_configs" ON public.rebill_configs
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners/admins write rebill_configs" ON public.rebill_configs
  FOR INSERT WITH CHECK (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins update rebill_configs" ON public.rebill_configs
  FOR UPDATE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins delete rebill_configs" ON public.rebill_configs
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER rebill_configs_updated
  BEFORE UPDATE ON public.rebill_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ad-object assignments (account / campaign / adset / ad)
CREATE TABLE public.rebill_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  client_id INTEGER NOT NULL,
  ad_account_id UUID NOT NULL,                    -- references meta_ad_accounts.id
  level public.rebill_assignment_level NOT NULL,
  object_id TEXT NOT NULL,                        -- act_id / campaign_id / adset_id / ad_id
  object_name TEXT,
  excluded BOOLEAN NOT NULL DEFAULT false,        -- explicit exclusion overrides parent
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, ad_account_id, level, object_id)
);

CREATE INDEX idx_rebill_assignments_client ON public.rebill_assignments(client_id);
CREATE INDEX idx_rebill_assignments_workspace ON public.rebill_assignments(workspace_id);

ALTER TABLE public.rebill_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view rebill_assignments" ON public.rebill_assignments
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners/admins write rebill_assignments" ON public.rebill_assignments
  FOR INSERT WITH CHECK (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins update rebill_assignments" ON public.rebill_assignments
  FOR UPDATE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins delete rebill_assignments" ON public.rebill_assignments
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER rebill_assignments_updated
  BEFORE UPDATE ON public.rebill_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Generated invoices
CREATE TABLE public.rebill_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  client_id INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  raw_spend NUMERIC NOT NULL DEFAULT 0,
  markup_pct NUMERIC NOT NULL DEFAULT 100,
  fixed_fee NUMERIC NOT NULL DEFAULT 0,
  monthly_minimum NUMERIC NOT NULL DEFAULT 0,
  total_due NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status public.rebill_invoice_status NOT NULL DEFAULT 'draft',
  invoice_number TEXT,
  pdf_url TEXT,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  paid_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,  -- per-object spend breakdown
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rebill_invoices_client ON public.rebill_invoices(client_id);
CREATE INDEX idx_rebill_invoices_workspace_period ON public.rebill_invoices(workspace_id, period_start);

ALTER TABLE public.rebill_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view rebill_invoices" ON public.rebill_invoices
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners/admins write rebill_invoices" ON public.rebill_invoices
  FOR INSERT WITH CHECK (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins update rebill_invoices" ON public.rebill_invoices
  FOR UPDATE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins delete rebill_invoices" ON public.rebill_invoices
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER rebill_invoices_updated
  BEFORE UPDATE ON public.rebill_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
