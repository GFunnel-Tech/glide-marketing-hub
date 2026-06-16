
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id integer,
  stripe_user_id text,
  stripe_charge_id text,
  stripe_customer_id text,
  customer_email text,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warn',
  status text NOT NULL DEFAULT 'open',
  amount integer DEFAULT 0,
  currency text DEFAULT 'usd',
  failure_code text,
  failure_message text,
  description text,
  raw jsonb,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_events_workspace_status_created
  ON public.payment_events (workspace_id, status, created_at DESC);
CREATE INDEX idx_payment_events_client
  ON public.payment_events (client_id, created_at DESC);
CREATE UNIQUE INDEX idx_payment_events_dedupe
  ON public.payment_events (stripe_user_id, stripe_charge_id, event_type);

GRANT SELECT, INSERT, UPDATE ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view payment events"
  ON public.payment_events FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace admins can update payment events"
  ON public.payment_events FOR UPDATE
  USING (
    public.is_super_admin(auth.uid())
    OR public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin','member')
  );

CREATE POLICY "Service role manages payment events"
  ON public.payment_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_payment_events_updated_at
  BEFORE UPDATE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.payment_events (
  workspace_id, client_id, stripe_user_id, stripe_charge_id, stripe_customer_id,
  customer_email, event_type, severity, amount, currency,
  failure_code, failure_message, description, raw, created_at
)
SELECT
  sc.workspace_id, sc.client_id, sc.stripe_user_id, sc.stripe_charge_id, sc.stripe_customer_id,
  sc.customer_email, 'charge_failed', 'critical', sc.amount, sc.currency,
  sc.failure_code, sc.failure_message, sc.description, sc.raw,
  COALESCE(sc.created_at_stripe, sc.updated_at, now())
FROM public.stripe_charges sc
WHERE sc.status = 'failed'
  AND sc.stripe_charge_id IS NOT NULL
  AND COALESCE(sc.created_at_stripe, sc.updated_at) > now() - interval '90 days'
ON CONFLICT (stripe_user_id, stripe_charge_id, event_type) DO NOTHING;
