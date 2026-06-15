CREATE TABLE public.user_table_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  table_key text NOT NULL,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  density text NOT NULL DEFAULT 'normal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id, table_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_table_views TO authenticated;
GRANT ALL ON public.user_table_views TO service_role;

ALTER TABLE public.user_table_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own table views"
  ON public.user_table_views
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_table_views_updated_at
  BEFORE UPDATE ON public.user_table_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
