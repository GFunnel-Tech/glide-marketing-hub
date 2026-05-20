
-- 1. Mapping table
CREATE TABLE public.portal_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  client_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portal user reads own mapping"
  ON public.portal_users FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Super admins read all portal mappings"
  ON public.portal_users FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins manage portal mappings"
  ON public.portal_users FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_portal_users_updated
  BEFORE UPDATE ON public.portal_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Helper: is this auth user the portal user for this client?
CREATE OR REPLACE FUNCTION public.is_portal_user_for_client(_user_id uuid, _client_id integer)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.portal_users
    WHERE user_id = _user_id AND client_id = _client_id
  )
$$;

-- 3. Read-only portal SELECT policies on each relevant table
CREATE POLICY "Portal user reads own client"
  ON public.clients FOR SELECT
  USING (public.is_portal_user_for_client(auth.uid(), id));

CREATE POLICY "Portal user reads own campaigns"
  ON public.campaigns FOR SELECT
  USING (public.is_portal_user_for_client(auth.uid(), client_id));

CREATE POLICY "Portal user reads own meta_ads"
  ON public.meta_ads FOR SELECT
  USING (client_id IS NOT NULL AND public.is_portal_user_for_client(auth.uid(), client_id));

CREATE POLICY "Portal user reads own meta_leads"
  ON public.meta_leads FOR SELECT
  USING (client_id IS NOT NULL AND public.is_portal_user_for_client(auth.uid(), client_id));

CREATE POLICY "Portal user reads own google_leads"
  ON public.google_leads FOR SELECT
  USING (client_id IS NOT NULL AND public.is_portal_user_for_client(auth.uid(), client_id));

CREATE POLICY "Portal user reads own linkedin_leads"
  ON public.linkedin_leads FOR SELECT
  USING (client_id IS NOT NULL AND public.is_portal_user_for_client(auth.uid(), client_id));

CREATE POLICY "Portal user reads own manual_leads"
  ON public.manual_leads FOR SELECT
  USING (client_id IS NOT NULL AND public.is_portal_user_for_client(auth.uid(), client_id));

CREATE POLICY "Portal user reads own leads"
  ON public.leads FOR SELECT
  USING (public.is_portal_user_for_client(auth.uid(), client_id));

CREATE POLICY "Portal user reads own activity_log"
  ON public.activity_log FOR SELECT
  USING (public.is_portal_user_for_client(auth.uid(), client_id));

CREATE POLICY "Portal user reads own client_reports"
  ON public.client_reports FOR SELECT
  USING (public.is_portal_user_for_client(auth.uid(), client_id));

CREATE POLICY "Portal user reads own client_wallets"
  ON public.client_wallets FOR SELECT
  USING (public.is_portal_user_for_client(auth.uid(), client_id));

CREATE POLICY "Portal user reads own meta_ad_accounts"
  ON public.meta_ad_accounts FOR SELECT
  USING (client_id IS NOT NULL AND public.is_portal_user_for_client(auth.uid(), client_id));

-- Daily insights are workspace-scoped without client_id; allow portal users to read
-- only insights for ad accounts mapped to their client.
CREATE POLICY "Portal user reads own meta_insights_daily"
  ON public.meta_insights_daily FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.meta_ad_accounts maa
    WHERE maa.id = meta_insights_daily.ad_account_id
      AND maa.client_id IS NOT NULL
      AND public.is_portal_user_for_client(auth.uid(), maa.client_id)
  ));

CREATE POLICY "Portal user reads own meta_insights_granular_daily"
  ON public.meta_insights_granular_daily FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.meta_ad_accounts maa
    WHERE maa.id = meta_insights_granular_daily.ad_account_id
      AND maa.client_id IS NOT NULL
      AND public.is_portal_user_for_client(auth.uid(), maa.client_id)
  ));
