-- Base the GHL reconcile clock on the lead's actual submit time (created_time)
-- rather than DB-insert time. Leads arrive by polling, so "5 minutes after the
-- lead came in" should count from when the prospect submitted the form. A lead
-- ingested already older than the window gets next_check_at in the past and is
-- picked up on the next reconcile pass. Falls back to now() when created_time
-- is missing. Delay stays 5 minutes (no change to cadence or retry).
CREATE OR REPLACE FUNCTION public.set_meta_lead_initial_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.next_check_at IS NULL THEN
    NEW.next_check_at := COALESCE(NEW.created_time, now()) + interval '5 minutes';
  END IF;
  IF NEW.sync_status IS NULL THEN
    NEW.sync_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;
