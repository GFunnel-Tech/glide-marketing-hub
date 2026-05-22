ALTER TABLE public.meta_ads
  ADD COLUMN IF NOT EXISTS page_name text,
  ADD COLUMN IF NOT EXISTS page_avatar_url text,
  ADD COLUMN IF NOT EXISTS media_type text;