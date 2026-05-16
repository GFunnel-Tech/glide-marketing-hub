-- Ad drafts (autosaved)
CREATE TABLE public.ad_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id integer REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  channel text NOT NULL DEFAULT 'meta',
  objective text NOT NULL,
  special_ad_category text,
  countries text[] NOT NULL DEFAULT ARRAY['US']::text[],
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview_summary jsonb,
  status text NOT NULL DEFAULT 'draft',
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  launch_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ad_drafts_workspace ON public.ad_drafts(workspace_id);
CREATE INDEX idx_ad_drafts_client ON public.ad_drafts(client_id);

ALTER TABLE public.ad_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_drafts_select" ON public.ad_drafts FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ad_drafts_insert" ON public.ad_drafts FOR INSERT
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id) AND auth.uid() = created_by);
CREATE POLICY "ad_drafts_update" ON public.ad_drafts FOR UPDATE
  USING (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "ad_drafts_delete" ON public.ad_drafts FOR DELETE
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE TRIGGER ad_drafts_updated_at BEFORE UPDATE ON public.ad_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ad templates
CREATE TABLE public.ad_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id integer REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  channel text NOT NULL DEFAULT 'meta',
  objective text NOT NULL,
  name text NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ad_templates_workspace ON public.ad_templates(workspace_id);

ALTER TABLE public.ad_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_templates_select" ON public.ad_templates FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ad_templates_insert" ON public.ad_templates FOR INSERT
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id) AND auth.uid() = created_by);
CREATE POLICY "ad_templates_update" ON public.ad_templates FOR UPDATE
  USING (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "ad_templates_delete" ON public.ad_templates FOR DELETE
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE TRIGGER ad_templates_updated_at BEFORE UPDATE ON public.ad_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for uploaded creative assets
INSERT INTO storage.buckets (id, name, public) VALUES ('ad-creatives', 'ad-creatives', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ad_creatives_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'ad-creatives');

CREATE POLICY "ad_creatives_auth_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ad-creatives' AND auth.uid() IS NOT NULL);

CREATE POLICY "ad_creatives_auth_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'ad-creatives' AND auth.uid() IS NOT NULL);

CREATE POLICY "ad_creatives_auth_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'ad-creatives' AND auth.uid() IS NOT NULL);