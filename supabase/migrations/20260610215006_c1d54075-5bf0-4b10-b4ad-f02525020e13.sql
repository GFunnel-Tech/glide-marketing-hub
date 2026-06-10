ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_agency_account boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS clients_one_agency_per_workspace
  ON public.clients (workspace_id)
  WHERE is_agency_account;