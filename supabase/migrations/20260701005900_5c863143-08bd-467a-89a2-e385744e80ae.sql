
-- Portal slug on clients (stable URL like /portal/<slug>)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS portal_slug text;

UPDATE public.clients
SET portal_slug = regexp_replace(lower(coalesce(brand, name, 'client-' || id::text)), '[^a-z0-9]+', '-', 'g') || '-' || id::text
WHERE portal_slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_portal_slug ON public.clients(portal_slug);

-- ================================================================
-- Client-side request tables (campaign / report / integration)
-- ================================================================

-- Helper: is the calling user allowed to see/write for this client?
CREATE OR REPLACE FUNCTION public.can_access_client(_user_id uuid, _client_id integer)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = _client_id AND wm.user_id = _user_id
    )
    OR public.is_portal_user_for_client(_user_id, _client_id)
$$;

-- 1. campaign_requests
CREATE TABLE public.campaign_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id integer NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id uuid,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'new_campaign',
  objective text,
  budget numeric,
  target_audience text,
  creative_notes text,
  status text NOT NULL DEFAULT 'new',
  agency_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_requests TO authenticated;
GRANT ALL ON public.campaign_requests TO service_role;
ALTER TABLE public.campaign_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_requests read" ON public.campaign_requests
  FOR SELECT TO authenticated USING (public.can_access_client(auth.uid(), client_id));
CREATE POLICY "campaign_requests insert" ON public.campaign_requests
  FOR INSERT TO authenticated WITH CHECK (public.can_access_client(auth.uid(), client_id));
CREATE POLICY "campaign_requests update" ON public.campaign_requests
  FOR UPDATE TO authenticated USING (public.can_access_client(auth.uid(), client_id));
CREATE TRIGGER trg_campaign_requests_updated BEFORE UPDATE ON public.campaign_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-set workspace_id from client on insert
CREATE OR REPLACE FUNCTION public.set_request_workspace_from_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.clients WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_campaign_requests_ws BEFORE INSERT ON public.campaign_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_request_workspace_from_client();

-- 2. report_requests
CREATE TABLE public.report_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id integer NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id uuid,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  period_start date,
  period_end date,
  format text NOT NULL DEFAULT 'pdf',
  status text NOT NULL DEFAULT 'new',
  file_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_requests TO authenticated;
GRANT ALL ON public.report_requests TO service_role;
ALTER TABLE public.report_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_requests read" ON public.report_requests
  FOR SELECT TO authenticated USING (public.can_access_client(auth.uid(), client_id));
CREATE POLICY "report_requests insert" ON public.report_requests
  FOR INSERT TO authenticated WITH CHECK (public.can_access_client(auth.uid(), client_id));
CREATE POLICY "report_requests update" ON public.report_requests
  FOR UPDATE TO authenticated USING (public.can_access_client(auth.uid(), client_id));
CREATE TRIGGER trg_report_requests_updated BEFORE UPDATE ON public.report_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_report_requests_ws BEFORE INSERT ON public.report_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_request_workspace_from_client();

-- 3. integration_requests
CREATE TABLE public.integration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id integer NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id uuid,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL,
  credentials_note text,
  status text NOT NULL DEFAULT 'new',
  agency_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_requests TO authenticated;
GRANT ALL ON public.integration_requests TO service_role;
ALTER TABLE public.integration_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_requests read" ON public.integration_requests
  FOR SELECT TO authenticated USING (public.can_access_client(auth.uid(), client_id));
CREATE POLICY "integration_requests insert" ON public.integration_requests
  FOR INSERT TO authenticated WITH CHECK (public.can_access_client(auth.uid(), client_id));
CREATE POLICY "integration_requests update" ON public.integration_requests
  FOR UPDATE TO authenticated USING (public.can_access_client(auth.uid(), client_id));
CREATE TRIGGER trg_integration_requests_updated BEFORE UPDATE ON public.integration_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_integration_requests_ws BEFORE INSERT ON public.integration_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_request_workspace_from_client();

-- ================================================================
-- Auto-provision portal on client insert:
-- - assign portal_slug
-- - fire portal-provision edge function to send invite email
-- ================================================================
CREATE OR REPLACE FUNCTION public.on_client_insert_provision_portal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.portal_slug IS NULL THEN
    NEW.portal_slug := regexp_replace(lower(coalesce(NEW.brand, NEW.name, 'client-' || NEW.id::text)), '[^a-z0-9]+', '-', 'g') || '-' || NEW.id::text;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_client_portal_slug BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.on_client_insert_provision_portal();

CREATE OR REPLACE FUNCTION public.after_client_insert_provision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://kkuvdoejqruszisyojap.supabase.co/functions/v1/portal-provision',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrdXZkb2VqcXJ1c3ppc3lvamFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNDk0NzYsImV4cCI6MjA5MDcyNTQ3Nn0.jTempbX08aDxY7Ak746DKTX1pRGEJw045nkGw2qqlaA"}'::jsonb,
      body := jsonb_build_object('client_id', NEW.id, 'workspace_id', NEW.workspace_id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- do not block client creation on provisioning errors
    NULL;
  END;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_client_after_insert_provision AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.after_client_insert_provision();
