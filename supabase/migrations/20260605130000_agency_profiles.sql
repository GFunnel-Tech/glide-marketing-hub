-- Agency Profile settings: one row per workspace holding the agency's
-- business profile, physical address, and authorized representative details.
CREATE TABLE public.agency_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- General information
  logo_url text,
  friendly_business_name text,
  legal_business_name text,
  business_email text,
  business_phone text,
  branded_domain text,
  business_website text,
  business_niche text,
  business_currency text NOT NULL DEFAULT 'USD',

  -- Business information
  business_type text,
  business_industry text,
  business_registration_id_type text,
  business_registration_number text,
  business_not_registered boolean NOT NULL DEFAULT false,
  business_regions jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Physical address
  street_address text,
  city text,
  postal_code text,
  state_region text,
  country text NOT NULL DEFAULT 'United States',
  time_zone text NOT NULL DEFAULT 'America/New_York',
  platform_language text NOT NULL DEFAULT 'English (United States)',
  outbound_language text,

  -- Authorized representative
  rep_first_name text,
  rep_last_name text,
  rep_email text,
  rep_job_position text,
  rep_phone text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agency_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view agency_profiles" ON public.agency_profiles
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners/admins insert agency_profiles" ON public.agency_profiles
  FOR INSERT WITH CHECK (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins update agency_profiles" ON public.agency_profiles
  FOR UPDATE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins delete agency_profiles" ON public.agency_profiles
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER trg_agency_profiles_updated BEFORE UPDATE ON public.agency_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for agency logos / branding assets
INSERT INTO storage.buckets (id, name, public) VALUES ('agency-assets', 'agency-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "agency_assets_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'agency-assets');

CREATE POLICY "agency_assets_auth_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'agency-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "agency_assets_auth_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'agency-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "agency_assets_auth_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'agency-assets' AND auth.uid() IS NOT NULL);
