
-- Helper: is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

-- Extend workspace helpers to treat super admins as members/writers/owners everywhere
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id AND workspace_id = _workspace_id
  )
$$;

CREATE OR REPLACE FUNCTION public.can_write_workspace(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id
      AND workspace_id = _workspace_id
      AND role IN ('owner','admin','member')
  )
$$;

CREATE OR REPLACE FUNCTION public.workspace_role_of(_user_id uuid, _workspace_id uuid)
RETURNS workspace_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_super_admin(_user_id) THEN 'owner'::workspace_role
    ELSE (SELECT role FROM public.workspace_members
          WHERE user_id = _user_id AND workspace_id = _workspace_id LIMIT 1)
  END
$$;

-- Allow super admins to view all profiles (for user management UI)
CREATE POLICY "Super admins view all profiles"
ON public.profiles FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- Allow super admins to view & manage all workspaces, members, roles
CREATE POLICY "Super admins manage all workspaces"
ON public.workspaces FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins manage all workspace_members"
ON public.workspace_members FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Audit log for impersonation
CREATE TABLE public.impersonation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL,
  target_user_id uuid,
  target_workspace_id uuid,
  action text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.impersonation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins view impersonation_log"
ON public.impersonation_log FOR SELECT
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins write impersonation_log"
ON public.impersonation_log FOR INSERT
WITH CHECK (public.is_super_admin(auth.uid()) AND super_admin_id = auth.uid());
