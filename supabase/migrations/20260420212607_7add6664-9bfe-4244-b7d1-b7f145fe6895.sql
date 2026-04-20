ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS bm_id text,
  ADD COLUMN IF NOT EXISTS bm_account_name text;