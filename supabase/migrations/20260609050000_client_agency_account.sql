-- First-class "agency account": let a workspace flag one client as the
-- agency's own marketing account (e.g. Expert Mortgage Marketing running ads
-- for itself). It is pinned to the top of the dashboard and never hidden by
-- the zero-activity filter.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_agency_account boolean NOT NULL DEFAULT false;

-- At most one agency account per workspace.
CREATE UNIQUE INDEX IF NOT EXISTS clients_one_agency_per_workspace
  ON public.clients (workspace_id)
  WHERE is_agency_account;
