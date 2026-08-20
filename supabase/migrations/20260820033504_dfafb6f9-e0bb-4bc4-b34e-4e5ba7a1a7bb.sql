DROP POLICY IF EXISTS "Onboarding read: client portal user or workspace member" ON storage.objects;
CREATE POLICY "Onboarding read: client portal user or workspace member"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-onboarding'
    AND (
      is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.portal_users pu
        WHERE pu.user_id = auth.uid()
          AND pu.client_id::text = split_part(objects.name, '/', 1)
      )
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id::text = split_part(objects.name, '/', 1)
          AND c.workspace_id IS NOT NULL
          AND is_workspace_member(auth.uid(), c.workspace_id)
      )
    )
  );

DROP POLICY IF EXISTS "Onboarding write: client portal user or workspace member" ON storage.objects;
CREATE POLICY "Onboarding write: client portal user or workspace member"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-onboarding'
    AND (
      is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.portal_users pu
        WHERE pu.user_id = auth.uid()
          AND pu.client_id::text = split_part(objects.name, '/', 1)
      )
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id::text = split_part(objects.name, '/', 1)
          AND c.workspace_id IS NOT NULL
          AND can_write_workspace(auth.uid(), c.workspace_id)
      )
    )
  );

DROP POLICY IF EXISTS "Onboarding update: workspace writer" ON storage.objects;
CREATE POLICY "Onboarding update: workspace writer"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'client-onboarding'
    AND (
      is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id::text = split_part(objects.name, '/', 1)
          AND c.workspace_id IS NOT NULL
          AND can_write_workspace(auth.uid(), c.workspace_id)
      )
    )
  );

DROP POLICY IF EXISTS "Onboarding delete: workspace admin" ON storage.objects;
CREATE POLICY "Onboarding delete: workspace admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-onboarding'
    AND (
      is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id::text = split_part(objects.name, '/', 1)
          AND c.workspace_id IS NOT NULL
          AND workspace_role_of(auth.uid(), c.workspace_id) IN ('owner','admin')
      )
    )
  );