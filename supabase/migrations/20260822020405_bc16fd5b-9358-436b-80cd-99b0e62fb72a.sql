CREATE POLICY "Portal users view their ghl notes" ON public.ghl_contact_notes FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND public.is_portal_user_for_client(auth.uid(), client_id));
CREATE POLICY "Portal users view their ghl tasks" ON public.ghl_contact_tasks FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND public.is_portal_user_for_client(auth.uid(), client_id));
CREATE POLICY "Portal users view their ghl pipelines" ON public.ghl_pipelines FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND public.is_portal_user_for_client(auth.uid(), client_id));
CREATE POLICY "Portal users view their ghl stages" ON public.ghl_pipeline_stages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ghl_pipelines p WHERE p.id = ghl_pipeline_stages.pipeline_id AND p.client_id IS NOT NULL AND public.is_portal_user_for_client(auth.uid(), p.client_id)));