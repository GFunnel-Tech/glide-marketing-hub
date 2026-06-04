
ALTER TABLE public.client_notes
  ADD COLUMN assigned_to uuid;

CREATE INDEX client_notes_assigned_idx ON public.client_notes(assigned_to) WHERE assigned_to IS NOT NULL;

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
BEGIN
  FOR _row IN
    SELECT * FROM public.client_notes
    WHERE done = false
      AND reminded_at IS NULL
      AND due_at IS NOT NULL
      AND due_at <= now()
    LIMIT 200
  LOOP
    _client_name := NULL;
    IF _row.client_id IS NOT NULL THEN
      SELECT name INTO _client_name FROM public.clients WHERE id = _row.client_id;
      _link := '/client/' || _row.client_id;
    ELSE
      _link := '/';
    END IF;

    -- Notify creator + assignee (deduped)
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
        CASE WHEN _client_name IS NOT NULL THEN 'Reminder · ' || _client_name ELSE 'Reminder' END,
        LEFT(_row.content, 200),
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

REVOKE EXECUTE ON FUNCTION public.fire_due_client_notes() FROM PUBLIC, anon, authenticated;
