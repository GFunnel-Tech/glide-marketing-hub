CREATE OR REPLACE FUNCTION public.purge_inactive_client_signals(_client_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _name text; _brand text;
BEGIN
  SELECT name, brand INTO _name, _brand FROM public.clients WHERE id = _client_id;

  DELETE FROM public.client_churn_risk WHERE client_id = _client_id;

  DELETE FROM public.ai_insights
    WHERE client_id = _client_id AND status = 'open';

  DELETE FROM public.ai_pending_actions
    WHERE client_id = _client_id AND status = 'pending';

  DELETE FROM public.client_notes
    WHERE client_id = _client_id
      AND done = false
      AND (
        title LIKE '[KPI:%'
        OR title ILIKE 'Save % review churn risk'
        OR title ILIKE 'Reach out to % no activity%'
        OR title ILIKE 'Resolve: %'
      );

  IF _name IS NOT NULL THEN
    DELETE FROM public.daily_focus_items
      WHERE is_done = false
        AND (title ILIKE 'Churn risk: ' || _name
             OR (_brand IS NOT NULL AND title ILIKE 'Churn risk: ' || _brand));
  END IF;

  DELETE FROM public.notifications
    WHERE read_at IS NULL
      AND type <> 'payment_failed'
      AND (meta->>'client_id')::text = _client_id::text;
END $$;

CREATE OR REPLACE FUNCTION public.on_client_status_inactive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status::text IN ('CANCELLED','PENDING_CANCELLATION','BLOCKED','PAUSED')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.purge_inactive_client_signals(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_client_status_inactive ON public.clients;
CREATE TRIGGER trg_client_status_inactive
AFTER UPDATE OF status ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.on_client_status_inactive();

DO $$
DECLARE _id integer;
BEGIN
  FOR _id IN
    SELECT id FROM public.clients
    WHERE status::text IN ('CANCELLED','PENDING_CANCELLATION','BLOCKED','PAUSED')
  LOOP
    PERFORM public.purge_inactive_client_signals(_id);
  END LOOP;
END $$;