
-- Tracking system: containers, pixels, tags, events
CREATE TABLE public.tracking_containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id integer REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  public_key text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(9), 'base64'),
  domain text,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.tracking_containers(workspace_id);
CREATE INDEX ON public.tracking_containers(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_containers TO authenticated;
GRANT ALL ON public.tracking_containers TO service_role;
GRANT SELECT ON public.tracking_containers TO anon;
ALTER TABLE public.tracking_containers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members read containers" ON public.tracking_containers FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws writers manage containers" ON public.tracking_containers FOR ALL TO authenticated
  USING (public.can_write_workspace(auth.uid(), workspace_id))
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
-- anon select needed for snippet loader (uses public_key only)
CREATE POLICY "anon read by public_key" ON public.tracking_containers FOR SELECT TO anon
  USING (enabled = true);
CREATE TRIGGER trg_tracking_containers_upd BEFORE UPDATE ON public.tracking_containers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tracking_pixels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id uuid NOT NULL REFERENCES public.tracking_containers(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id integer REFERENCES public.clients(id) ON DELETE CASCADE,
  platform text NOT NULL,
  pixel_id text NOT NULL,
  label text,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.tracking_pixels(container_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_pixels TO authenticated;
GRANT ALL ON public.tracking_pixels TO service_role;
GRANT SELECT ON public.tracking_pixels TO anon;
ALTER TABLE public.tracking_pixels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members read pixels" ON public.tracking_pixels FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws writers manage pixels" ON public.tracking_pixels FOR ALL TO authenticated
  USING (public.can_write_workspace(auth.uid(), workspace_id))
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "anon read pixels" ON public.tracking_pixels FOR SELECT TO anon USING (enabled = true);
CREATE TRIGGER trg_tracking_pixels_upd BEFORE UPDATE ON public.tracking_pixels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tracking_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id uuid NOT NULL REFERENCES public.tracking_containers(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  tag_type text NOT NULL DEFAULT 'custom_html',
  code text,
  trigger_type text NOT NULL DEFAULT 'pageview',
  trigger_event text,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.tracking_tags(container_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_tags TO authenticated;
GRANT ALL ON public.tracking_tags TO service_role;
GRANT SELECT ON public.tracking_tags TO anon;
ALTER TABLE public.tracking_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members read tags" ON public.tracking_tags FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws writers manage tags" ON public.tracking_tags FOR ALL TO authenticated
  USING (public.can_write_workspace(auth.uid(), workspace_id))
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "anon read tags" ON public.tracking_tags FOR SELECT TO anon USING (enabled = true);
CREATE TRIGGER trg_tracking_tags_upd BEFORE UPDATE ON public.tracking_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id uuid NOT NULL REFERENCES public.tracking_containers(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id integer REFERENCES public.clients(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  url text,
  referrer text,
  user_agent text,
  ip_hash text,
  anon_id text,
  session_id text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.tracking_events(workspace_id, occurred_at DESC);
CREATE INDEX ON public.tracking_events(container_id, occurred_at DESC);
CREATE INDEX ON public.tracking_events(client_id, occurred_at DESC);
CREATE INDEX ON public.tracking_events(event_name);
GRANT SELECT ON public.tracking_events TO authenticated;
GRANT ALL ON public.tracking_events TO service_role;
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members read events" ON public.tracking_events FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
-- inserts performed by edge function with service role only (no policy needed for authenticated/anon)
