
CREATE TABLE IF NOT EXISTS public.meta_ads (
  id text PRIMARY KEY,
  workspace_id uuid NOT NULL,
  client_id integer,
  ad_account_id uuid NOT NULL,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  name text,
  effective_status text,
  creative_id text,
  creative_hash text,
  thumbnail_url text,
  video_id text,
  title text,
  body text,
  call_to_action_type text,
  link_url text,
  targeting_summary jsonb,
  spend numeric NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  cpl numeric NOT NULL DEFAULT 0,
  days_active integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_workspace ON public.meta_ads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_client ON public.meta_ads(client_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_creative_hash ON public.meta_ads(creative_hash);

ALTER TABLE public.meta_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view meta_ads" ON public.meta_ads
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
