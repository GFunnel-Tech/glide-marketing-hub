
ALTER TABLE public.user_logs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS status_note text,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.user_logs
    ADD CONSTRAINT user_logs_status_check
    CHECK (status IN ('new','in_process','needs_feedback','completed','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS user_logs_status_idx ON public.user_logs(status);

-- Allow targeted viewers (recipients, dept members, workspace members on general logs) to update status
DROP POLICY IF EXISTS "Viewers update log status" ON public.user_logs;
CREATE POLICY "Viewers update log status" ON public.user_logs
  FOR UPDATE
  USING (
    (auth.uid() = user_id)
    OR ((audience_kind = 'user') AND (recipient_user_id = auth.uid()))
    OR ((audience_kind = 'department') AND (department IS NOT NULL) AND EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.department = user_logs.department
      ) AND ((workspace_id IS NULL) OR public.is_workspace_member(auth.uid(), workspace_id)))
    OR ((audience_kind = 'general') AND (workspace_id IS NOT NULL) AND public.is_workspace_member(auth.uid(), workspace_id))
  )
  WITH CHECK (
    (auth.uid() = user_id)
    OR ((audience_kind = 'user') AND (recipient_user_id = auth.uid()))
    OR ((audience_kind = 'department') AND (department IS NOT NULL) AND EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.department = user_logs.department
      ) AND ((workspace_id IS NULL) OR public.is_workspace_member(auth.uid(), workspace_id)))
    OR ((audience_kind = 'general') AND (workspace_id IS NOT NULL) AND public.is_workspace_member(auth.uid(), workspace_id))
  );
