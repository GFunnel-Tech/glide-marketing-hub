CREATE TYPE public.wallet_txn_type AS ENUM (
  'topup', 'invoice_charge', 'manual_credit', 'manual_debit', 'refund', 'adjustment'
);

CREATE TABLE public.client_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id integer NOT NULL UNIQUE,
  balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  auto_topup_enabled boolean NOT NULL DEFAULT false,
  low_balance_threshold numeric NOT NULL DEFAULT 100,
  topup_amount numeric NOT NULL DEFAULT 500,
  stripe_customer_id text,
  stripe_payment_method_id text,
  last_transaction_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.client_wallets(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  client_id integer NOT NULL,
  type public.wallet_txn_type NOT NULL,
  amount numeric NOT NULL,
  balance_after numeric NOT NULL,
  description text,
  invoice_id uuid,
  stripe_payment_intent_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_txn_wallet ON public.wallet_transactions(wallet_id, created_at DESC);

ALTER TABLE public.client_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view client_wallets" ON public.client_wallets
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners/admins write client_wallets" ON public.client_wallets
  FOR INSERT WITH CHECK (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins update client_wallets" ON public.client_wallets
  FOR UPDATE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins delete client_wallets" ON public.client_wallets
  FOR DELETE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE POLICY "Members view wallet_transactions" ON public.wallet_transactions
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners/admins write wallet_transactions" ON public.wallet_transactions
  FOR INSERT WITH CHECK (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER trg_client_wallets_updated
  BEFORE UPDATE ON public.client_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: when a transaction is inserted, update wallet balance and timestamp.
CREATE OR REPLACE FUNCTION public.apply_wallet_transaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _current numeric;
BEGIN
  SELECT balance INTO _current FROM public.client_wallets WHERE id = NEW.wallet_id FOR UPDATE;
  IF _current IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  -- credits: topup, manual_credit, refund, adjustment(+); debits: invoice_charge, manual_debit
  IF NEW.type IN ('topup','manual_credit','refund') THEN
    NEW.balance_after := _current + ABS(NEW.amount);
    NEW.amount := ABS(NEW.amount);
  ELSIF NEW.type IN ('invoice_charge','manual_debit') THEN
    NEW.balance_after := _current - ABS(NEW.amount);
    NEW.amount := -ABS(NEW.amount);
  ELSE -- adjustment: respect sign as provided
    NEW.balance_after := _current + NEW.amount;
  END IF;

  UPDATE public.client_wallets
    SET balance = NEW.balance_after, last_transaction_at = now()
    WHERE id = NEW.wallet_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_wallet_transaction
  BEFORE INSERT ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_wallet_transaction();