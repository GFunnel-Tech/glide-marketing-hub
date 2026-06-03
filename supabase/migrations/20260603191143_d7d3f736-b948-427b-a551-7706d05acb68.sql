
CREATE TABLE public.user_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_logs_user_created_idx ON public.user_logs(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_logs TO authenticated;
GRANT ALL ON public.user_logs TO service_role;

ALTER TABLE public.user_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own logs" ON public.user_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own logs" ON public.user_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own logs" ON public.user_logs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own logs" ON public.user_logs FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER user_logs_set_updated_at
  BEFORE UPDATE ON public.user_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
