
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gfunnel_user_profile_id text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_gfunnel_user_profile_id_key
  ON public.profiles (gfunnel_user_profile_id)
  WHERE gfunnel_user_profile_id IS NOT NULL;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS auth_mode text NOT NULL DEFAULT 'member_id';
