CREATE TABLE public.ghl_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  location_id text NOT NULL,
  name text,
  business_name text,
  timezone text,
  address text,
  raw jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, location_id)
);

ALTER TABLE public.ghl_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view ghl_locations" ON public.ghl_locations
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Owners/admins write ghl_locations" ON public.ghl_locations
  FOR INSERT WITH CHECK (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE POLICY "Owners/admins update ghl_locations" ON public.ghl_locations
  FOR UPDATE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE POLICY "Owners/admins delete ghl_locations" ON public.ghl_locations
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER update_ghl_locations_updated_at
  BEFORE UPDATE ON public.ghl_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ghl_locations_workspace ON public.ghl_locations(workspace_id);