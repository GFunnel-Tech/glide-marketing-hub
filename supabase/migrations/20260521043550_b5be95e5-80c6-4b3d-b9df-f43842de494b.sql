
-- 1. portal_users: drop unique on user_id, add composite unique, status, invite_id
ALTER TABLE public.portal_users DROP CONSTRAINT IF EXISTS portal_users_user_id_key;
ALTER TABLE public.portal_users
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_approval',
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS invite_id uuid,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;
DO $$ BEGIN
  ALTER TABLE public.portal_users ADD CONSTRAINT portal_users_user_client_unique UNIQUE (user_id, client_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Backfill workspace_id from client
UPDATE public.portal_users pu
  SET workspace_id = c.workspace_id
  FROM public.clients c
  WHERE pu.client_id = c.id AND pu.workspace_id IS NULL;
UPDATE public.portal_users SET status = 'active' WHERE status = 'pending_approval' AND approved_at IS NULL AND accepted_at IS NULL;

-- New RLS for portal_users: workspace members can view/approve portal users for their workspace
DROP POLICY IF EXISTS "Workspace members view portal_users" ON public.portal_users;
CREATE POLICY "Workspace members view portal_users" ON public.portal_users
  FOR SELECT USING (workspace_id IS NOT NULL AND is_workspace_member(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "Workspace admins update portal_users" ON public.portal_users;
CREATE POLICY "Workspace admins update portal_users" ON public.portal_users
  FOR UPDATE USING (workspace_id IS NOT NULL AND workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

DROP POLICY IF EXISTS "Workspace admins delete portal_users" ON public.portal_users;
CREATE POLICY "Workspace admins delete portal_users" ON public.portal_users
  FOR DELETE USING (workspace_id IS NOT NULL AND workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

-- 2. client_invites
CREATE TABLE IF NOT EXISTS public.client_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id integer NOT NULL,
  code text NOT NULL UNIQUE,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  email text,
  status text NOT NULL DEFAULT 'pending',
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_invites_workspace ON public.client_invites(workspace_id);
CREATE INDEX IF NOT EXISTS idx_client_invites_client ON public.client_invites(client_id);

ALTER TABLE public.client_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view client_invites" ON public.client_invites
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members create client_invites" ON public.client_invites
  FOR INSERT WITH CHECK (can_write_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());
CREATE POLICY "Members update client_invites" ON public.client_invites
  FOR UPDATE USING (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Admins delete client_invites" ON public.client_invites
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER trg_client_invites_updated
  BEFORE UPDATE ON public.client_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public lookup function for invite by code or token (used at signup, before auth)
CREATE OR REPLACE FUNCTION public.lookup_client_invite(_code_or_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _inv RECORD; _client RECORD;
BEGIN
  SELECT * INTO _inv FROM public.client_invites
    WHERE (code = _code_or_token OR token = _code_or_token)
    LIMIT 1;
  IF _inv IS NULL THEN RETURN jsonb_build_object('valid', false, 'reason', 'not_found'); END IF;
  IF _inv.status <> 'pending' THEN RETURN jsonb_build_object('valid', false, 'reason', _inv.status); END IF;
  IF _inv.expires_at < now() THEN RETURN jsonb_build_object('valid', false, 'reason', 'expired'); END IF;
  IF _inv.used_count >= _inv.max_uses THEN RETURN jsonb_build_object('valid', false, 'reason', 'exhausted'); END IF;
  SELECT id, name, brand INTO _client FROM public.clients WHERE id = _inv.client_id;
  RETURN jsonb_build_object(
    'valid', true,
    'invite_id', _inv.id,
    'client_id', _inv.client_id,
    'client_name', _client.name,
    'client_brand', _client.brand,
    'email', _inv.email,
    'expires_at', _inv.expires_at
  );
END $$;
GRANT EXECUTE ON FUNCTION public.lookup_client_invite(text) TO anon, authenticated;

-- Redeem function: called once user is authenticated. Creates portal_users (pending), sets client PENDING_APPROVAL, marks invite consumed.
CREATE OR REPLACE FUNCTION public.redeem_client_invite(_code_or_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _inv RECORD; _uid uuid := auth.uid(); _existing uuid; _ws uuid; _pu_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _inv FROM public.client_invites
    WHERE (code = _code_or_token OR token = _code_or_token) FOR UPDATE;
  IF _inv IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF _inv.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'reason', _inv.status); END IF;
  IF _inv.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF;
  IF _inv.used_count >= _inv.max_uses THEN RETURN jsonb_build_object('ok', false, 'reason', 'exhausted'); END IF;

  SELECT workspace_id INTO _ws FROM public.clients WHERE id = _inv.client_id;

  -- check existing mapping
  SELECT id INTO _existing FROM public.portal_users
    WHERE user_id = _uid AND client_id = _inv.client_id;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_linked', true, 'client_id', _inv.client_id);
  END IF;

  INSERT INTO public.portal_users (user_id, client_id, workspace_id, status, invite_id, accepted_at)
  VALUES (_uid, _inv.client_id, _ws, 'pending_approval', _inv.id, now())
  RETURNING id INTO _pu_id;

  -- seed onboarding row
  INSERT INTO public.portal_onboarding (user_id, client_id, workspace_id)
  VALUES (_uid, _inv.client_id, _ws)
  ON CONFLICT (user_id, client_id) DO NOTHING;

  UPDATE public.client_invites
    SET used_count = used_count + 1,
        status = CASE WHEN used_count + 1 >= max_uses THEN 'accepted' ELSE 'pending' END,
        updated_at = now()
    WHERE id = _inv.id;

  -- nudge client to PENDING_APPROVAL if currently NEW
  UPDATE public.clients
    SET status = 'PENDING_APPROVAL'::public.client_status, updated_at = now()
    WHERE id = _inv.client_id AND status::text IN ('NEW');

  RETURN jsonb_build_object('ok', true, 'client_id', _inv.client_id, 'portal_user_id', _pu_id);
END $$;
GRANT EXECUTE ON FUNCTION public.redeem_client_invite(text) TO authenticated;

-- 3. portal_onboarding
CREATE TABLE IF NOT EXISTS public.portal_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id integer NOT NULL,
  workspace_id uuid NOT NULL,
  profile_done boolean NOT NULL DEFAULT false,
  meta_done boolean NOT NULL DEFAULT false,
  billing_done boolean NOT NULL DEFAULT false,
  brand_done boolean NOT NULL DEFAULT false,
  business_name text,
  contact_name text,
  contact_phone text,
  brand_logo_url text,
  brand_primary_color text,
  brand_notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
ALTER TABLE public.portal_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portal user reads own onboarding" ON public.portal_onboarding
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Portal user updates own onboarding" ON public.portal_onboarding
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Portal user inserts own onboarding" ON public.portal_onboarding
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Workspace members view onboarding" ON public.portal_onboarding
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER trg_portal_onboarding_updated
  BEFORE UPDATE ON public.portal_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
