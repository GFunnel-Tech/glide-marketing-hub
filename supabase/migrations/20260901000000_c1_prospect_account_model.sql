-- C1 · Prospect & account model
--
-- Introduces agency-side prospects: a company can now exist in the system
-- before it is a paying client. Implements the recommended shape from
-- docs/scope-of-work.md §4.2 — a lifecycle discriminator on `clients` rather
-- than a separate `prospects` table — so that tasks, notes, AI context,
-- research artifacts, approvals and the ClickUp binding all work on a prospect
-- from day one without parallel plumbing.
--
-- This migration is ADDITIVE AND NON-DESTRUCTIVE. Every existing row defaults
-- to lifecycle='client', so no current query, view, cron or function changes
-- behaviour. Exclusion of pre-sale rows is applied in the application layer in
-- this change; see the C1b note at the foot of this file for the server-side
-- half, which needs the current function bodies to do safely.

-- 1 · Lifecycle discriminator ------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'client_lifecycle') THEN
    CREATE TYPE public.client_lifecycle AS ENUM ('prospect', 'client', 'churned');
  END IF;
END$$;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS lifecycle public.client_lifecycle NOT NULL DEFAULT 'client';

COMMENT ON COLUMN public.clients.lifecycle IS
  'Pre-sale (prospect) vs paying (client) vs former (churned). Anything that '
  'reports revenue, spend, KPIs or billing must filter to lifecycle = ''client''. '
  'Defaults to ''client'' so pre-existing rows are unaffected.';

-- 2 · Account fields ---------------------------------------------------------
-- The target-account list the D3 playbook's Day 0 requires: company,
-- decision-maker, relationship owner, warmest path to introduction.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS decision_maker        text,
  ADD COLUMN IF NOT EXISTS decision_maker_role   text,
  ADD COLUMN IF NOT EXISTS decision_maker_email  text,
  ADD COLUMN IF NOT EXISTS decision_maker_phone  text,
  ADD COLUMN IF NOT EXISTS relationship_owner    uuid,
  ADD COLUMN IF NOT EXISTS warm_path             text,
  ADD COLUMN IF NOT EXISTS prospect_source       text,
  ADD COLUMN IF NOT EXISTS converted_at          timestamptz,
  ADD COLUMN IF NOT EXISTS lost_at               timestamptz,
  ADD COLUMN IF NOT EXISTS lost_reason           text;

COMMENT ON COLUMN public.clients.relationship_owner IS
  'auth.users id of the person who owns the relationship — the Founder or Sales '
  'Lead in D3 terms. Not FK-constrained, matching the existing created_by convention.';
COMMENT ON COLUMN public.clients.warm_path IS
  'The warmest route to an introduction: who knows the decision-maker, and how.';

-- 3 · Indexes ----------------------------------------------------------------
-- Prospect lists are always workspace-scoped and lifecycle-filtered.

CREATE INDEX IF NOT EXISTS clients_workspace_lifecycle_idx
  ON public.clients (workspace_id, lifecycle);

-- Partial index for the prospect pipeline view, which is the hot path for the
-- sales surfaces and stays small relative to the client base.
CREATE INDEX IF NOT EXISTS clients_prospects_idx
  ON public.clients (workspace_id, status)
  WHERE lifecycle = 'prospect';

-- 4 · Conversion stamping ----------------------------------------------------
-- Records when a prospect became a client, and when one was lost, without
-- requiring every call site to remember to set the timestamp.

CREATE OR REPLACE FUNCTION public.stamp_client_lifecycle_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.lifecycle IS DISTINCT FROM OLD.lifecycle THEN
    IF NEW.lifecycle = 'client' AND NEW.converted_at IS NULL THEN
      NEW.converted_at := now();
    END IF;
    IF NEW.lifecycle = 'churned' AND NEW.lost_at IS NULL THEN
      NEW.lost_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_client_lifecycle_change ON public.clients;
CREATE TRIGGER stamp_client_lifecycle_change
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_client_lifecycle_change();

-- 5 · Convenience view -------------------------------------------------------
-- Reads inherit the base table's RLS (security_invoker), so this exposes
-- nothing a caller could not already select from public.clients.

CREATE OR REPLACE VIEW public.v_prospects
WITH (security_invoker = true) AS
  SELECT *
  FROM public.clients
  WHERE lifecycle = 'prospect';

COMMENT ON VIEW public.v_prospects IS
  'Pre-sale rows only. Convenience wrapper over public.clients; RLS is enforced '
  'by the base table via security_invoker.';

-- ---------------------------------------------------------------------------
-- C1b — STILL OUTSTANDING (server side)
--
-- The following server-side objects must also exclude lifecycle <> 'client'
-- before prospects can be created at volume. They are NOT modified here because
-- their current definitions could not be read from this session, and blindly
-- replacing a function body risks losing logic:
--
--   • compute_client_status()            • auto_classify_new_clients()
--   • recompute_all_client_statuses()    • rollup_client_kpis_for_workspace()
--   • detect_client_anomalies()          • purge_inactive_client_signals()
--   • forecast_client_eom()              • client_red_kpis()
--   • views v_portfolio_snapshot, v_client_kpi_snapshot
--   • crons: recompute-statuses-nightly, client-alerts-scan,
--     churn-risk-detect, ad-account-billing-scan, kpi-breach-tasks-cron
--
-- Until C1b lands, the default lifecycle of 'client' keeps every one of these
-- behaving exactly as it does today; the exposure is only that a newly created
-- prospect would be picked up by them. The application layer already filters
-- the user-facing surfaces (see src/hooks/useDatabase.ts).
-- ---------------------------------------------------------------------------
