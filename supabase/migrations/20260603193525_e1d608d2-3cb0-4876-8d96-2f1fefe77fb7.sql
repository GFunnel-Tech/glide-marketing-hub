ALTER TABLE public.tracking_containers DROP COLUMN IF EXISTS ad_account_id;
ALTER TABLE public.tracking_containers ADD COLUMN ad_account_id text;
CREATE INDEX IF NOT EXISTS tracking_containers_ad_account_idx ON public.tracking_containers(ad_account_id);