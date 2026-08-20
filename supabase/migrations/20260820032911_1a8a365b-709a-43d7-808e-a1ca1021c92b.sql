ALTER TABLE public.portal_onboarding
  ADD COLUMN IF NOT EXISTS consent_done   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS info_done      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS images_done    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_done     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS files_done     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submitted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS legal_business_name text,
  ADD COLUMN IF NOT EXISTS brand_display_name  text,
  ADD COLUMN IF NOT EXISTS contact_email       text,
  ADD COLUMN IF NOT EXISTS nmls_id             text,
  ADD COLUMN IF NOT EXISTS brand_tagline       text,
  ADD COLUMN IF NOT EXISTS time_zone           text,
  ADD COLUMN IF NOT EXISTS preferred_contact   text;

DO $$ BEGIN
  CREATE TYPE public.media_asset_kind AS ENUM ('image', 'voice', 'logo', 'file');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.media_drive_status AS ENUM ('pending', 'synced', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.media_processing_status AS ENUM (
    'pending', 'ready_for_processing', 'processing', 'processed', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.client_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id integer NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  uploaded_by uuid,
  kind public.media_asset_kind NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'client-onboarding',
  storage_path text NOT NULL,
  filename text,
  mime_type text,
  byte_size bigint,
  width integer,
  height integer,
  duration_seconds numeric(8,2),
  drive_file_id text,
  drive_sync_status public.media_drive_status NOT NULL DEFAULT 'pending',
  drive_synced_at timestamptz,
  processing_status public.media_processing_status NOT NULL DEFAULT 'pending',
  elevenlabs_voice_id text,
  higgsfield_character_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_media_assets_client ON public.client_media_assets(client_id);
CREATE INDEX IF NOT EXISTS idx_client_media_assets_workspace ON public.client_media_assets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_client_media_assets_kind ON public.client_media_assets(client_id, kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_media_assets TO authenticated;
GRANT ALL ON public.client_media_assets TO service_role;

ALTER TABLE public.client_media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members read media_assets" ON public.client_media_assets;
CREATE POLICY "Workspace members read media_assets" ON public.client_media_assets
  FOR SELECT TO authenticated USING (is_workspace_member(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "Workspace writers manage media_assets" ON public.client_media_assets;
CREATE POLICY "Workspace writers manage media_assets" ON public.client_media_assets
  FOR ALL TO authenticated USING (can_write_workspace(auth.uid(), workspace_id))
  WITH CHECK (can_write_workspace(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "Portal user reads own client media_assets" ON public.client_media_assets;
CREATE POLICY "Portal user reads own client media_assets" ON public.client_media_assets
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.user_id = auth.uid() AND pu.client_id = client_media_assets.client_id
    )
  );

DROP POLICY IF EXISTS "Portal user inserts own client media_assets" ON public.client_media_assets;
CREATE POLICY "Portal user inserts own client media_assets" ON public.client_media_assets
  FOR INSERT TO authenticated WITH CHECK (
    uploaded_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.user_id = auth.uid() AND pu.client_id = client_media_assets.client_id
    )
  );

DROP TRIGGER IF EXISTS trg_client_media_assets_updated ON public.client_media_assets;
CREATE TRIGGER trg_client_media_assets_updated
  BEFORE UPDATE ON public.client_media_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.client_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id integer NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  consent_type text NOT NULL,
  consent_text text NOT NULL,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL DEFAULT 'checkbox',
  user_agent text,
  ip_address text
);
CREATE INDEX IF NOT EXISTS idx_client_consents_client ON public.client_consents(client_id);
CREATE INDEX IF NOT EXISTS idx_client_consents_workspace ON public.client_consents(workspace_id);

GRANT SELECT, INSERT ON public.client_consents TO authenticated;
GRANT ALL ON public.client_consents TO service_role;

ALTER TABLE public.client_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members read consents" ON public.client_consents;
CREATE POLICY "Workspace members read consents" ON public.client_consents
  FOR SELECT TO authenticated USING (is_workspace_member(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "Portal user reads own consents" ON public.client_consents;
CREATE POLICY "Portal user reads own consents" ON public.client_consents
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.user_id = auth.uid() AND pu.client_id = client_consents.client_id
    )
  );

DROP POLICY IF EXISTS "Authenticated user records own consent" ON public.client_consents;
CREATE POLICY "Authenticated user records own consent" ON public.client_consents
  FOR INSERT TO authenticated WITH CHECK (
    granted_by = auth.uid() AND
    (
      can_write_workspace(auth.uid(), workspace_id)
      OR EXISTS (
        SELECT 1 FROM public.portal_users pu
        WHERE pu.user_id = auth.uid() AND pu.client_id = client_consents.client_id
      )
    )
  );

DROP POLICY IF EXISTS "Onboarding read: client portal user or workspace member" ON storage.objects;
CREATE POLICY "Onboarding read: client portal user or workspace member"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-onboarding'
    AND (
      EXISTS (
        SELECT 1 FROM public.portal_users pu
        WHERE pu.user_id = auth.uid() AND pu.client_id::text = split_part(name, '/', 1)
      )
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id::text = split_part(name, '/', 1)
          AND c.workspace_id IS NOT NULL
          AND is_workspace_member(auth.uid(), c.workspace_id)
      )
    )
  );

DROP POLICY IF EXISTS "Onboarding write: client portal user or workspace member" ON storage.objects;
CREATE POLICY "Onboarding write: client portal user or workspace member"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-onboarding'
    AND (
      EXISTS (
        SELECT 1 FROM public.portal_users pu
        WHERE pu.user_id = auth.uid() AND pu.client_id::text = split_part(name, '/', 1)
      )
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id::text = split_part(name, '/', 1)
          AND c.workspace_id IS NOT NULL
          AND can_write_workspace(auth.uid(), c.workspace_id)
      )
    )
  );

