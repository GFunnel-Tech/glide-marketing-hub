
-- 1. Tighten SELECT to owners/admins on sensitive credential/financial tables
DROP POLICY IF EXISTS "Members view ad accounts" ON public.ad_accounts;
CREATE POLICY "Owners/admins view ad accounts" ON public.ad_accounts
  FOR SELECT USING (
    workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role])
  );

DROP POLICY IF EXISTS "Members view meta_connections" ON public.meta_connections;
CREATE POLICY "Owners/admins view meta_connections" ON public.meta_connections
  FOR SELECT USING (
    workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role])
  );

DROP POLICY IF EXISTS "Members view ghl_installs" ON public.ghl_installs;
CREATE POLICY "Owners/admins view ghl_installs" ON public.ghl_installs
  FOR SELECT USING (
    workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role])
  );

DROP POLICY IF EXISTS "Members view integration_configs" ON public.integration_configs;
CREATE POLICY "Owners/admins view integration_configs" ON public.integration_configs
  FOR SELECT USING (
    workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role])
  );

DROP POLICY IF EXISTS "Members view client_wallets" ON public.client_wallets;
CREATE POLICY "Owners/admins view client_wallets" ON public.client_wallets
  FOR SELECT USING (
    workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role])
  );

DROP POLICY IF EXISTS "Members view rebill_invoices" ON public.rebill_invoices;
CREATE POLICY "Owners/admins view rebill_invoices" ON public.rebill_invoices
  FOR SELECT USING (
    workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role])
  );

-- 2. Restrict audit log inserts to workspace members (was: WITH CHECK true)
DROP POLICY IF EXISTS "system can insert audit log" ON public.ai_action_audit_log;
CREATE POLICY "ws members insert audit log" ON public.ai_action_audit_log
  FOR INSERT WITH CHECK (
    is_workspace_member(auth.uid(), workspace_id)
  );

-- 3. Portal access function: require approved/accepted status
CREATE OR REPLACE FUNCTION public.is_portal_user_for_client(_user_id uuid, _client_id integer)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.portal_users
    WHERE user_id = _user_id
      AND client_id = _client_id
      AND (
        status IN ('approved','accepted','active')
        OR accepted_at IS NOT NULL
      )
  )
$function$;

-- 4. Lock down client-reports bucket: private + auth-only storage policies
UPDATE storage.buckets SET public = false WHERE id = 'client-reports';

DROP POLICY IF EXISTS "Members update client-reports" ON storage.objects;
DROP POLICY IF EXISTS "Members write client-reports" ON storage.objects;

CREATE POLICY "client_reports_auth_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'client-reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "client_reports_auth_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'client-reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "client_reports_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'client-reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "client_reports_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'client-reports' AND auth.uid() IS NOT NULL);
