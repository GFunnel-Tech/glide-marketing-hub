
CREATE TABLE public.meta_ad_account_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.meta_ad_accounts(id) ON DELETE CASCADE,
  client_id integer NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (ad_account_id, client_id)
);

CREATE INDEX idx_maac_account ON public.meta_ad_account_clients(ad_account_id);
CREATE INDEX idx_maac_client ON public.meta_ad_account_clients(client_id);
CREATE INDEX idx_maac_workspace ON public.meta_ad_account_clients(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ad_account_clients TO authenticated;
GRANT ALL ON public.meta_ad_account_clients TO service_role;

ALTER TABLE public.meta_ad_account_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view maac"
  ON public.meta_ad_account_clients FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members insert maac"
  ON public.meta_ad_account_clients FOR INSERT
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update maac"
  ON public.meta_ad_account_clients FOR UPDATE
  USING (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members delete maac"
  ON public.meta_ad_account_clients FOR DELETE
  USING (public.can_write_workspace(auth.uid(), workspace_id));

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS ad_account_id uuid REFERENCES public.meta_ad_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_ad_account ON public.campaigns(ad_account_id);

UPDATE public.campaigns c
SET ad_account_id = ma.ad_account_id
FROM (
  SELECT DISTINCT ma.campaign_id, ma.ad_account_id
  FROM public.meta_ads ma
  JOIN public.meta_ad_accounts a ON a.id = ma.ad_account_id
  WHERE ma.campaign_id IS NOT NULL
) ma
WHERE c.ad_account_id IS NULL
  AND c.id = ma.campaign_id;

CREATE OR REPLACE FUNCTION public.is_shared_ad_account(_ad_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.meta_ad_account_clients WHERE ad_account_id = _ad_account_id)
$$;
