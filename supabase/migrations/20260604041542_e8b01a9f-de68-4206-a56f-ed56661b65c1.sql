
-- Notes & tasks attached to clients (or workspace-level)
CREATE TABLE public.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id integer REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  due_at timestamptz,
  reminded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_notes TO authenticated;
GRANT ALL ON public.client_notes TO service_role;

ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view workspace notes"
  ON public.client_notes FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can insert workspace notes"
  ON public.client_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) AND user_id = auth.uid());

CREATE POLICY "Members can update workspace notes"
  ON public.client_notes FOR UPDATE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can delete their notes or admins any"
  ON public.client_notes FOR DELETE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) AND (user_id = auth.uid() OR public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin')));

CREATE INDEX client_notes_ws_due_idx ON public.client_notes(workspace_id, due_at) WHERE done = false AND reminded_at IS NULL AND due_at IS NOT NULL;
CREATE INDEX client_notes_client_idx ON public.client_notes(client_id) WHERE client_id IS NOT NULL;

CREATE TRIGGER trg_client_notes_updated_at
  BEFORE UPDATE ON public.client_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Fire in-app notifications for due notes
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

    INSERT INTO public.notifications (user_id, workspace_id, type, title, body, link, meta)
    VALUES (
      _row.user_id,
      _row.workspace_id,
      'info',
      CASE WHEN _client_name IS NOT NULL THEN 'Reminder · ' || _client_name ELSE 'Reminder' END,
      LEFT(_row.content, 200),
      _link,
      jsonb_build_object('note_id', _row.id, 'client_id', _row.client_id)
    );

    UPDATE public.client_notes SET reminded_at = now() WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'fire-due-client-notes',
  '* * * * *',
  $$SELECT public.fire_due_client_notes();$$
);
