-- Morning Brief: a once-per-day, per-user AI overview of what happened across the
-- portfolio plus the concerns worth acting on. The user can dismiss it or apply it
-- (which turns the suggested_tasks into real tasks in client_notes).

CREATE TABLE public.morning_briefs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brief_date date NOT NULL DEFAULT current_date,
  headline text,
  summary text NOT NULL DEFAULT '',                -- markdown narrative of what happened
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ label, detail, severity }]
  suggested_tasks jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ title, priority, client_id, reason }]
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,      -- raw snapshot the brief was built from
  model text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','applied','dismissed')),
  applied_task_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  dismissed_at timestamptz,
  UNIQUE (workspace_id, user_id, brief_date)
);

CREATE INDEX morning_briefs_user_idx
  ON public.morning_briefs (user_id, workspace_id, brief_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.morning_briefs TO authenticated;
GRANT ALL ON public.morning_briefs TO service_role;

ALTER TABLE public.morning_briefs ENABLE ROW LEVEL SECURITY;

-- Briefs are personal: each user only ever sees and mutates their own, and only
-- within a workspace they belong to. The edge function generates them with the
-- service role, which bypasses RLS.
CREATE POLICY "Users read own briefs"
  ON public.morning_briefs FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Users insert own briefs"
  ON public.morning_briefs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Users update own briefs"
  ON public.morning_briefs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own briefs"
  ON public.morning_briefs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
