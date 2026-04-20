
-- ============================================================
-- 1. PROFILES + WORKSPACES + MEMBERSHIPS + APP ROLES
-- ============================================================

-- App-level role enum (separate from workspace role)
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Workspace role enum
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'member', 'viewer');

-- Profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- App-level user roles (NEVER store on profiles)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Workspaces (companies)
CREATE TABLE public.workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Workspace memberships
CREATE TABLE public.workspace_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace ON public.workspace_members(workspace_id);

-- Workspace invitations (by email)
CREATE TABLE public.workspace_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Ad accounts (workspace-scoped)
CREATE TABLE public.ad_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta',
  external_account_id TEXT NOT NULL,
  account_name TEXT,
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, external_account_id)
);
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. SECURITY DEFINER HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id AND workspace_id = _workspace_id
  )
$$;

CREATE OR REPLACE FUNCTION public.workspace_role_of(_user_id UUID, _workspace_id UUID)
RETURNS public.workspace_role
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.workspace_members
  WHERE user_id = _user_id AND workspace_id = _workspace_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_write_workspace(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id
      AND workspace_id = _workspace_id
      AND role IN ('owner','admin','member')
  )
$$;

-- ============================================================
-- 3. AUTO-PROVISIONING ON SIGNUP
--   - Create profile
--   - Create personal workspace + owner membership
--   - If first user ever: assign admin role + claim all existing seed data
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _workspace_id UUID;
  _is_first_user BOOLEAN;
  _ws_name TEXT;
