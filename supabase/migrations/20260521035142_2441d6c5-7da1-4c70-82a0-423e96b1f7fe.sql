
-- 1. Add new enum values
ALTER TYPE public.client_status ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE public.client_status ADD VALUE IF NOT EXISTS 'SETUP_COMPLETE';
ALTER TYPE public.client_status ADD VALUE IF NOT EXISTS 'LEARNING';
ALTER TYPE public.client_status ADD VALUE IF NOT EXISTS 'PENDING_CANCELLATION';
ALTER TYPE public.client_status ADD VALUE IF NOT EXISTS 'CANCELLED';

-- 2. launched_at column for Learning auto-window
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS launched_at timestamptz;

-- 3. Phase customization table
CREATE TABLE IF NOT EXISTS public.client_status_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  status_key text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT 'muted',
  webhook_url text,
  auto_managed boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, status_key)
);

ALTER TABLE public.client_status_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view client_status_phases" ON public.client_status_phases
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners/admins insert client_status_phases" ON public.client_status_phases
  FOR INSERT WITH CHECK (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins update client_status_phases" ON public.client_status_phases
  FOR UPDATE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins delete client_status_phases" ON public.client_status_phases
  FOR DELETE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

DROP TRIGGER IF EXISTS update_client_status_phases_updated_at ON public.client_status_phases;
CREATE TRIGGER update_client_status_phases_updated_at
  BEFORE UPDATE ON public.client_status_phases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Default seeding function
CREATE OR REPLACE FUNCTION public.seed_default_status_phases(_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.client_status_phases (workspace_id, status_key, label, sort_order, color, auto_managed) VALUES
    (_workspace_id, 'NEW',                  'New',                  10,  'primary',     false),
    (_workspace_id, 'PENDING_APPROVAL',     'Pending Approval',     20,  'warning',     false),
    (_workspace_id, 'SETUP_COMPLETE',       'Setup Complete',       30,  'success',     true),
    (_workspace_id, 'LAUNCHING',            'Launching',            40,  'purple',      false),
    (_workspace_id, 'LEARNING',             'Learning',             50,  'primary',     true),
    (_workspace_id, 'RELAUNCH',             'Relaunch',             60,  'accent',      false),
    (_workspace_id, 'RED',                  'Red',                  70,  'destructive', true),
    (_workspace_id, 'YELLOW',               'Yellow',               80,  'warning',     true),
    (_workspace_id, 'GREEN',                'Green',                90,  'success',     true),
    (_workspace_id, 'PENDING_CANCELLATION', 'Pending Cancellation', 100, 'warning',     false),
    (_workspace_id, 'CANCELLED',            'Cancelled',            110, 'muted',       false),
    (_workspace_id, 'BLOCKED',              'Blocked',              120, 'muted',       false)
  ON CONFLICT (workspace_id, status_key) DO NOTHING;
END $$;

-- Seed all existing workspaces
DO $$ DECLARE w RECORD; BEGIN
  FOR w IN SELECT id FROM public.workspaces LOOP
    PERFORM public.seed_default_status_phases(w.id);
  END LOOP;
END $$;

-- Auto-seed on new workspaces
CREATE OR REPLACE FUNCTION public.seed_phases_on_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_default_status_phases(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS workspace_seed_phases ON public.workspaces;
CREATE TRIGGER workspace_seed_phases AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.seed_phases_on_workspace();

-- 5. Updated status computation: preserve manual statuses, learning window, then KPIs
CREATE OR REPLACE FUNCTION public.compute_client_status(_client_id integer)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cfg jsonb; _kpis jsonb; _client RECORD;
  _key text; _spec jsonb; _value numeric; _weight numeric; _direction text;
  _green numeric; _yellow numeric;
  _green_min numeric; _green_max numeric; _yellow_min numeric; _yellow_max numeric;
  _pts numeric; _total_score numeric := 0; _total_weight numeric := 0;
  _final_pct numeric; _g numeric; _y numeric;
BEGIN
  SELECT * INTO _client FROM public.clients WHERE id = _client_id;

  IF _client.status::text IN (
    'BLOCKED','CANCELLED','PENDING_CANCELLATION',
    'PENDING_APPROVAL','NEW','LAUNCHING','RELAUNCH','SETUP_COMPLETE'
  ) THEN
    RETURN _client.status::text;
  END IF;

  IF _client.launched_at IS NOT NULL AND _client.launched_at > (now() - interval '7 days') THEN
    RETURN 'LEARNING';
  END IF;

  _cfg := public.resolve_client_kpi_config(_client_id);
  _kpis := _cfg->'kpis';
  _g := (_cfg->>'green_score_min')::numeric;
  _y := (_cfg->>'yellow_score_min')::numeric;

  IF _kpis IS NULL OR _kpis = '{}'::jsonb THEN RETURN _client.status::text; END IF;

  FOR _key, _spec IN SELECT * FROM jsonb_each(_kpis) LOOP
    _weight := COALESCE((_spec->>'weight')::numeric, 0);
    IF _weight <= 0 THEN CONTINUE; END IF;
    _direction := COALESCE(_spec->>'direction', 'lower');
    _value := CASE _key
      WHEN 'cpl' THEN _client.cpl
      WHEN 'cpm' THEN _client.cpm
      WHEN 'form_cvr' THEN _client.form_cvr
      WHEN 'frequency' THEN _client.frequency
      ELSE NULL END;
    IF _value IS NULL THEN CONTINUE; END IF;
    IF _direction = 'lower' THEN
      _green := (_spec->>'green')::numeric; _yellow := (_spec->>'yellow')::numeric;
      _pts := CASE WHEN _value <= _green THEN 2 WHEN _value <= _yellow THEN 1 ELSE 0 END;
    ELSIF _direction = 'higher' THEN
      _green := (_spec->>'green')::numeric; _yellow := (_spec->>'yellow')::numeric;
      _pts := CASE WHEN _value >= _green THEN 2 WHEN _value >= _yellow THEN 1 ELSE 0 END;
    ELSE
      _green_min := (_spec->>'green_min')::numeric; _green_max := (_spec->>'green_max')::numeric;
      _yellow_min := (_spec->>'yellow_min')::numeric; _yellow_max := (_spec->>'yellow_max')::numeric;
      _pts := CASE WHEN _value BETWEEN _green_min AND _green_max THEN 2
                   WHEN _value BETWEEN _yellow_min AND _yellow_max THEN 1 ELSE 0 END;
    END IF;
    _total_score := _total_score + (_pts * _weight);
    _total_weight := _total_weight + (2 * _weight);
  END LOOP;

  IF _total_weight = 0 THEN RETURN _client.status::text; END IF;
  _final_pct := (_total_score / _total_weight) * 100;
  RETURN CASE WHEN _final_pct >= _g THEN 'GREEN' WHEN _final_pct >= _y THEN 'YELLOW' ELSE 'RED' END;
END $$;

-- 6. Status-change webhook dispatcher + launched_at stamping
CREATE OR REPLACE FUNCTION public.dispatch_status_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _url text; _payload jsonb;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Stamp launched_at the first time a client enters LAUNCHING
    IF NEW.status::text = 'LAUNCHING' AND NEW.launched_at IS NULL THEN
      NEW.launched_at := now();
    END IF;

    SELECT webhook_url INTO _url
      FROM public.client_status_phases
      WHERE workspace_id = NEW.workspace_id
        AND status_key = NEW.status::text
        AND enabled = true;

    IF _url IS NOT NULL AND length(_url) > 0 THEN
      _payload := jsonb_build_object(
        'event','client.status_changed',
        'client_id', NEW.id,
        'client_name', NEW.name,
        'brand', NEW.brand,
        'workspace_id', NEW.workspace_id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'timestamp', now()
      );
      PERFORM net.http_post(
        url := _url,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := _payload
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS clients_status_change ON public.clients;
CREATE TRIGGER clients_status_change
  BEFORE UPDATE OF status ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_status_webhook();

-- 7. Auto-set SETUP_COMPLETE from onboarding phase >= 5
CREATE OR REPLACE FUNCTION public.auto_setup_complete_from_onboarding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.phase >= 5 AND (TG_OP = 'INSERT' OR OLD.phase < 5) THEN
    UPDATE public.clients
      SET status = 'SETUP_COMPLETE'::public.client_status,
          updated_at = now()
      WHERE id = NEW.client_id
        AND status::text IN ('NEW','PENDING_APPROVAL');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS onboarding_auto_setup_complete ON public.onboarding;
CREATE TRIGGER onboarding_auto_setup_complete
  AFTER INSERT OR UPDATE OF phase ON public.onboarding
  FOR EACH ROW EXECUTE FUNCTION public.auto_setup_complete_from_onboarding();
