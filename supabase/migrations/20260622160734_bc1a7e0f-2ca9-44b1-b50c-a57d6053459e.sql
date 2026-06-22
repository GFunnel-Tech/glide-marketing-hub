
-- workspace_embed_tabs: agency-defined tab catalog
CREATE TABLE public.workspace_embed_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label text NOT NULL,
  provider text NOT NULL DEFAULT 'custom',
  icon text DEFAULT 'FileText',
  url_template text,
  sort_order int NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_embed_tabs_ws_idx ON public.workspace_embed_tabs(workspace_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_embed_tabs TO authenticated;
GRANT ALL ON public.workspace_embed_tabs TO service_role;

ALTER TABLE public.workspace_embed_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members manage embed tabs"
  ON public.workspace_embed_tabs FOR ALL TO authenticated
  USING (public.can_write_workspace(auth.uid(), workspace_id))
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "portal users read tabs for their client workspace"
  ON public.workspace_embed_tabs FOR SELECT TO authenticated
  USING (
    enabled = true
    AND EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.user_id = auth.uid()
        AND pu.workspace_id = workspace_embed_tabs.workspace_id
        AND (pu.status IN ('approved','accepted','active') OR pu.accepted_at IS NOT NULL)
    )
  );

CREATE TRIGGER workspace_embed_tabs_updated_at
  BEFORE UPDATE ON public.workspace_embed_tabs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- client_embeds: per-client populated URL/token for each tab
CREATE TABLE public.client_embeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id int NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tab_id uuid NOT NULL REFERENCES public.workspace_embed_tabs(id) ON DELETE CASCADE,
  embed_url text NOT NULL,
  public_token text,
  status text NOT NULL DEFAULT 'pending',
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, tab_id)
);
CREATE INDEX client_embeds_client_idx ON public.client_embeds(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_embeds TO authenticated;
GRANT ALL ON public.client_embeds TO service_role;

ALTER TABLE public.client_embeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members manage client embeds"
  ON public.client_embeds FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_embeds.client_id
      AND public.can_write_workspace(auth.uid(), c.workspace_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_embeds.client_id
      AND public.can_write_workspace(auth.uid(), c.workspace_id)
  ));

CREATE POLICY "portal users read own client embeds"
  ON public.client_embeds FOR SELECT TO authenticated
  USING (public.is_portal_user_for_client(auth.uid(), client_id));

CREATE TRIGGER client_embeds_updated_at
  BEFORE UPDATE ON public.client_embeds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_embed_tabs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_embeds;
