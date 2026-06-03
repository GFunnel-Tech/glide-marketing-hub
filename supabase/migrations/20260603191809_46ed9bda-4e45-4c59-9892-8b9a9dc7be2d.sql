
-- Profiles: department
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department TEXT;

-- user_logs: targeting columns
ALTER TABLE public.user_logs
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS audience_kind TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- For audience_kind: 'general' | 'department' | 'user'
ALTER TABLE public.user_logs DROP CONSTRAINT IF EXISTS user_logs_audience_kind_check;
ALTER TABLE public.user_logs
  ADD CONSTRAINT user_logs_audience_kind_check
  CHECK (audience_kind IN ('general','department','user'));

-- Drop old per-row is_read (read state is now per-recipient)
ALTER TABLE public.user_logs DROP COLUMN IF EXISTS is_read;

CREATE INDEX IF NOT EXISTS user_logs_workspace_idx ON public.user_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_logs_recipient_idx ON public.user_logs(recipient_user_id);
CREATE INDEX IF NOT EXISTS user_logs_department_idx ON public.user_logs(department);

-- Per-recipient read tracking
CREATE TABLE IF NOT EXISTS public.user_log_reads (
  log_id UUID NOT NULL REFERENCES public.user_logs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (log_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.user_log_reads TO authenticated;
GRANT ALL ON public.user_log_reads TO service_role;

ALTER TABLE public.user_log_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own log reads" ON public.user_log_reads;
DROP POLICY IF EXISTS "Users insert own log reads" ON public.user_log_reads;
DROP POLICY IF EXISTS "Users delete own log reads" ON public.user_log_reads;
CREATE POLICY "Users view own log reads" ON public.user_log_reads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own log reads" ON public.user_log_reads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own log reads" ON public.user_log_reads FOR DELETE USING (auth.uid() = user_id);

-- Rewrite SELECT policy on user_logs for audience-based visibility
DROP POLICY IF EXISTS "Users view own logs" ON public.user_logs;
CREATE POLICY "Users view targeted logs" ON public.user_logs FOR SELECT USING (
  auth.uid() = user_id
  OR (audience_kind = 'user' AND recipient_user_id = auth.uid())
  OR (
    audience_kind = 'department'
    AND department IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.department = user_logs.department
    )
    AND (workspace_id IS NULL OR public.is_workspace_member(auth.uid(), workspace_id))
  )
  OR (
    audience_kind = 'general'
    AND workspace_id IS NOT NULL
    AND public.is_workspace_member(auth.uid(), workspace_id)
  )
);
