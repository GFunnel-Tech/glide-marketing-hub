
CREATE TABLE public.meta_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  ad_account_id uuid NOT NULL,
  client_id integer,
  lead_id text NOT NULL,
  form_id text,
  form_name text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  created_time timestamptz,
  full_name text,
  email text,
  phone text,
  field_data jsonb DEFAULT '[]'::jsonb,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, lead_id)
);

CREATE INDEX idx_meta_leads_workspace ON public.meta_leads(workspace_id);
CREATE INDEX idx_meta_leads_client ON public.meta_leads(client_id);
CREATE INDEX idx_meta_leads_created ON public.meta_leads(created_time DESC);

ALTER TABLE public.meta_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view meta_leads"
  ON public.meta_leads FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER trg_meta_leads_updated
  BEFORE UPDATE ON public.meta_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_leads;
