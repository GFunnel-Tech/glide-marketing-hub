-- Extend client_notes for tasks/notes with scheduling + recurrence
ALTER TABLE public.client_notes
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'note',
  ADD COLUMN IF NOT EXISTS recurrence JSONB,
  ADD COLUMN IF NOT EXISTS next_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS client_notes_due_idx
  ON public.client_notes (workspace_id, COALESCE(next_due_at, due_at))
  WHERE done = false;

-- Trigger to advance recurring tasks when marked done
CREATE OR REPLACE FUNCTION public.advance_recurring_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _freq text;
  _interval int;
  _base timestamptz;
  _next timestamptz;
  _end timestamptz;
BEGIN
  IF NEW.recurrence IS NULL OR jsonb_typeof(NEW.recurrence) <> 'object' THEN
    -- Not recurring: stamp completed_at
    IF NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
    RETURN NEW;
  END IF;

  _freq := COALESCE(NEW.recurrence->>'freq', 'daily');
  _interval := GREATEST(COALESCE((NEW.recurrence->>'interval')::int, 1), 1);
  _base := COALESCE(NEW.next_due_at, NEW.due_at, now());
  _end := NULLIF(NEW.recurrence->>'end_at','')::timestamptz;

  _next := CASE _freq
    WHEN 'daily'   THEN _base + (_interval || ' days')::interval
    WHEN 'weekly'  THEN _base + (_interval || ' weeks')::interval
    WHEN 'monthly' THEN _base + (_interval || ' months')::interval
    ELSE _base + (_interval || ' days')::interval
  END;

  IF _end IS NOT NULL AND _next > _end THEN
    NEW.completed_at := now();
    RETURN NEW;
  END IF;

  -- Reset for next occurrence
  NEW.done := false;
  NEW.next_due_at := _next;
  NEW.due_at := _next;
  NEW.reminded_at := NULL;
  NEW.completed_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_recurring_task ON public.client_notes;
CREATE TRIGGER trg_advance_recurring_task
  BEFORE UPDATE ON public.client_notes
  FOR EACH ROW
  WHEN (NEW.done = true AND OLD.done = false)
  EXECUTE FUNCTION public.advance_recurring_task();

-- Update reminder firing function to also consider next_due_at
CREATE OR REPLACE FUNCTION public.fire_due_client_notes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row RECORD;
  _client_name text;
  _link text;
  _count int := 0;
  _recipients uuid[];
  _uid uuid;
  _due timestamptz;
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
    IF _row.assigned_to IS NOT NULL AND _row.assigned_to <> _row.user_id THEN
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
        jsonb_build_object('note_id', _row.id, 'client_id', _row.client_id, 'assigned', _row.assigned_to IS NOT NULL)
      );
    END LOOP;

    UPDATE public.client_notes SET reminded_at = now() WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;

-- Enable realtime
ALTER TABLE public.client_notes REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'client_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_notes;
  END IF;
END $$;