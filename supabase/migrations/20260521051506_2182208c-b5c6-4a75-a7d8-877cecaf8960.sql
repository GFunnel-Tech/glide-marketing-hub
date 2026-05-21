
-- 1. GHL OAuth installs (one row per installed sub-account / location)
CREATE TABLE public.ghl_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id integer,
  location_id text NOT NULL,
  company_id text,
  location_name text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  user_type text,
  status text NOT NULL DEFAULT 'active',
  last_error text,
  installed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id)
);
ALTER TABLE public.ghl_installs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view ghl_installs" ON public.ghl_installs FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write ghl_installs" ON public.ghl_installs FOR INSERT WITH CHECK (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update ghl_installs" ON public.ghl_installs FOR UPDATE USING (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Admins delete ghl_installs" ON public.ghl_installs FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role]));
CREATE TRIGGER tr_ghl_installs_updated BEFORE UPDATE ON public.ghl_installs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_ghl_installs_client ON public.ghl_installs(client_id);
CREATE INDEX idx_ghl_installs_workspace ON public.ghl_installs(workspace_id);

-- 2. OAuth state (CSRF) for ghl-oauth-start/callback
CREATE TABLE public.ghl_oauth_states (
  state text PRIMARY KEY,
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  client_id integer,
  redirect_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);
ALTER TABLE public.ghl_oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User reads own state" ON public.ghl_oauth_states FOR SELECT USING (user_id = auth.uid());

-- 3. GHL Opportunities
CREATE TABLE public.ghl_opportunities (
  id text PRIMARY KEY,
  workspace_id uuid NOT NULL,
  client_id integer,
  location_id text NOT NULL,
  contact_id text,
  pipeline_id text,
  pipeline_name text,
  stage_id text,
  stage_name text,
  status text,
  monetary_value numeric,
  assigned_to text,
  name text,
  source text,
  raw jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ghl_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view ghl_opportunities" ON public.ghl_opportunities FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write ghl_opportunities" ON public.ghl_opportunities FOR INSERT WITH CHECK (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update ghl_opportunities" ON public.ghl_opportunities FOR UPDATE USING (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Admins delete ghl_opportunities" ON public.ghl_opportunities FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role]));
CREATE POLICY "Portal user reads own ghl_opportunities" ON public.ghl_opportunities FOR SELECT USING (client_id IS NOT NULL AND is_portal_user_for_client(auth.uid(), client_id));
CREATE INDEX idx_ghl_opps_client ON public.ghl_opportunities(client_id);
CREATE INDEX idx_ghl_opps_contact ON public.ghl_opportunities(contact_id);
CREATE INDEX idx_ghl_opps_location ON public.ghl_opportunities(location_id);

-- 4. GHL Appointments
CREATE TABLE public.ghl_appointments (
  id text PRIMARY KEY,
  workspace_id uuid NOT NULL,
  client_id integer,
  location_id text NOT NULL,
  contact_id text,
  calendar_id text,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  assigned_to text,
  raw jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ghl_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view ghl_appointments" ON public.ghl_appointments FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write ghl_appointments" ON public.ghl_appointments FOR INSERT WITH CHECK (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update ghl_appointments" ON public.ghl_appointments FOR UPDATE USING (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Admins delete ghl_appointments" ON public.ghl_appointments FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role]));
CREATE POLICY "Portal user reads own ghl_appointments" ON public.ghl_appointments FOR SELECT USING (client_id IS NOT NULL AND is_portal_user_for_client(auth.uid(), client_id));
CREATE INDEX idx_ghl_appts_client ON public.ghl_appointments(client_id);
CREATE INDEX idx_ghl_appts_contact ON public.ghl_appointments(contact_id);
CREATE INDEX idx_ghl_appts_start ON public.ghl_appointments(start_time);

-- 5. Sync state per location
CREATE TABLE public.ghl_sync_state (
  location_id text PRIMARY KEY,
  workspace_id uuid NOT NULL,
  client_id integer,
  last_contacts_sync_at timestamptz,
  last_opps_sync_at timestamptz,
  last_appts_sync_at timestamptz,
  last_run_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ghl_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view ghl_sync_state" ON public.ghl_sync_state FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));

-- 6. Inbound webhook log
CREATE TABLE public.ghl_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text,
  location_id text,
  company_id text,
  signature_valid boolean,
  payload jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ghl_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read ghl_webhook_events" ON public.ghl_webhook_events FOR SELECT USING (is_super_admin(auth.uid()));
CREATE INDEX idx_ghl_webhook_location ON public.ghl_webhook_events(location_id);
CREATE INDEX idx_ghl_webhook_created ON public.ghl_webhook_events(created_at DESC);

-- 7. Stage mapping (internal lead stage → GHL pipeline/stage)
CREATE TABLE public.ghl_stage_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id integer NOT NULL,
  internal_stage text NOT NULL,
  pipeline_id text NOT NULL,
  stage_id text NOT NULL,
  pipeline_name text,
  stage_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, internal_stage)
);
ALTER TABLE public.ghl_stage_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view ghl_stage_map" ON public.ghl_stage_map FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write ghl_stage_map" ON public.ghl_stage_map FOR INSERT WITH CHECK (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update ghl_stage_map" ON public.ghl_stage_map FOR UPDATE USING (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Admins delete ghl_stage_map" ON public.ghl_stage_map FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role]));

-- 8. Add ghl_contact_id linkage to leads tables
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ghl_contact_id text;
ALTER TABLE public.meta_leads ADD COLUMN IF NOT EXISTS ghl_contact_id text;
CREATE INDEX IF NOT EXISTS idx_leads_ghl_contact ON public.leads(ghl_contact_id);
CREATE INDEX IF NOT EXISTS idx_meta_leads_ghl_contact ON public.meta_leads(ghl_contact_id);

-- 9. Enable extensions for cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
