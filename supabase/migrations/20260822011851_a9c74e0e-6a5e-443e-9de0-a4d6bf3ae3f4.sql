-- ============ GHL pipelines & stages ============
CREATE TABLE public.ghl_pipelines (
  id text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  location_id text NOT NULL,
  client_id integer REFERENCES public.clients(id) ON DELETE SET NULL,
  name text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ghl_pipelines TO authenticated;
GRANT ALL ON public.ghl_pipelines TO service_role;
ALTER TABLE public.ghl_pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view ghl pipelines" ON public.ghl_pipelines FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE INDEX ghl_pipelines_ws_idx ON public.ghl_pipelines(workspace_id, location_id);

CREATE TABLE public.ghl_pipeline_stages (
  id text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pipeline_id text NOT NULL,
  location_id text NOT NULL,
  name text,
  position integer,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ghl_pipeline_stages TO authenticated;
GRANT ALL ON public.ghl_pipeline_stages TO service_role;
ALTER TABLE public.ghl_pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view ghl pipeline stages" ON public.ghl_pipeline_stages FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE INDEX ghl_pipeline_stages_pipeline_idx ON public.ghl_pipeline_stages(pipeline_id, position);

-- ============ GHL contacts ============
CREATE TABLE public.ghl_contacts (
  id text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  location_id text NOT NULL,
  client_id integer REFERENCES public.clients(id) ON DELETE SET NULL,
  first_name text,
  last_name text,
  full_name text,
  email text,
  phone text,
  tags text[] NOT NULL DEFAULT '{}',
  source text,
  assigned_to text,
  dnd boolean NOT NULL DEFAULT false,
  custom_fields jsonb,
  date_added timestamptz,
  date_updated timestamptz,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ghl_contacts TO authenticated;
GRANT ALL ON public.ghl_contacts TO service_role;
ALTER TABLE public.ghl_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view ghl contacts" ON public.ghl_contacts FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Portal users view their ghl contacts" ON public.ghl_contacts FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND public.is_portal_user_for_client(auth.uid(), client_id));
CREATE INDEX ghl_contacts_ws_idx ON public.ghl_contacts(workspace_id, location_id);
CREATE INDEX ghl_contacts_client_idx ON public.ghl_contacts(client_id);
CREATE INDEX ghl_contacts_email_idx ON public.ghl_contacts(lower(email));
CREATE INDEX ghl_contacts_updated_idx ON public.ghl_contacts(location_id, date_updated DESC);

-- ============ GHL contact notes ============
CREATE TABLE public.ghl_contact_notes (
  id text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  location_id text NOT NULL,
  client_id integer REFERENCES public.clients(id) ON DELETE SET NULL,
  contact_id text NOT NULL,
  body text,
  created_by text,
  date_added timestamptz,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ghl_contact_notes TO authenticated;
GRANT ALL ON public.ghl_contact_notes TO service_role;
ALTER TABLE public.ghl_contact_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view ghl contact notes" ON public.ghl_contact_notes FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE INDEX ghl_contact_notes_contact_idx ON public.ghl_contact_notes(contact_id, date_added DESC);

-- ============ GHL contact tasks ============
CREATE TABLE public.ghl_contact_tasks (
  id text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  location_id text NOT NULL,
  client_id integer REFERENCES public.clients(id) ON DELETE SET NULL,
  contact_id text NOT NULL,
  title text,
  body text,
  due_date timestamptz,
  completed boolean NOT NULL DEFAULT false,
  assigned_to text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ghl_contact_tasks TO authenticated;
GRANT ALL ON public.ghl_contact_tasks TO service_role;
ALTER TABLE public.ghl_contact_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view ghl contact tasks" ON public.ghl_contact_tasks FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE INDEX ghl_contact_tasks_contact_idx ON public.ghl_contact_tasks(contact_id, due_date);

-- ============ Appointment enrichment ============
ALTER TABLE public.ghl_appointments
  ADD COLUMN IF NOT EXISTS calendar_name text,
  ADD COLUMN IF NOT EXISTS assigned_user_name text,
  ADD COLUMN IF NOT EXISTS outcome text;
