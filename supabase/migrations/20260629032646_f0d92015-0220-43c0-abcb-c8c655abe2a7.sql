
CREATE TABLE public.task_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category text NOT NULL,
  assigned_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, category)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_routing_rules TO authenticated;
GRANT ALL ON public.task_routing_rules TO service_role;

ALTER TABLE public.task_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view routing rules"
  ON public.task_routing_rules FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Owners/admins manage routing rules"
  ON public.task_routing_rules FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin')
  );

CREATE TRIGGER trg_task_routing_rules_updated_at
  BEFORE UPDATE ON public.task_routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