DROP POLICY IF EXISTS "Onboarding update: workspace writer" ON storage.objects;
CREATE POLICY "Onboarding update: workspace writer"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'client-onboarding'
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = split_part(name, '/', 1)
        AND c.workspace_id IS NOT NULL
        AND can_write_workspace(auth.uid(), c.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Onboarding delete: workspace admin" ON storage.objects;
CREATE POLICY "Onboarding delete: workspace admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-onboarding'
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = split_part(name, '/', 1)
        AND c.workspace_id IS NOT NULL
        AND workspace_role_of(auth.uid(), c.workspace_id) IN ('owner','admin')
    )
  );

CREATE OR REPLACE VIEW public.client_onboarding_status
WITH (security_invoker = true) AS
SELECT
  c.id AS client_id,
  c.workspace_id,
  c.name,
  c.brand,
  c.status AS client_status,
  po.consent_done,
  po.info_done,
  po.images_done,
  po.voice_done,
  po.files_done,
  po.submitted_at,
  po.completed_at,
  COUNT(*) FILTER (WHERE m.kind = 'image') AS image_count,
  COUNT(*) FILTER (WHERE m.kind = 'voice') AS voice_count,
  COUNT(*) FILTER (WHERE m.drive_sync_status = 'synced')  AS synced_count,
  COUNT(*) FILTER (WHERE m.drive_sync_status = 'failed')  AS failed_sync_count,
  COUNT(*) FILTER (WHERE m.drive_sync_status = 'pending') AS pending_sync_count,
  COUNT(*) FILTER (WHERE m.processing_status = 'ready_for_processing') AS ready_count,
  COUNT(*) FILTER (WHERE m.processing_status = 'processed') AS processed_count,
  COUNT(*) FILTER (WHERE m.processing_status = 'failed')    AS failed_processing_count,
  EXISTS (SELECT 1 FROM public.client_consents cc
          WHERE cc.client_id = c.id AND cc.consent_type = 'voice_likeness') AS has_consent
FROM public.clients c
LEFT JOIN public.client_media_assets m ON m.client_id = c.id
LEFT JOIN public.portal_onboarding po ON po.client_id = c.id
GROUP BY c.id, po.consent_done, po.info_done, po.images_done, po.voice_done,
         po.files_done, po.submitted_at, po.completed_at;

GRANT SELECT ON public.client_onboarding_status TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_assets_ready_for_processing(_client_id integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ws uuid; _count integer;
BEGIN
  SELECT workspace_id INTO _ws FROM public.clients WHERE id = _client_id;
  IF _ws IS NULL THEN RAISE EXCEPTION 'Client % has no workspace', _client_id; END IF;
  IF NOT can_write_workspace(auth.uid(), _ws) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.client_consents
                 WHERE client_id = _client_id AND consent_type = 'voice_likeness') THEN
    RAISE EXCEPTION 'Cannot mark ready: no voice_likeness consent on file';
  END IF;

  UPDATE public.client_media_assets
    SET processing_status = 'ready_for_processing',
        error_message = NULL,
        updated_at = now()
    WHERE client_id = _client_id
      AND kind IN ('image','voice')
      AND processing_status IN ('pending','failed');
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END $$;
GRANT EXECUTE ON FUNCTION public.mark_assets_ready_for_processing(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.retry_drive_sync(_client_id integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ws uuid; _count integer;
BEGIN
  SELECT workspace_id INTO _ws FROM public.clients WHERE id = _client_id;
  IF _ws IS NULL THEN RAISE EXCEPTION 'Client % has no workspace', _client_id; END IF;
  IF NOT can_write_workspace(auth.uid(), _ws) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.client_media_assets
    SET drive_sync_status = 'pending',
        drive_synced_at = NULL,
        error_message = NULL,
        updated_at = now()
    WHERE client_id = _client_id AND drive_sync_status = 'failed';
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END $$;
GRANT EXECUTE ON FUNCTION public.retry_drive_sync(integer) TO authenticated;