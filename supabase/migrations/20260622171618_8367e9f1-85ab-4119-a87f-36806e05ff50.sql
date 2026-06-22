
-- 1) Add visibility flag to client_notes
ALTER TABLE public.client_notes
  ADD COLUMN IF NOT EXISTS visible_to_client boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_client_notes_visible_client
  ON public.client_notes (client_id) WHERE visible_to_client = true;

DROP POLICY IF EXISTS "Portal user reads visible client_notes" ON public.client_notes;
CREATE POLICY "Portal user reads visible client_notes"
  ON public.client_notes FOR SELECT
  USING (
    client_id IS NOT NULL
    AND visible_to_client = true
    AND public.is_portal_user_for_client(auth.uid(), client_id)
  );

-- 2) Creative approvals table
CREATE TABLE IF NOT EXISTS public.creative_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id integer NOT NULL,
  ad_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','changes_requested')),
  decided_by uuid,
  decided_at timestamptz,
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, ad_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_approvals TO authenticated;
GRANT ALL ON public.creative_approvals TO service_role;

ALTER TABLE public.creative_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view creative_approvals"
  ON public.creative_approvals FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members write creative_approvals"
  ON public.creative_approvals FOR UPDATE
  USING (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Members insert creative_approvals"
  ON public.creative_approvals FOR INSERT
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Portal user reads own creative_approvals"
  ON public.creative_approvals FOR SELECT
  USING (public.is_portal_user_for_client(auth.uid(), client_id));

CREATE POLICY "Portal user upserts own creative_approvals"
  ON public.creative_approvals FOR INSERT
  WITH CHECK (public.is_portal_user_for_client(auth.uid(), client_id));

CREATE POLICY "Portal user updates own creative_approvals"
  ON public.creative_approvals FOR UPDATE
  USING (public.is_portal_user_for_client(auth.uid(), client_id));

CREATE TRIGGER trg_creative_approvals_updated
  BEFORE UPDATE ON public.creative_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.creative_approvals;
