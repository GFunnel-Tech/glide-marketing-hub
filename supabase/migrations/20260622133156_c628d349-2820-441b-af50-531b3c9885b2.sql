-- 1) payment_events: remove 'member' from UPDATE policy so only owners/admins can update.
DROP POLICY IF EXISTS "Workspace admins can update payment events" ON public.payment_events;
CREATE POLICY "Workspace admins can update payment events"
ON public.payment_events
FOR UPDATE
USING (
  public.is_super_admin(auth.uid())
  OR public.workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role])
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role])
);

-- 2) team_members: tighten policies to super_admin only (the table has no workspace scoping,
--    and the global 'admin' app_role is too broad). service_role retains full access.
DROP POLICY IF EXISTS "Admins manage team_members" ON public.team_members;
DROP POLICY IF EXISTS "Admins view team_members" ON public.team_members;

CREATE POLICY "Super admins manage team_members"
ON public.team_members
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- 3) workspace_stripe_accounts: make service-role-only access explicit and document intent.
--    All app reads must go through the get_workspace_stripe_status() SECURITY DEFINER RPC,
--    which returns only non-sensitive connection-status fields (never api_key).
REVOKE ALL ON public.workspace_stripe_accounts FROM anon, authenticated;
GRANT ALL ON public.workspace_stripe_accounts TO service_role;
ALTER TABLE public.workspace_stripe_accounts ENABLE ROW LEVEL SECURITY;

-- Explicit deny-by-default policy for anon/authenticated to prevent any future
-- accidentally-broad policy additions from exposing api_key or other secrets.
DROP POLICY IF EXISTS "Block direct client access to workspace_stripe_accounts" ON public.workspace_stripe_accounts;
CREATE POLICY "Block direct client access to workspace_stripe_accounts"
ON public.workspace_stripe_accounts
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

COMMENT ON TABLE public.workspace_stripe_accounts IS
  'Service-role only. Client code must read via get_workspace_stripe_status() RPC, which excludes api_key and other sensitive fields.';