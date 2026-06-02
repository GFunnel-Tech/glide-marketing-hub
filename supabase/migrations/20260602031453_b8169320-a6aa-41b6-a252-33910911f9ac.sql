ALTER TABLE public.client_stripe_accounts
  ADD COLUMN IF NOT EXISTS webhook_signing_secret text;

-- The base table's column-level grant to `authenticated` already excludes
-- this column (it was not in the GRANT (...) list). Reaffirm by REVOKEing
-- explicitly so a future change can't accidentally widen access.
REVOKE SELECT (webhook_signing_secret, access_token, refresh_token, raw_oauth_response)
  ON public.client_stripe_accounts FROM authenticated;