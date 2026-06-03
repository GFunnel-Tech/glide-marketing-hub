ALTER TABLE public.tracking_containers
  ADD COLUMN ad_account_id uuid REFERENCES public.meta_ad_accounts(id) ON DELETE SET NULL;
CREATE INDEX ON public.tracking_containers(ad_account_id);