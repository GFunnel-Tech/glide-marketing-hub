
-- One agency Stripe connection per workspace
CREATE TABLE public.workspace_stripe_accounts (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  account_id text,
  account_name text,
  account_email text,
  livemode boolean DEFAULT true,
  connected_by uuid REFERENCES auth.users(id),
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  last_sync_charges_count integer DEFAULT 0,
  last_sync_matched_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ONLY service_role can touch this table directly (api_key is sensitive)
GRANT ALL ON public.workspace_stripe_accounts TO service_role;

ALTER TABLE public.workspace_stripe_accounts ENABLE ROW LEVEL SECURITY;

-- (no policies for authenticated; they must use the RPC below)

CREATE TRIGGER trg_workspace_stripe_accounts_updated
  BEFORE UPDATE ON public.workspace_stripe_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Safe metadata accessor (no api_key exposed)
CREATE OR REPLACE FUNCTION public.get_workspace_stripe_status(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _row RECORD;
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR public.workspace_role_of(auth.uid(), _workspace_id) IN ('owner','admin','member')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT account_id, account_name, account_email, livemode,
         connected_at, last_sync_at, last_sync_status, last_sync_error,
         last_sync_charges_count, last_sync_matched_count
    INTO _row
  FROM public.workspace_stripe_accounts
  WHERE workspace_id = _workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('connected', false);
  END IF;

  RETURN jsonb_build_object(
    'connected', true,
    'account_id', _row.account_id,
    'account_name', _row.account_name,
    'account_email', _row.account_email,
    'livemode', _row.livemode,
    'connected_at', _row.connected_at,
    'last_sync_at', _row.last_sync_at,
    'last_sync_status', _row.last_sync_status,
    'last_sync_error', _row.last_sync_error,
    'last_sync_charges_count', _row.last_sync_charges_count,
    'last_sync_matched_count', _row.last_sync_matched_count
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_workspace_stripe_status(uuid) TO authenticated;
