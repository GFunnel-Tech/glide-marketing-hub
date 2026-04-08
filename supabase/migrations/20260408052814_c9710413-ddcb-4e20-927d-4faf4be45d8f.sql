
-- Create status enum
CREATE TYPE public.client_status AS ENUM ('GREEN', 'YELLOW', 'RED', 'BLOCKED');
CREATE TYPE public.bm_type AS ENUM ('Own BM', 'Agency BM');
CREATE TYPE public.campaign_status AS ENUM ('active', 'paused');
CREATE TYPE public.report_status AS ENUM ('draft', 'ready', 'delivered');

-- Clients table
CREATE TABLE public.clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  status public.client_status NOT NULL DEFAULT 'GREEN',
  bm_type public.bm_type NOT NULL DEFAULT 'Agency BM',
  cpl NUMERIC(10,2) NOT NULL DEFAULT 0,
  cpm NUMERIC(10,2) NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  form_cvr NUMERIC(5,2) NOT NULL DEFAULT 0,
  frequency NUMERIC(4,2) NOT NULL DEFAULT 0,
  plai_connected BOOLEAN NOT NULL DEFAULT false,
  double_count BOOLEAN NOT NULL DEFAULT false,
  true_cpl NUMERIC(10,2) NOT NULL DEFAULT 0,
  reported_leads INTEGER NOT NULL DEFAULT 0,
  true_leads INTEGER NOT NULL DEFAULT 0,
  last_audit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaigns table
CREATE TABLE public.campaigns (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id INTEGER REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  status public.campaign_status NOT NULL DEFAULT 'active',
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  true_leads INTEGER NOT NULL DEFAULT 0,
  cpl NUMERIC(10,2) NOT NULL DEFAULT 0,
  true_cpl NUMERIC(10,2) NOT NULL DEFAULT 0,
  cpm NUMERIC(10,2) NOT NULL DEFAULT 0,
  frequency NUMERIC(4,2) NOT NULL DEFAULT 0,
  ad_sets INTEGER NOT NULL DEFAULT 0,
  ads INTEGER NOT NULL DEFAULT 0,
  double_count BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reports table
CREATE TABLE public.reports (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id INTEGER REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  client_name TEXT NOT NULL,
  brand TEXT NOT NULL,
  month TEXT NOT NULL,
  status public.report_status NOT NULL DEFAULT 'draft',
  delivered_date TEXT,
  client_reviewed BOOLEAN NOT NULL DEFAULT false,
  metric_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  metric_leads INTEGER NOT NULL DEFAULT 0,
  metric_cpl NUMERIC(10,2) NOT NULL DEFAULT 0,
  metric_appointments INTEGER NOT NULL DEFAULT 0,
  metric_applications INTEGER NOT NULL DEFAULT 0,
  metric_closed_deals INTEGER NOT NULL DEFAULT 0,
  metric_pipeline_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Activity log table
CREATE TABLE public.activity_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id INTEGER REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  timestamp TEXT NOT NULL,
  author TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Onboarding table
CREATE TABLE public.onboarding (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id INTEGER REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  phase INTEGER NOT NULL DEFAULT 1,
  days_in_phase INTEGER NOT NULL DEFAULT 0,
  owner TEXT NOT NULL,
  blockers TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leads table
CREATE TABLE public.leads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id INTEGER REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  stage TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Team members table
CREATE TABLE public.team_members (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  access_level TEXT NOT NULL,
  member_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables (public read access for internal dashboard)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (internal agency tool, no auth)
CREATE POLICY "Public read clients" ON public.clients FOR SELECT USING (true);
CREATE POLICY "Public write clients" ON public.clients FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read campaigns" ON public.campaigns FOR SELECT USING (true);
CREATE POLICY "Public write campaigns" ON public.campaigns FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read reports" ON public.reports FOR SELECT USING (true);
CREATE POLICY "Public write reports" ON public.reports FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read activity_log" ON public.activity_log FOR SELECT USING (true);
CREATE POLICY "Public write activity_log" ON public.activity_log FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read onboarding" ON public.onboarding FOR SELECT USING (true);
CREATE POLICY "Public write onboarding" ON public.onboarding FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read leads" ON public.leads FOR SELECT USING (true);
CREATE POLICY "Public write leads" ON public.leads FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read team_members" ON public.team_members FOR SELECT USING (true);
CREATE POLICY "Public write team_members" ON public.team_members FOR ALL USING (true) WITH CHECK (true);

-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_onboarding_updated_at BEFORE UPDATE ON public.onboarding FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
