-- 1. Lead stage enum
DO $$ BEGIN
  CREATE TYPE public.lead_stage AS ENUM ('intake','in_progress','converted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Extend meta_leads
ALTER TABLE public.meta_leads
  ADD COLUMN IF NOT EXISTS stage public.lead_stage NOT NULL DEFAULT 'intake',
  ADD COLUMN IF NOT EXISTS note text;

CREATE INDEX IF NOT EXISTS idx_meta_leads_stage ON public.meta_leads(workspace_id, stage);

-- 3. Generic per-channel table factory (same shape across channels)
-- We create 4 tables: google_leads, tiktok_leads, linkedin_leads, manual_leads
-- Each shares the meta_leads-like contract.

CREATE TABLE IF NOT EXISTS public.google_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id integer,
  external_lead_id text,
  campaign_id text, campaign_name text,
  adset_id text, adset_name text,
  ad_id text, ad_name text,
  form_id text, form_name text,
  full_name text, email text, phone text,
  field_data jsonb DEFAULT '[]'::jsonb,
  raw jsonb,
  created_time timestamptz,
  stage public.lead_stage NOT NULL DEFAULT 'intake',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tiktok_leads (LIKE public.google_leads INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.linkedin_leads (LIKE public.google_leads INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.manual_leads (LIKE public.google_leads INCLUDING ALL);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_google_leads_ws ON public.google_leads(workspace_id, stage);
CREATE INDEX IF NOT EXISTS idx_tiktok_leads_ws ON public.tiktok_leads(workspace_id, stage);
CREATE INDEX IF NOT EXISTS idx_linkedin_leads_ws ON public.linkedin_leads(workspace_id, stage);
CREATE INDEX IF NOT EXISTS idx_manual_leads_ws ON public.manual_leads(workspace_id, stage);

-- 4. updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['google_leads','tiktok_leads','linkedin_leads','manual_leads']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

-- 5. Enable RLS
ALTER TABLE public.google_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_leads ENABLE ROW LEVEL SECURITY;

-- 6. RLS policies — applied to all 4
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['google_leads','tiktok_leads','linkedin_leads','manual_leads']
  LOOP
    EXECUTE format('CREATE POLICY "Members view %1$s" ON public.%1$s FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id))', t);
    EXECUTE format('CREATE POLICY "Members insert %1$s" ON public.%1$s FOR INSERT WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id))', t);
    EXECUTE format('CREATE POLICY "Members update %1$s" ON public.%1$s FOR UPDATE USING (public.can_write_workspace(auth.uid(), workspace_id))', t);
    EXECUTE format('CREATE POLICY "Admins delete %1$s" ON public.%1$s FOR DELETE USING (public.workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY[''owner''::workspace_role,''admin''::workspace_role]))', t);
  END LOOP;
END $$;