BEGIN
  -- Profile
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1))
  )
  ON CONFLICT (id) DO NOTHING;

  -- First user check (before inserting role)
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO _is_first_user;

  -- Default app role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _is_first_user THEN 'admin'::public.app_role ELSE 'user'::public.app_role end)
  ON CONFLICT DO NOTHING;

  -- Create personal workspace
  _ws_name := COALESCE(NEW.raw_user_meta_data->>'workspace_name', split_part(NEW.email,'@',1) || '''s Workspace');
  INSERT INTO public.workspaces (name, created_by)
  VALUES (_ws_name, NEW.id)
  RETURNING id INTO _workspace_id;

  -- Owner membership
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_workspace_id, NEW.id, 'owner');

  -- If first user: assign all existing orphaned seed data to this workspace
  IF _is_first_user THEN
    UPDATE public.clients      SET workspace_id = _workspace_id WHERE workspace_id IS NULL;
    UPDATE public.campaigns    SET workspace_id = _workspace_id WHERE workspace_id IS NULL;
    UPDATE public.reports      SET workspace_id = _workspace_id WHERE workspace_id IS NULL;
    UPDATE public.onboarding   SET workspace_id = _workspace_id WHERE workspace_id IS NULL;
    UPDATE public.leads        SET workspace_id = _workspace_id WHERE workspace_id IS NULL;
    UPDATE public.activity_log SET workspace_id = _workspace_id WHERE workspace_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. ADD workspace_id TO EXISTING TABLES
-- ============================================================

ALTER TABLE public.clients      ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.campaigns    ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.reports      ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.onboarding   ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.leads        ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.activity_log ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX idx_clients_workspace      ON public.clients(workspace_id);
CREATE INDEX idx_campaigns_workspace    ON public.campaigns(workspace_id);
CREATE INDEX idx_reports_workspace      ON public.reports(workspace_id);
CREATE INDEX idx_onboarding_workspace   ON public.onboarding(workspace_id);
CREATE INDEX idx_leads_workspace        ON public.leads(workspace_id);
CREATE INDEX idx_activity_log_workspace ON public.activity_log(workspace_id);

-- ============================================================
-- 5. RLS POLICIES — drop old public policies, install scoped ones
-- ============================================================

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can view profiles of their workspace members" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm1
      JOIN public.workspace_members wm2 ON wm1.workspace_id = wm2.workspace_id
      WHERE wm1.user_id = auth.uid() AND wm2.user_id = profiles.id
    )
  );
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Workspaces
CREATE POLICY "Members can view their workspaces" ON public.workspaces
  FOR SELECT USING (public.is_workspace_member(auth.uid(), id));
CREATE POLICY "Authenticated can create workspaces" ON public.workspaces
  FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners/admins can update workspace" ON public.workspaces
  FOR UPDATE USING (public.workspace_role_of(auth.uid(), id) IN ('owner','admin'));
CREATE POLICY "Owners can delete workspace" ON public.workspaces
  FOR DELETE USING (public.workspace_role_of(auth.uid(), id) = 'owner');

-- workspace_members
CREATE POLICY "Members can view their workspace members" ON public.workspace_members
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners/admins can add members" ON public.workspace_members
  FOR INSERT WITH CHECK (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins can update members" ON public.workspace_members
  FOR UPDATE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins can remove members" ON public.workspace_members
  FOR DELETE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

-- workspace_invitations
CREATE POLICY "Members view invitations" ON public.workspace_invitations
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners/admins manage invitations" ON public.workspace_invitations
  FOR ALL USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'))
  WITH CHECK (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

-- ad_accounts
CREATE POLICY "Members view ad accounts" ON public.ad_accounts
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write ad accounts" ON public.ad_accounts
  FOR INSERT WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update ad accounts" ON public.ad_accounts
  FOR UPDATE USING (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Owners/admins delete ad accounts" ON public.ad_accounts
  FOR DELETE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

-- Drop old public policies on existing tables
DROP POLICY IF EXISTS "Public read clients" ON public.clients;
DROP POLICY IF EXISTS "Public write clients" ON public.clients;
DROP POLICY IF EXISTS "Public read campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Public write campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Public read reports" ON public.reports;
DROP POLICY IF EXISTS "Public write reports" ON public.reports;
DROP POLICY IF EXISTS "Public read onboarding" ON public.onboarding;
DROP POLICY IF EXISTS "Public write onboarding" ON public.onboarding;
DROP POLICY IF EXISTS "Public read leads" ON public.leads;
DROP POLICY IF EXISTS "Public write leads" ON public.leads;
DROP POLICY IF EXISTS "Public read activity_log" ON public.activity_log;
DROP POLICY IF EXISTS "Public write activity_log" ON public.activity_log;
DROP POLICY IF EXISTS "Public read team_members" ON public.team_members;
DROP POLICY IF EXISTS "Public write team_members" ON public.team_members;

-- Workspace-scoped policies for existing tables
CREATE POLICY "Members view clients" ON public.clients FOR SELECT USING (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write clients" ON public.clients FOR INSERT WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update clients" ON public.clients FOR UPDATE USING (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members delete clients" ON public.clients FOR DELETE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE POLICY "Members view campaigns" ON public.campaigns FOR SELECT USING (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write campaigns" ON public.campaigns FOR INSERT WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update campaigns" ON public.campaigns FOR UPDATE USING (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members delete campaigns" ON public.campaigns FOR DELETE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE POLICY "Members view reports" ON public.reports FOR SELECT USING (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write reports" ON public.reports FOR INSERT WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update reports" ON public.reports FOR UPDATE USING (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members delete reports" ON public.reports FOR DELETE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE POLICY "Members view onboarding" ON public.onboarding FOR SELECT USING (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write onboarding" ON public.onboarding FOR INSERT WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update onboarding" ON public.onboarding FOR UPDATE USING (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members delete onboarding" ON public.onboarding FOR DELETE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE POLICY "Members view leads" ON public.leads FOR SELECT USING (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write leads" ON public.leads FOR INSERT WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update leads" ON public.leads FOR UPDATE USING (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members delete leads" ON public.leads FOR DELETE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE POLICY "Members view activity_log" ON public.activity_log FOR SELECT USING (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write activity_log" ON public.activity_log FOR INSERT WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update activity_log" ON public.activity_log FOR UPDATE USING (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members delete activity_log" ON public.activity_log FOR DELETE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

-- team_members: keep admin-only for now (no workspace_id added — global team)
CREATE POLICY "Admins view team_members" ON public.team_members FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage team_members" ON public.team_members FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 6. Triggers for updated_at
-- ============================================================
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ad_accounts_updated_at BEFORE UPDATE ON public.ad_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
