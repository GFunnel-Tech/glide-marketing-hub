-- ENUMS
DO $$ BEGIN
  CREATE TYPE public.lead_score_scope AS ENUM ('workspace','client','campaign');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.lead_score_grade AS ENUM ('A','B','C','D');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.lead_outcome AS ENUM ('unknown','closed_won','closed_lost','disqualified');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.lead_source_type AS ENUM ('meta','google','linkedin','manual','ghl');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.calibration_status AS ENUM ('pending','approved','rejected','superseded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. lead_score_rule_sets
CREATE TABLE public.lead_score_rule_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  scope public.lead_score_scope NOT NULL DEFAULT 'workspace',
  scope_id text,               -- null for workspace; client id (as text) or campaign id (uuid as text)
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  name text NOT NULL DEFAULT 'Default rule set',
  weights jsonb NOT NULL DEFAULT '{"completeness":0.15,"validity":0.15,"crm_progression":0.30,"engagement":0.15,"qualifying_answers":0.15,"source":0.10}'::jsonb,
  qualifying_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_modifiers jsonb NOT NULL DEFAULT '{}'::jsonb,
  grade_thresholds jsonb NOT NULL DEFAULT '{"A":85,"B":70,"C":50}'::jsonb,
  auto_tune_enabled boolean NOT NULL DEFAULT false,
  last_tuned_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lsrs_ws_scope ON public.lead_score_rule_sets(workspace_id, scope, scope_id, is_active);
CREATE TRIGGER trg_lsrs_updated BEFORE UPDATE ON public.lead_score_rule_sets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.lead_score_rule_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view rule_sets" ON public.lead_score_rule_sets
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write rule_sets" ON public.lead_score_rule_sets
  FOR INSERT WITH CHECK (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update rule_sets" ON public.lead_score_rule_sets
  FOR UPDATE USING (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Admins delete rule_sets" ON public.lead_score_rule_sets
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

-- 2. lead_scores
CREATE TABLE public.lead_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id integer,
  campaign_id text,
  lead_id text NOT NULL,
  lead_source public.lead_source_type NOT NULL,
  score numeric(5,2) NOT NULL DEFAULT 0,
  grade public.lead_score_grade NOT NULL DEFAULT 'D',
  rule_set_id uuid REFERENCES public.lead_score_rule_sets(id) ON DELETE SET NULL,
  rule_set_version integer,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome public.lead_outcome NOT NULL DEFAULT 'unknown',
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_source, lead_id)
);
CREATE INDEX idx_lscores_ws ON public.lead_scores(workspace_id);
CREATE INDEX idx_lscores_client ON public.lead_scores(client_id);
CREATE INDEX idx_lscores_grade ON public.lead_scores(grade);
CREATE INDEX idx_lscores_outcome ON public.lead_scores(outcome);
CREATE TRIGGER trg_lscores_updated BEFORE UPDATE ON public.lead_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.lead_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view lead_scores" ON public.lead_scores
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write lead_scores" ON public.lead_scores
  FOR INSERT WITH CHECK (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Members update lead_scores" ON public.lead_scores
  FOR UPDATE USING (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Admins delete lead_scores" ON public.lead_scores
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Portal user reads own lead_scores" ON public.lead_scores
  FOR SELECT USING (client_id IS NOT NULL AND is_portal_user_for_client(auth.uid(), client_id));

-- 3. lead_score_events
CREATE TABLE public.lead_score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id integer,
  lead_id text NOT NULL,
  lead_source public.lead_source_type NOT NULL,
  signal_type text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lsevents_lead ON public.lead_score_events(lead_source, lead_id);
CREATE INDEX idx_lsevents_ws ON public.lead_score_events(workspace_id, occurred_at DESC);

ALTER TABLE public.lead_score_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view lead_score_events" ON public.lead_score_events
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members write lead_score_events" ON public.lead_score_events
  FOR INSERT WITH CHECK (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Admins delete lead_score_events" ON public.lead_score_events
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

-- 4. lead_score_calibrations
CREATE TABLE public.lead_score_calibrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  rule_set_id uuid NOT NULL REFERENCES public.lead_score_rule_sets(id) ON DELETE CASCADE,
  proposed_weights jsonb NOT NULL,
  proposed_thresholds jsonb NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.calibration_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lscal_ws_status ON public.lead_score_calibrations(workspace_id, status);
CREATE TRIGGER trg_lscal_updated BEFORE UPDATE ON public.lead_score_calibrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.lead_score_calibrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view calibrations" ON public.lead_score_calibrations
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Service writes calibrations" ON public.lead_score_calibrations
  FOR INSERT WITH CHECK (can_write_workspace(auth.uid(), workspace_id));
CREATE POLICY "Admins update calibrations" ON public.lead_score_calibrations
  FOR UPDATE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Admins delete calibrations" ON public.lead_score_calibrations
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

-- 5. Rule-set resolver: most-specific active rule set wins
CREATE OR REPLACE FUNCTION public.resolve_lead_score_rule_set(
  _workspace_id uuid,
  _client_id integer,
  _campaign_id text
) RETURNS public.lead_score_rule_sets
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.lead_score_rule_sets;
BEGIN
  IF _campaign_id IS NOT NULL THEN
    SELECT * INTO _row FROM public.lead_score_rule_sets
     WHERE workspace_id = _workspace_id AND scope = 'campaign'
       AND scope_id = _campaign_id AND is_active = true
     ORDER BY version DESC LIMIT 1;
    IF FOUND THEN RETURN _row; END IF;
  END IF;
  IF _client_id IS NOT NULL THEN
    SELECT * INTO _row FROM public.lead_score_rule_sets
     WHERE workspace_id = _workspace_id AND scope = 'client'
       AND scope_id = _client_id::text AND is_active = true
     ORDER BY version DESC LIMIT 1;
    IF FOUND THEN RETURN _row; END IF;
  END IF;
  SELECT * INTO _row FROM public.lead_score_rule_sets
   WHERE workspace_id = _workspace_id AND scope = 'workspace'
     AND is_active = true
   ORDER BY version DESC LIMIT 1;
  RETURN _row;
END $$;

-- 6. Auto-seed a default workspace rule set when a workspace is created
CREATE OR REPLACE FUNCTION public.seed_default_lead_score_rule_set()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.lead_score_rule_sets (workspace_id, scope, name, created_by)
  VALUES (NEW.id, 'workspace', 'Default workspace rule set', NEW.created_by)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_seed_lsrs_on_workspace
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_lead_score_rule_set();

-- 7. Backfill default rule set for existing workspaces
INSERT INTO public.lead_score_rule_sets (workspace_id, scope, name, created_by)
SELECT w.id, 'workspace', 'Default workspace rule set', w.created_by
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.lead_score_rule_sets r
  WHERE r.workspace_id = w.id AND r.scope = 'workspace'
);

-- 8. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_score_calibrations;