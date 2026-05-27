ALTER TABLE public.meta_leads ADD COLUMN IF NOT EXISTS ghl_opportunity_id text;
ALTER TABLE public.meta_leads ADD COLUMN IF NOT EXISTS ghl_status_updated_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_meta_leads_ghl_contact_id ON public.meta_leads(ghl_contact_id);
CREATE INDEX IF NOT EXISTS idx_meta_leads_ghl_opp_id ON public.meta_leads(ghl_opportunity_id);
ALTER TABLE public.integration_configs ADD COLUMN IF NOT EXISTS ghl_webhook_secret text;
UPDATE public.integration_configs SET ghl_webhook_secret = encode(gen_random_bytes(24), 'hex') WHERE ghl_webhook_secret IS NULL;