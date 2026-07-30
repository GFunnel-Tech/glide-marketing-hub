CREATE OR REPLACE FUNCTION public.notify_on_meta_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _client_name text;
  _client_status text;
  _link text;
BEGIN
  SELECT name, status::text INTO _client_name, _client_status
    FROM public.clients WHERE id = NEW.client_id;

  -- Never notify on off/terminal accounts
  IF _client_status IN ('CANCELLED','PENDING_CANCELLATION','BLOCKED','PAUSED') THEN
    RETURN NEW;
  END IF;

  IF NEW.client_id IS NOT NULL THEN
    _link := '/client/' || NEW.client_id;
  ELSE
    _link := '/leads';
  END IF;

  INSERT INTO public.notifications (user_id, workspace_id, type, title, body, link, meta)
  SELECT
    wm.user_id,
    NEW.workspace_id,
    'lead_received',
    'New lead' || COALESCE(' from ' || _client_name, ''),
    COALESCE(NEW.full_name, NEW.email, NEW.phone, 'New Meta lead'),
    _link,
    jsonb_build_object('lead_id', NEW.lead_id, 'client_id', NEW.client_id)
  FROM public.workspace_members wm
  WHERE wm.workspace_id = NEW.workspace_id
    AND public.notif_pref_enabled(wm.user_id, NEW.workspace_id, 'lead_received');

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fire_due_client_notes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row RECORD;
  _client_name text;
  _client_status text;
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
    _client_status := NULL;
    IF _row.client_id IS NOT NULL THEN
      SELECT name, status::text INTO _client_name, _client_status
        FROM public.clients WHERE id = _row.client_id;
      _link := '/client/' || _row.client_id;
    ELSE
      _link := '/tasks';
    END IF;

    -- Skip reminders tied to off/terminal accounts
    IF _client_status IN ('CANCELLED','PENDING_CANCELLATION','BLOCKED','PAUSED') THEN
      UPDATE public.client_notes SET reminded_at = now() WHERE id = _row.id;
      CONTINUE;
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