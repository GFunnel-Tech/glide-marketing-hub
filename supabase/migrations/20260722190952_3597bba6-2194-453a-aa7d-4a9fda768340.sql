
-- Public share-token access for client_reports
CREATE OR REPLACE FUNCTION public.get_report_by_token(_token text)
RETURNS SETOF public.client_reports
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.client_reports WHERE share_token = _token AND status = 'ready' LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_report_by_token(text) TO anon, authenticated;

-- Portal users can list their own client's reports (ready only)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_reports' AND policyname='Portal users read own client reports') THEN
    CREATE POLICY "Portal users read own client reports" ON public.client_reports
      FOR SELECT TO authenticated
      USING (public.is_portal_user_for_client(auth.uid(), client_id) AND status = 'ready');
  END IF;
END $$;

-- Portal users can view/manage schedules for their client
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_report_schedules' AND policyname='Portal users read own client schedules') THEN
    CREATE POLICY "Portal users read own client schedules" ON public.client_report_schedules
      FOR SELECT TO authenticated
      USING (public.is_portal_user_for_client(auth.uid(), client_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_report_schedules' AND policyname='Portal users manage own client schedules') THEN
    CREATE POLICY "Portal users manage own client schedules" ON public.client_report_schedules
      FOR ALL TO authenticated
      USING (public.is_portal_user_for_client(auth.uid(), client_id))
      WITH CHECK (public.is_portal_user_for_client(auth.uid(), client_id));
  END IF;
END $$;
