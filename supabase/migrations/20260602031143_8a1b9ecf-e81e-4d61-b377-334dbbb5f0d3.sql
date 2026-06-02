-- ============================================================
-- Stripe Connect: per-client account tokens (service-role only)
-- ============================================================
CREATE TABLE public.client_stripe_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id integer NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stripe_user_id text NOT NULL,        -- acct_xxx
  access_token text NOT NULL,          -- sk_*  (NEVER expose to client)
  refresh_token text,                  -- rt_*
  publishable_key text,                -- pk_*
  scope text,                          -- read_only | read_write
  livemode boolean NOT NULL DEFAULT false,
  token_type text,
  connect_type text NOT NULL DEFAULT 'standard',  -- standard | express
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  last_event_at timestamptz,
  last_event_type text,
  raw_oauth_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_csa_workspace ON public.client_stripe_accounts(workspace_id);
CREATE INDEX idx_csa_stripe_user ON public.client_stripe_accounts(stripe_user_id);

-- Tokens are secrets: ONLY service role may touch the base table.
GRANT ALL ON public.client_stripe_accounts TO service_role;
-- Intentionally NO grant to anon/authenticated.

ALTER TABLE public.client_stripe_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access csa"
  ON public.client_stripe_accounts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER trg_csa_updated_at
  BEFORE UPDATE ON public.client_stripe_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Non-secret status view for the UI (workspace members)
-- ============================================================
CREATE VIEW public.client_stripe_connections
WITH (security_invoker = true) AS
SELECT
  csa.id,
  csa.client_id,
  csa.workspace_id,
  csa.stripe_user_id,
  csa.scope,
  csa.livemode,
  csa.connect_type,
  csa.connected_at,
  csa.disconnected_at,
  csa.last_event_at,
  csa.last_event_type,
  csa.publishable_key,
  (csa.access_token IS NOT NULL AND csa.disconnected_at IS NULL) AS is_connected
FROM public.client_stripe_accounts csa
WHERE public.is_workspace_member(auth.uid(), csa.workspace_id);

GRANT SELECT ON public.client_stripe_connections TO authenticated;

-- The view inherits the base table's RLS via security_invoker — but
-- because the base table denies authenticated, the view would also
-- deny. Add a SELECT policy on the base table that allows workspace
-- members to see ONLY non-secret columns via the view. We restrict
-- which columns by giving column-level SELECT on the base table.
CREATE POLICY "workspace members read status csa"
  ON public.client_stripe_accounts
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Column-level: authenticated may SELECT only non-secret columns.
GRANT SELECT (
  id, client_id, workspace_id, stripe_user_id, scope, livemode,
  connect_type, connected_at, disconnected_at, last_event_at,
  last_event_type, publishable_key, created_at, updated_at
) ON public.client_stripe_accounts TO authenticated;
-- NOTE: access_token, refresh_token, raw_oauth_response are NOT granted.

-- ============================================================
-- OAuth state nonces (CSRF protection on /callback)
-- ============================================================
CREATE TABLE public.stripe_connect_oauth_states (
  state text PRIMARY KEY,
  client_id integer NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connect_type text NOT NULL DEFAULT 'standard',
  return_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at timestamptz
);

GRANT ALL ON public.stripe_connect_oauth_states TO service_role;
ALTER TABLE public.stripe_connect_oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access scos"
  ON public.stripe_connect_oauth_states
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Mirrored charges per connected client (webhook-populated)
-- ============================================================
CREATE TABLE public.stripe_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id integer NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stripe_user_id text NOT NULL,
  stripe_charge_id text NOT NULL,
  stripe_customer_id text,
  customer_email text,
  amount integer NOT NULL,            -- minor units (cents)
  amount_refunded integer NOT NULL DEFAULT 0,
  currency text NOT NULL,
  status text NOT NULL,               -- succeeded | pending | failed
  paid boolean NOT NULL DEFAULT false,
  refunded boolean NOT NULL DEFAULT false,
  failure_code text,
  failure_message text,
  description text,
  receipt_url text,
  livemode boolean NOT NULL DEFAULT false,
  created_at_stripe timestamptz NOT NULL,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stripe_user_id, stripe_charge_id)
);

CREATE INDEX idx_sc_client ON public.stripe_charges(client_id, created_at_stripe DESC);
CREATE INDEX idx_sc_workspace ON public.stripe_charges(workspace_id, created_at_stripe DESC);
CREATE INDEX idx_sc_status ON public.stripe_charges(status);

GRANT SELECT ON public.stripe_charges TO authenticated;
GRANT ALL ON public.stripe_charges TO service_role;

ALTER TABLE public.stripe_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read charges"
  ON public.stripe_charges
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "service role write charges"
  ON public.stripe_charges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_sc_updated_at
  BEFORE UPDATE ON public.stripe_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();