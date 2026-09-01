-- C2 · Pipeline stage machines
--
-- Two configured sales pipelines on shared machinery: RIVE D3 (Day 0 → 14,
-- consultative) and Glide CTV (productized funnel).
--
-- NOTE ON APPROACH — this differs from docs/scope-of-work.md, which proposed
-- extending `client_status_phases`. That table is keyed by `status_key` against
-- the `client_status` enum (GREEN, LAUNCHING, LEARNING …) and several of its
-- keys are auto-managed by compute_client_status. Those are client *health*
-- states, not sales stages. Overloading it would mean adding fourteen sales
-- stages to a health enum and teaching the health automation to ignore them.
-- Dedicated tables are cheaper and keep both concepts intact. The per-phase
-- webhook idea carries over — it is reproduced here on pipeline_stages.
--
-- Depends on C1 (20260901000000_c1_prospect_account_model.sql).

-- 1 · Pipelines --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pipelines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  key          text NOT NULL,
  name         text NOT NULL,
  description  text,
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);

COMMENT ON TABLE public.pipelines IS
  'Sales pipelines the agency runs. Distinct from client_status_phases, which '
  'tracks client health rather than sale stage.';

-- 2 · Stages -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pipeline_id   uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  key           text NOT NULL,
  label         text NOT NULL,
  description   text,
  -- Where this stage sits in the playbook's own calendar, e.g. "Day 0",
  -- "Days 2–4". Display only; the clock lives on clients.stage_entered_at.
  day_label     text,
  sort_order    integer NOT NULL DEFAULT 0,
  -- Human-readable conditions for leaving this stage. Machine enforcement
  -- arrives with the items that produce the evidence (R1–R4, R7).
  exit_criteria text[] NOT NULL DEFAULT '{}',
  webhook_url   text,
  color         text NOT NULL DEFAULT 'primary',
  is_won        boolean NOT NULL DEFAULT false,
  is_lost       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, key)
);

CREATE INDEX IF NOT EXISTS pipeline_stages_pipeline_order_idx
  ON public.pipeline_stages (pipeline_id, sort_order);

-- 3 · Placing a prospect in a pipeline ---------------------------------------

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS pipeline_id       uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pipeline_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_entered_at  timestamptz;

CREATE INDEX IF NOT EXISTS clients_pipeline_stage_idx
  ON public.clients (pipeline_id, pipeline_stage_id)
  WHERE pipeline_id IS NOT NULL;

COMMENT ON COLUMN public.clients.stage_entered_at IS
  'When the row entered its current stage. Drives days-in-stage, which is how a '
  'fourteen-day playbook is held to its own calendar.';

-- 4 · Stage clock ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stamp_pipeline_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.pipeline_stage_id IS DISTINCT FROM OLD.pipeline_stage_id THEN
    NEW.stage_entered_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_pipeline_stage_change ON public.clients;
CREATE TRIGGER stamp_pipeline_stage_change
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_pipeline_stage_change();

-- updated_at maintenance, reusing the function the rest of the schema uses.
DROP TRIGGER IF EXISTS set_pipelines_updated_at ON public.pipelines;
CREATE TRIGGER set_pipelines_updated_at
  BEFORE UPDATE ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_pipeline_stages_updated_at ON public.pipeline_stages;
CREATE TRIGGER set_pipeline_stages_updated_at
  BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5 · RLS --------------------------------------------------------------------

ALTER TABLE public.pipelines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipelines_select ON public.pipelines;
CREATE POLICY pipelines_select ON public.pipelines
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));

DROP POLICY IF EXISTS pipelines_write ON public.pipelines;
CREATE POLICY pipelines_write ON public.pipelines
  FOR ALL
  USING (public.can_write_workspace(auth.uid(), workspace_id))
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));

DROP POLICY IF EXISTS pipeline_stages_select ON public.pipeline_stages;
CREATE POLICY pipeline_stages_select ON public.pipeline_stages
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));

DROP POLICY IF EXISTS pipeline_stages_write ON public.pipeline_stages;
CREATE POLICY pipeline_stages_write ON public.pipeline_stages
  FOR ALL
  USING (public.can_write_workspace(auth.uid(), workspace_id))
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));

-- 6 · Seed both pipelines ----------------------------------------------------
-- Idempotent: safe to run for a workspace that already has them.

