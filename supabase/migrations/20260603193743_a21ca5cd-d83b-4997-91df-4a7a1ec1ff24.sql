ALTER TABLE public.tracking_events ADD COLUMN IF NOT EXISTS ad_account_id text;
CREATE INDEX IF NOT EXISTS tracking_events_ad_account_idx ON public.tracking_events(ad_account_id);