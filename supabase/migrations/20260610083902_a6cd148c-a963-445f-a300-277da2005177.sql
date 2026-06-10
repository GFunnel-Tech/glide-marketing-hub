
-- Storage: ad-creatives, scope mutations to workspace by path prefix {workspace_id}/...
DROP POLICY IF EXISTS ad_creatives_auth_update ON storage.objects;
DROP POLICY IF EXISTS ad_creatives_auth_delete ON storage.objects;
DROP POLICY IF EXISTS ad_creatives_auth_upload ON storage.objects;

CREATE POLICY ad_creatives_ws_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ad-creatives'
    AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY ad_creatives_ws_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ad-creatives'
    AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'ad-creatives'
    AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY ad_creatives_ws_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ad-creatives'
    AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

-- Storage: client-reports private bucket, scope all ops to workspace by path prefix
DROP POLICY IF EXISTS client_reports_auth_read ON storage.objects;
DROP POLICY IF EXISTS client_reports_auth_write ON storage.objects;
DROP POLICY IF EXISTS client_reports_auth_update ON storage.objects;
DROP POLICY IF EXISTS client_reports_auth_delete ON storage.objects;

CREATE POLICY client_reports_ws_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-reports'
    AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY client_reports_ws_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-reports'
    AND public.workspace_role_of(auth.uid(), ((storage.foldername(name))[1])::uuid) = ANY (ARRAY['owner','admin','member']::workspace_role[])
  );

CREATE POLICY client_reports_ws_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'client-reports'
    AND public.workspace_role_of(auth.uid(), ((storage.foldername(name))[1])::uuid) = ANY (ARRAY['owner','admin']::workspace_role[])
  )
  WITH CHECK (
    bucket_id = 'client-reports'
    AND public.workspace_role_of(auth.uid(), ((storage.foldername(name))[1])::uuid) = ANY (ARRAY['owner','admin']::workspace_role[])
  );

CREATE POLICY client_reports_ws_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-reports'
    AND public.workspace_role_of(auth.uid(), ((storage.foldername(name))[1])::uuid) = ANY (ARRAY['owner','admin']::workspace_role[])
  );

-- Restrict sensitive table reads to owners/admins
DROP POLICY IF EXISTS "workspace members read status csa" ON public.client_stripe_accounts;
CREATE POLICY "admins read client_stripe_accounts" ON public.client_stripe_accounts
  FOR SELECT TO authenticated
  USING (public.workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner','admin']::workspace_role[]));

DROP POLICY IF EXISTS "workspace members read charges" ON public.stripe_charges;
CREATE POLICY "admins read stripe_charges" ON public.stripe_charges
  FOR SELECT TO authenticated
  USING (public.workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner','admin']::workspace_role[]));

DROP POLICY IF EXISTS "Members view wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "Admins view wallet_transactions" ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (public.workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner','admin']::workspace_role[]));