CREATE OR REPLACE FUNCTION public.seed_default_pipelines(_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  d3_id  uuid;
  ctv_id uuid;
BEGIN
  INSERT INTO public.pipelines (workspace_id, key, name, description)
  VALUES (_workspace_id, 'rive_d3', 'RIVE D3 — Divide',
          'Two-week consultative Divide phase. Price is not discussed before the Reveal.')
  ON CONFLICT (workspace_id, key) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO d3_id;

  INSERT INTO public.pipelines (workspace_id, key, name, description)
  VALUES (_workspace_id, 'glide_ctv', 'Glide CTV — Streaming',
          'Productized CTV funnel. Landing page to booked call to checkout.')
  ON CONFLICT (workspace_id, key) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO ctv_id;

  -- RIVE D3, straight from the playbook's own calendar.
  INSERT INTO public.pipeline_stages
    (workspace_id, pipeline_id, key, label, day_label, sort_order, color, is_won, is_lost, exit_criteria)
  VALUES
    (_workspace_id, d3_id, 'target_list',   'Target list',           'Day 0',      10, 'muted',   false, false,
      ARRAY['Decision-maker identified', 'Relationship owner assigned', 'Warmest path to introduction recorded']),
    (_workspace_id, d3_id, 'outreach',      'Outreach',              'Day 0',      20, 'muted',   false, false,
      ARRAY['Personal, relationship-led contact made', 'No packages, deliverables or pricing led with']),
    (_workspace_id, d3_id, 'discovery_set', 'Discovery scheduled',   'Day 0',      30, 'primary', false, false,
      ARRAY['Thirty-minute meeting booked', 'Founder brief prepared']),
    (_workspace_id, d3_id, 'discovery',     'Discovery held',        'Day 1',      40, 'primary', false, false,
      ARRAY['All four discovery areas covered', 'Creative courage score captured', 'Blockers to a five recorded']),
    (_workspace_id, d3_id, 'intelligence',  'Divide intelligence',   'Days 2–4',   50, 'accent',  false, false,
      ARRAY['Competitive, customer, revenue and category templates filled', 'Every run reviewed by a human']),
    (_workspace_id, d3_id, 'strategy',      'Human strategy session','Day 5',      60, 'accent',  false, false,
      ARRAY['Category-winner verdict reached', 'Narrative territory chosen', 'Decision record written']),
    (_workspace_id, d3_id, 'deck',          'Divide Deck build',     'Days 6–8',   70, 'accent',  false, false,
      ARRAY['Every required section present', 'Develop and Disrupt left visibly locked']),
    (_workspace_id, d3_id, 'qa',            'Internal quality review','Day 9',     80, 'warning', false, false,
      ARRAY['Four named approvals recorded', 'Insight is true, specific and strategically useful',
            'Another agency could not have produced this deck', 'Recommendation matches stated risk appetite']),
    (_workspace_id, d3_id, 'reveal',        'Divide Reveal',         'Day 10',     90, 'primary', false, false,
      ARRAY['Point of view presented', 'Not pitched as a services presentation']),
    (_workspace_id, d3_id, 'commitment',    'Commitment',            'Day 10',    100, 'primary', false, false,
      ARRAY['Strategic agreement established before any price discussion']),
    (_workspace_id, d3_id, 'commercial',    'Commercial close',      'Days 11–14',110, 'success', false, false,
      ARRAY['Retainer agreed', 'Production investment estimated', 'MSA and SOW signed', 'Deposit invoiced']),
    (_workspace_id, d3_id, 'won',           'Closed won',            NULL,        120, 'success', true,  false, '{}'),
    (_workspace_id, d3_id, 'lost',          'Closed lost',           NULL,        130, 'destructive', false, true, '{}')
  ON CONFLICT (pipeline_id, key) DO UPDATE
    SET label = EXCLUDED.label,
        day_label = EXCLUDED.day_label,
        sort_order = EXCLUDED.sort_order,
        exit_criteria = EXCLUDED.exit_criteria;

  -- Glide CTV, the productized funnel from the business module.
  INSERT INTO public.pipeline_stages
    (workspace_id, pipeline_id, key, label, day_label, sort_order, color, is_won, is_lost, exit_criteria)
  VALUES
    (_workspace_id, ctv_id, 'lead',        'Lead captured',   NULL, 10, 'muted',   false, false,
      ARRAY['Landing page form submitted', 'UTMs and source recorded']),
    (_workspace_id, ctv_id, 'booked',      'Call booked',     NULL, 20, 'primary', false, false,
      ARRAY['Call on the calendar']),
    (_workspace_id, ctv_id, 'held',        'Call held',       NULL, 30, 'primary', false, false,
      ARRAY['Fit qualified', 'Spend tier indicated']),
    (_workspace_id, ctv_id, 'checkout',    'Checkout sent',   NULL, 40, 'accent',  false, false,
      ARRAY['Tier selected', 'Checkout link issued']),
    (_workspace_id, ctv_id, 'paid',        'Order paid',      NULL, 50, 'success', false, false,
      ARRAY['Setup fee and first month captured', 'Intake form issued']),
    (_workspace_id, ctv_id, 'won',         'Closed won',      NULL, 60, 'success', true,  false, '{}'),
    (_workspace_id, ctv_id, 'lost',        'Closed lost',     NULL, 70, 'destructive', false, true, '{}')
  ON CONFLICT (pipeline_id, key) DO UPDATE
    SET label = EXCLUDED.label,
        sort_order = EXCLUDED.sort_order,
        exit_criteria = EXCLUDED.exit_criteria;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_default_pipelines(uuid) FROM anon;
