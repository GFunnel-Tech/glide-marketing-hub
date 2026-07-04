-- Affiliate / Partner module: real partner records, referrals, commission
-- ledger, payout batches, API keys for the public partner API, and
-- third-party integration configs (Partnero, Rewardful, FirstPromoter, ...).

-- ---------------------------------------------------------------------------
-- 1. Partners
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  email text,
  company text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  -- How this partner earns: percent of the deal's base amount or a flat fee
  -- per conversion. Both can be overridden per commission entry.
  commission_type text NOT NULL DEFAULT 'percent' CHECK (commission_type IN ('percent','flat')),
  commission_rate numeric NOT NULL DEFAULT 10,   -- percent when type=percent
  flat_amount numeric NOT NULL DEFAULT 0,        -- currency units when type=flat
  referral_code text NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  payout_method text,                            -- e.g. stripe / paypal / wire
  payout_details text,                           -- account handle / IBAN / note
  notes text,
  -- Set when this partner mirrors a record in a third-party network.
  external_provider text,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_partners_ws ON public.affiliate_partners (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_partners_code
  ON public.affiliate_partners (workspace_id, referral_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_partners_external
  ON public.affiliate_partners (workspace_id, external_provider, external_id)
  WHERE external_provider IS NOT NULL AND external_id IS NOT NULL;

ALTER TABLE public.affiliate_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view affiliate_partners" ON public.affiliate_partners
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Writers insert affiliate_partners" ON public.affiliate_partners
  FOR INSERT WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Writers update affiliate_partners" ON public.affiliate_partners
  FOR UPDATE USING (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Writers delete affiliate_partners" ON public.affiliate_partners
  FOR DELETE USING (public.can_write_workspace(auth.uid(), workspace_id));

DROP TRIGGER IF EXISTS update_affiliate_partners_updated_at ON public.affiliate_partners;
CREATE TRIGGER update_affiliate_partners_updated_at
  BEFORE UPDATE ON public.affiliate_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Referrals — a lead/deal a partner sent our way. Optionally linked to a
--    real client row once the deal lands.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE CASCADE,
  client_id integer REFERENCES public.clients(id) ON DELETE SET NULL,
  contact_name text NOT NULL,
  contact_email text,
  source text,                                    -- where the referral came in from
  status text NOT NULL DEFAULT 'lead' CHECK (status IN ('lead','trial','converted','lost')),
  deal_value numeric,                             -- expected/actual deal size
  currency text NOT NULL DEFAULT 'USD',
  converted_at timestamptz,
  external_id text,                               -- id in the third-party network
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_ws ON public.affiliate_referrals (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_partner ON public.affiliate_referrals (partner_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_referrals_external
  ON public.affiliate_referrals (workspace_id, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view affiliate_referrals" ON public.affiliate_referrals
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Writers insert affiliate_referrals" ON public.affiliate_referrals
  FOR INSERT WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Writers update affiliate_referrals" ON public.affiliate_referrals
  FOR UPDATE USING (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Writers delete affiliate_referrals" ON public.affiliate_referrals
  FOR DELETE USING (public.can_write_workspace(auth.uid(), workspace_id));

DROP TRIGGER IF EXISTS update_affiliate_referrals_updated_at ON public.affiliate_referrals;
CREATE TRIGGER update_affiliate_referrals_updated_at
  BEFORE UPDATE ON public.affiliate_referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. Commission ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE CASCADE,
  referral_id uuid REFERENCES public.affiliate_referrals(id) ON DELETE SET NULL,
  description text,
  basis_amount numeric,                           -- the deal/renewal amount commission was computed from
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','void')),
  paid_at timestamptz,
  payout_id uuid,                                 -- linked when swept into a payout batch
  external_id text,                               -- transaction id in the third-party network
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_ws ON public.affiliate_commissions (workspace_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_partner ON public.affiliate_commissions (partner_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_payout ON public.affiliate_commissions (payout_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_commissions_external
  ON public.affiliate_commissions (workspace_id, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view affiliate_commissions" ON public.affiliate_commissions
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Writers insert affiliate_commissions" ON public.affiliate_commissions
  FOR INSERT WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Writers update affiliate_commissions" ON public.affiliate_commissions
  FOR UPDATE USING (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Writers delete affiliate_commissions" ON public.affiliate_commissions
  FOR DELETE USING (public.can_write_workspace(auth.uid(), workspace_id));

DROP TRIGGER IF EXISTS update_affiliate_commissions_updated_at ON public.affiliate_commissions;
CREATE TRIGGER update_affiliate_commissions_updated_at
  BEFORE UPDATE ON public.affiliate_commissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. Payout batches — sweep approved commissions into a payout per partner.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','processing','paid','failed')),
  method text,
  reference text,                                 -- external payment reference / transfer id
  notes text,
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_ws ON public.affiliate_payouts (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_partner ON public.affiliate_payouts (partner_id);

ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view affiliate_payouts" ON public.affiliate_payouts
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Writers insert affiliate_payouts" ON public.affiliate_payouts
  FOR INSERT WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Writers update affiliate_payouts" ON public.affiliate_payouts
  FOR UPDATE USING (public.can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Writers delete affiliate_payouts" ON public.affiliate_payouts
  FOR DELETE USING (public.can_write_workspace(auth.uid(), workspace_id));

DROP TRIGGER IF EXISTS update_affiliate_payouts_updated_at ON public.affiliate_payouts;
CREATE TRIGGER update_affiliate_payouts_updated_at
  BEFORE UPDATE ON public.affiliate_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. API keys for the public partner API (edge function `affiliate-api`).
--    Only a SHA-256 hash is stored; the plaintext key is shown once at
--    creation. Owner/admin only — a key grants workspace-wide affiliate access.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  key_prefix text NOT NULL,                       -- first chars of the key, for display + lookup
  key_hash text NOT NULL,                         -- sha256 hex of the full key
  scopes text[] NOT NULL DEFAULT '{read,write}',
  enabled boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_affiliate_api_keys_ws ON public.affiliate_api_keys (workspace_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_api_keys_prefix ON public.affiliate_api_keys (key_prefix);

ALTER TABLE public.affiliate_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners/admins view affiliate_api_keys" ON public.affiliate_api_keys
  FOR SELECT USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "Owners/admins update affiliate_api_keys" ON public.affiliate_api_keys
  FOR UPDATE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "Owners/admins delete affiliate_api_keys" ON public.affiliate_api_keys
  FOR DELETE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin') OR public.is_super_admin(auth.uid()));
-- Inserts happen server-side (edge function with service role) so the
-- plaintext key never exists client-side; no INSERT policy on purpose.

-- ---------------------------------------------------------------------------
-- 6. Third-party integration configs (Partnero, Rewardful, FirstPromoter, ...)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('partnero','rewardful','firstpromoter','custom')),
  api_key text,                                   -- the provider's API key/token
  api_base text,                                  -- override base URL (custom providers)
  program_id text,                                -- Partnero program / provider campaign id
  -- Inbound webhook auth: token identifies the workspace in the public webhook
  -- URL; secret (optional) HMAC-verifies the payload when the provider signs it.
  webhook_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  webhook_secret text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_sync_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_integrations_provider
  ON public.affiliate_integrations (workspace_id, provider);
CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_integrations_token
  ON public.affiliate_integrations (webhook_token);

ALTER TABLE public.affiliate_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners/admins view affiliate_integrations" ON public.affiliate_integrations
  FOR SELECT USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "Owners/admins insert affiliate_integrations" ON public.affiliate_integrations
  FOR INSERT WITH CHECK (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "Owners/admins update affiliate_integrations" ON public.affiliate_integrations
  FOR UPDATE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "Owners/admins delete affiliate_integrations" ON public.affiliate_integrations
  FOR DELETE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin') OR public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS update_affiliate_integrations_updated_at ON public.affiliate_integrations;
CREATE TRIGGER update_affiliate_integrations_updated_at
  BEFORE UPDATE ON public.affiliate_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 7. Event log — every inbound webhook, API write, and sync run lands here so
--    the UI can show an audit trail and debugging is possible.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('api','webhook','sync','app')),
  provider text,
  event_type text NOT NULL,
  payload jsonb,
  status text NOT NULL DEFAULT 'processed',       -- processed | error | ignored
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_events_ws ON public.affiliate_events (workspace_id, created_at DESC);

ALTER TABLE public.affiliate_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view affiliate_events" ON public.affiliate_events
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
-- Writes come from edge functions (service role) only.
