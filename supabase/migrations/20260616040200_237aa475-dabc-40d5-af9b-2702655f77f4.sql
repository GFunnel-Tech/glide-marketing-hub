
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS ai_context text;

ALTER TABLE public.custom_kpis
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'formula',
  ADD COLUMN IF NOT EXISTS manual_value numeric,
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS external_headers jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_external_value numeric,
  ADD COLUMN IF NOT EXISTS last_external_fetched_at timestamptz;

ALTER TABLE public.custom_kpis DROP CONSTRAINT IF EXISTS custom_kpis_kind_check;
ALTER TABLE public.custom_kpis ADD CONSTRAINT custom_kpis_kind_check
  CHECK (kind IN ('formula','manual','external'));

CREATE TABLE IF NOT EXISTS public.client_ai_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id integer NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  parsed_spec jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_parsed_at timestamptz,
  parse_error text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_ai_rules TO authenticated;
GRANT ALL ON public.client_ai_rules TO service_role;

ALTER TABLE public.client_ai_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can read AI rules"
  ON public.client_ai_rules FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can write AI rules"
  ON public.client_ai_rules FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can update AI rules"
  ON public.client_ai_rules FOR UPDATE TO authenticated
  USING (public.can_write_workspace(auth.uid(), workspace_id))
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can delete AI rules"
  ON public.client_ai_rules FOR DELETE TO authenticated
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE TRIGGER trg_client_ai_rules_updated_at
  BEFORE UPDATE ON public.client_ai_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS client_ai_rules_client_idx ON public.client_ai_rules(client_id);
CREATE INDEX IF NOT EXISTS client_ai_rules_workspace_idx ON public.client_ai_rules(workspace_id);
