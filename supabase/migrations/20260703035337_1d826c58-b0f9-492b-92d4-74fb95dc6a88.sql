ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS currency_code text;
-- Best-effort backfill from existing country data; only set where we're confident.
UPDATE public.clients SET currency_code = 'CAD' WHERE currency_code IS NULL AND country = 'CA';
UPDATE public.clients SET currency_code = 'USD' WHERE currency_code IS NULL AND country = 'US';
COMMENT ON COLUMN public.clients.currency_code IS 'ISO 4217 currency for the account. NULL = unconfigured; UI must not assume USD.';