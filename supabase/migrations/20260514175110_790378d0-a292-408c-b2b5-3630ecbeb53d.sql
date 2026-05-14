-- 1. Extend meta_leads for the 5-minute reconcile loop
ALTER TABLE public.meta_leads
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS sync_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_error text,
  ADD COLUMN IF NOT EXISTS ghl_contact_id text,
  ADD COLUMN IF NOT EXISTS recovered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_meta_leads_next_check
  ON public.meta_leads (next_check_at)
  WHERE sync_status IN ('pending','missing');

CREATE INDEX IF NOT EXISTS idx_meta_leads_sync_status
  ON public.meta_leads (workspace_id, sync_status);

-- 2. Allow members of the workspace (incl. service role) to UPDATE meta_leads
--    so the retry button and the recovery worker can flip statuses.
DROP POLICY IF EXISTS "Members update meta_leads" ON public.meta_leads;
CREATE POLICY "Members update meta_leads"
  ON public.meta_leads
  FOR UPDATE
  USING (public.can_write_workspace(auth.uid(), workspace_id));

-- 3. Trigger: set next_check_at on insert
CREATE OR REPLACE FUNCTION public.set_meta_lead_initial_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.next_check_at IS NULL THEN
    NEW.next_check_at := now() + interval '5 minutes';
  END IF;
  IF NEW.sync_status IS NULL THEN
    NEW.sync_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_meta_lead_initial_check ON public.meta_leads;
CREATE TRIGGER trg_set_meta_lead_initial_check
  BEFORE INSERT ON public.meta_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_meta_lead_initial_check();

-- 4. Update notification-preference seeder to include the new event types
CREATE OR REPLACE FUNCTION public.seed_notification_preferences_for_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id, workspace_id, event_type, in_app_enabled, realtime_enabled)
  SELECT NEW.user_id, NEW.workspace_id, evt.event_type, true, true
  FROM (VALUES
    ('lead_received'),
    ('new_message'),
    ('info'),
    ('lead_sync_missing'),
    ('lead_sync_recovered'),
    ('lead_sync_failed')
  ) AS evt(event_type)
  ON CONFLICT (user_id, workspace_id, event_type) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 5. Backfill preferences for existing workspace memberships
INSERT INTO public.notification_preferences (user_id, workspace_id, event_type, in_app_enabled, realtime_enabled)
SELECT wm.user_id, wm.workspace_id, evt.event_type, true, true
FROM public.workspace_members wm
CROSS JOIN (VALUES
  ('lead_sync_missing'),
  ('lead_sync_recovered'),
  ('lead_sync_failed')
) AS evt(event_type)
ON CONFLICT (user_id, workspace_id, event_type) DO NOTHING;

-- 6. Backfill: existing pending leads get a next_check_at
UPDATE public.meta_leads
   SET next_check_at = COALESCE(next_check_at, created_at + interval '5 minutes')
 WHERE sync_status = 'pending' AND next_check_at IS NULL;