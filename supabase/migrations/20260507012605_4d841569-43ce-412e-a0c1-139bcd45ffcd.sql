CREATE TABLE IF NOT EXISTS public.meta_insights_granular_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  ad_account_id uuid NOT NULL,
  level public.rebill_assignment_level NOT NULL,
  object_id text NOT NULL,
  object_name text,
  parent_campaign_id text,
  parent_adset_id text,
  date date NOT NULL,
  spend numeric NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, level, object_id, date)
);

CREATE INDEX IF NOT EXISTS idx_mig_lookup
  ON public.meta_insights_granular_daily (workspace_id, level, object_id, date);

ALTER TABLE public.meta_insights_granular_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view meta_insights_granular_daily"
  ON public.meta_insights_granular_daily FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER trg_mig_updated_at
  BEFORE UPDATE ON public.meta_insights_granular_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();