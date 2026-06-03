
CREATE TABLE public.daily_focus_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  is_done BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX daily_focus_items_user_idx ON public.daily_focus_items(user_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_focus_items TO authenticated;
GRANT ALL ON public.daily_focus_items TO service_role;

ALTER TABLE public.daily_focus_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own focus items"
  ON public.daily_focus_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own focus items"
  ON public.daily_focus_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own focus items"
  ON public.daily_focus_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own focus items"
  ON public.daily_focus_items FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER daily_focus_items_set_updated_at
  BEFORE UPDATE ON public.daily_focus_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
