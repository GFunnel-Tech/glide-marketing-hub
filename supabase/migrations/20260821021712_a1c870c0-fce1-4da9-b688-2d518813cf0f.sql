CREATE TABLE IF NOT EXISTS public.portal_embed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id bigint NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id uuid,
  location_id text NOT NULL,
  token text NOT NULL UNIQUE,
  label text,
  revoked boolean NOT NULL DEFAULT false,
  use_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_embed_tokens_client_idx ON public.portal_embed_tokens (client_id);
CREATE INDEX IF NOT EXISTS portal_embed_tokens_location_idx ON public.portal_embed_tokens (location_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_embed_tokens TO authenticated;
GRANT ALL ON public.portal_embed_tokens TO service_role;

ALTER TABLE public.portal_embed_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view embed tokens"
ON public.portal_embed_tokens FOR SELECT TO authenticated
USING (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace writers can create embed tokens"
ON public.portal_embed_tokens FOR INSERT TO authenticated
WITH CHECK (workspace_id IS NOT NULL AND public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Workspace writers can update embed tokens"
ON public.portal_embed_tokens FOR UPDATE TO authenticated
USING (workspace_id IS NOT NULL AND public.can_write_workspace(auth.uid(), workspace_id))
WITH CHECK (workspace_id IS NOT NULL AND public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Workspace writers can delete embed tokens"
ON public.portal_embed_tokens FOR DELETE TO authenticated
USING (workspace_id IS NOT NULL AND public.can_write_workspace(auth.uid(), workspace_id));