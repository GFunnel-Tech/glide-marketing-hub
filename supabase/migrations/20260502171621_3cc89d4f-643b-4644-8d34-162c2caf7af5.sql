-- =========================================
-- META ADS INTEGRATION SCHEMA
-- =========================================

-- 1) meta_connections: one row per user OAuth connection (or manual token)
CREATE TABLE public.meta_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connected_by UUID NOT NULL,
  connection_type TEXT NOT NULL DEFAULT 'oauth' CHECK (connection_type IN ('oauth','manual')),
  meta_user_id TEXT,
  meta_user_name TEXT,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked','error')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_meta_connections_workspace ON public.meta_connections(workspace_id);

ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view meta_connections" ON public.meta_connections
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members insert meta_connections" ON public.meta_connections
  FOR INSERT WITH CHECK (can_write_workspace(auth.uid(), workspace_id) AND connected_by = auth.uid());
CREATE POLICY "Owners/admins update meta_connections" ON public.meta_connections
  FOR UPDATE USING (workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role]));
CREATE POLICY "Owners/admins delete meta_connections" ON public.meta_connections
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role]));

CREATE TRIGGER trg_meta_connections_updated
  BEFORE UPDATE ON public.meta_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) meta_ad_accounts: each ad account discovered from a connection
CREATE TABLE public.meta_ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  client_id INTEGER REFERENCES public.clients(id) ON DELETE SET NULL,
  act_id TEXT NOT NULL,                 -- e.g. "act_1234567890"
  account_name TEXT,
  currency TEXT,
  timezone_name TEXT,
  business_id TEXT,
  business_name TEXT,
  account_status INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, act_id)
);
CREATE INDEX idx_meta_ad_accounts_workspace ON public.meta_ad_accounts(workspace_id);
CREATE INDEX idx_meta_ad_accounts_client ON public.meta_ad_accounts(client_id);
CREATE INDEX idx_meta_ad_accounts_connection ON public.meta_ad_accounts(connection_id);

ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view meta_ad_accounts" ON public.meta_ad_accounts
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members insert meta_ad_accounts" ON public.meta_ad_accounts
  FOR INSERT WITH CHECK (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update meta_ad_accounts" ON public.meta_ad_accounts
  FOR UPDATE USING (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Owners/admins delete meta_ad_accounts" ON public.meta_ad_accounts
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role]));

CREATE TRIGGER trg_meta_ad_accounts_updated
  BEFORE UPDATE ON public.meta_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) meta_insights_daily: daily performance per ad account
CREATE TABLE public.meta_insights_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ad_account_id UUID NOT NULL REFERENCES public.meta_ad_accounts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  spend NUMERIC NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  cpl NUMERIC NOT NULL DEFAULT 0,
  cpm NUMERIC NOT NULL DEFAULT 0,
  ctr NUMERIC NOT NULL DEFAULT 0,
  frequency NUMERIC NOT NULL DEFAULT 0,
  reach BIGINT NOT NULL DEFAULT 0,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, date)
);
CREATE INDEX idx_meta_insights_workspace_date ON public.meta_insights_daily(workspace_id, date DESC);
CREATE INDEX idx_meta_insights_account_date ON public.meta_insights_daily(ad_account_id, date DESC);

ALTER TABLE public.meta_insights_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view meta_insights_daily" ON public.meta_insights_daily
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
-- Writes happen via service role from the sync edge function only.

CREATE TRIGGER trg_meta_insights_daily_updated
  BEFORE UPDATE ON public.meta_insights_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) meta_sync_log: history of sync runs
CREATE TABLE public.meta_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.meta_connections(id) ON DELETE SET NULL,
  ad_account_id UUID REFERENCES public.meta_ad_accounts(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual','scheduled','oauth_connect')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','error')),
  rows_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_meta_sync_log_workspace ON public.meta_sync_log(workspace_id, started_at DESC);

ALTER TABLE public.meta_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view meta_sync_log" ON public.meta_sync_log
  FOR SELECT USING (workspace_id IS NOT NULL AND is_workspace_member(auth.uid(), workspace_id));

-- 5) Extend existing ad_accounts with client mapping (for manual-token flow parity)
ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ad_accounts_client ON public.ad_accounts(client_id);

-- 6) Useful index for rollup
CREATE INDEX IF NOT EXISTS idx_clients_workspace ON public.clients(workspace_id);