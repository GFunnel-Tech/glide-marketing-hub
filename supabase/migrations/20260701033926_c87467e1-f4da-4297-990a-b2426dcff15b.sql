
ALTER TABLE public.client_notes
  ADD COLUMN IF NOT EXISTS assigned_to_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Backfill from existing single assignee
UPDATE public.client_notes
  SET assigned_to_ids = ARRAY[assigned_to]
  WHERE assigned_to IS NOT NULL
    AND (assigned_to_ids IS NULL OR array_length(assigned_to_ids, 1) IS NULL);

CREATE INDEX IF NOT EXISTS idx_client_notes_assigned_to_ids
  ON public.client_notes USING GIN (assigned_to_ids);

-- Keep assigned_to in sync with first element of assigned_to_ids
CREATE OR REPLACE FUNCTION public.sync_client_notes_assignees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to_ids IS NULL THEN
    NEW.assigned_to_ids := '{}'::uuid[];
  END IF;

  -- If array changed, mirror first entry into assigned_to
  IF TG_OP = 'INSERT'
     OR NEW.assigned_to_ids IS DISTINCT FROM COALESCE(OLD.assigned_to_ids, '{}'::uuid[]) THEN
    NEW.assigned_to := CASE
      WHEN array_length(NEW.assigned_to_ids, 1) > 0 THEN NEW.assigned_to_ids[1]
      ELSE NULL
    END;
  ELSIF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    -- Legacy single-assignee update path: reflect into array
    IF NEW.assigned_to IS NULL THEN
      NEW.assigned_to_ids := '{}'::uuid[];
    ELSE
      NEW.assigned_to_ids := ARRAY[NEW.assigned_to];
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_client_notes_assignees ON public.client_notes;
CREATE TRIGGER trg_sync_client_notes_assignees
BEFORE INSERT OR UPDATE ON public.client_notes
FOR EACH ROW EXECUTE FUNCTION public.sync_client_notes_assignees();

-- Update reminder fan-out to notify every assignee
CREATE OR REPLACE FUNCTION public.fire_due_client_notes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row RECORD;
  _client_name text;
  _link text;
  _count int := 0;
  _recipients uuid[];
  _uid uuid;
  _aid uuid;
BEGIN
  FOR _row IN
    SELECT *, COALESCE(next_due_at, due_at) AS _due_at
    FROM public.client_notes
    WHERE done = false
      AND reminded_at IS NULL
      AND COALESCE(next_due_at, due_at) IS NOT NULL
      AND COALESCE(next_due_at, due_at) <= now()
    LIMIT 200
  LOOP
    _client_name := NULL;
    IF _row.client_id IS NOT NULL THEN
      SELECT name INTO _client_name FROM public.clients WHERE id = _row.client_id;
      _link := '/client/' || _row.client_id;
    ELSE
      _link := '/tasks';
    END IF;

    _recipients := ARRAY[_row.user_id];
    IF _row.assigned_to_ids IS NOT NULL THEN
      FOREACH _aid IN ARRAY _row.assigned_to_ids LOOP
        IF _aid IS NOT NULL AND _aid <> ALL(_recipients) THEN
          _recipients := _recipients || _aid;
        END IF;
      END LOOP;
    END IF;
    IF _row.assigned_to IS NOT NULL AND _row.assigned_to <> ALL(_recipients) THEN
      _recipients := _recipients || _row.assigned_to;
    END IF;

    FOREACH _uid IN ARRAY _recipients LOOP
      INSERT INTO public.notifications (user_id, workspace_id, type, title, body, link, meta)
      VALUES (
        _uid,
        _row.workspace_id,
        'info',
        CASE
          WHEN _row.title IS NOT NULL AND _client_name IS NOT NULL THEN _row.title || ' · ' || _client_name
          WHEN _row.title IS NOT NULL THEN _row.title
          WHEN _client_name IS NOT NULL THEN 'Reminder · ' || _client_name
          ELSE 'Reminder'
        END,
        LEFT(COALESCE(_row.content, ''), 200),
        _link,
        jsonb_build_object('note_id', _row.id, 'client_id', _row.client_id, 'assigned', array_length(_row.assigned_to_ids,1) > 0)
      );
    END LOOP;

    UPDATE public.client_notes SET reminded_at = now() WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$function$;
