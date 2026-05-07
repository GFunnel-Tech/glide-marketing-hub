-- KPI threshold presets (vertical templates)
CREATE TABLE public.kpi_threshold_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid, -- null = global preset
  name text NOT NULL,
  description text,
  kpis jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kpi_threshold_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View presets (global or own workspace)" ON public.kpi_threshold_presets
  FOR SELECT USING (workspace_id IS NULL OR is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Owners/admins write presets" ON public.kpi_threshold_presets
  FOR INSERT WITH CHECK (workspace_id IS NOT NULL AND workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE POLICY "Owners/admins update presets" ON public.kpi_threshold_presets
  FOR UPDATE USING (workspace_id IS NOT NULL AND workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE POLICY "Owners/admins delete presets" ON public.kpi_threshold_presets
  FOR DELETE USING (workspace_id IS NOT NULL AND workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER trg_kpi_presets_updated BEFORE UPDATE ON public.kpi_threshold_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Workspace KPI settings
CREATE TABLE public.workspace_kpi_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE,
  preset_id uuid REFERENCES public.kpi_threshold_presets(id) ON DELETE SET NULL,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  green_score_min numeric NOT NULL DEFAULT 80,
  yellow_score_min numeric NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_kpi_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view workspace_kpi_settings" ON public.workspace_kpi_settings
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners/admins write workspace_kpi_settings" ON public.workspace_kpi_settings
  FOR INSERT WITH CHECK (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins update workspace_kpi_settings" ON public.workspace_kpi_settings
  FOR UPDATE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins delete workspace_kpi_settings" ON public.workspace_kpi_settings
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER trg_ws_kpi_updated BEFORE UPDATE ON public.workspace_kpi_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-client overrides
CREATE TABLE public.client_kpi_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id integer NOT NULL UNIQUE,
  preset_id uuid REFERENCES public.kpi_threshold_presets(id) ON DELETE SET NULL,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_kpi_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view client_kpi_overrides" ON public.client_kpi_overrides
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners/admins write client_kpi_overrides" ON public.client_kpi_overrides
  FOR INSERT WITH CHECK (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins update client_kpi_overrides" ON public.client_kpi_overrides
  FOR UPDATE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins delete client_kpi_overrides" ON public.client_kpi_overrides
  FOR DELETE USING (workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

CREATE TRIGGER trg_client_kpi_updated BEFORE UPDATE ON public.client_kpi_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Resolve effective KPI config for a client (override > workspace > default)
CREATE OR REPLACE FUNCTION public.resolve_client_kpi_config(_client_id integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ws uuid;
  _ws_preset jsonb := '{}'::jsonb;
  _ws_overrides jsonb := '{}'::jsonb;
  _client_preset jsonb := '{}'::jsonb;
  _client_overrides jsonb := '{}'::jsonb;
  _green numeric := 80;
  _yellow numeric := 50;
  _kpis jsonb;
BEGIN
  SELECT workspace_id INTO _ws FROM public.clients WHERE id = _client_id;

  SELECT COALESCE(p.kpis, '{}'::jsonb), COALESCE(s.overrides, '{}'::jsonb), s.green_score_min, s.yellow_score_min
    INTO _ws_preset, _ws_overrides, _green, _yellow
  FROM public.workspace_kpi_settings s
  LEFT JOIN public.kpi_threshold_presets p ON p.id = s.preset_id
  WHERE s.workspace_id = _ws;

  SELECT COALESCE(p.kpis, '{}'::jsonb), COALESCE(c.overrides, '{}'::jsonb)
    INTO _client_preset, _client_overrides
  FROM public.client_kpi_overrides c
  LEFT JOIN public.kpi_threshold_presets p ON p.id = c.preset_id
  WHERE c.client_id = _client_id;

  -- merge order: ws_preset < ws_overrides < client_preset < client_overrides
  _kpis := _ws_preset || _ws_overrides || _client_preset || _client_overrides;

  RETURN jsonb_build_object(
    'kpis', _kpis,
    'green_score_min', COALESCE(_green, 80),
    'yellow_score_min', COALESCE(_yellow, 50)
  );
END;
$$;

-- Compute status from current client metrics
CREATE OR REPLACE FUNCTION public.compute_client_status(_client_id integer)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cfg jsonb;
  _kpis jsonb;
  _client RECORD;
  _key text;
  _spec jsonb;
  _value numeric;
  _weight numeric;
  _direction text;
  _green numeric;
  _yellow numeric;
  _green_min numeric; _green_max numeric; _yellow_min numeric; _yellow_max numeric;
  _pts numeric;
  _total_score numeric := 0;
  _total_weight numeric := 0;
  _final_pct numeric;
  _g numeric; _y numeric;
BEGIN
  SELECT * INTO _client FROM public.clients WHERE id = _client_id;
  IF _client.status = 'BLOCKED' THEN RETURN 'BLOCKED'; END IF;

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
      WHEN 'spend_pacing' THEN NULL -- placeholder; pacing computed elsewhere
      WHEN 'lead_quality' THEN NULL -- placeholder
      ELSE NULL
    END;

    IF _value IS NULL THEN CONTINUE; END IF;

    IF _direction = 'lower' THEN
      _green := (_spec->>'green')::numeric;
      _yellow := (_spec->>'yellow')::numeric;
      _pts := CASE WHEN _value <= _green THEN 2 WHEN _value <= _yellow THEN 1 ELSE 0 END;
    ELSIF _direction = 'higher' THEN
      _green := (_spec->>'green')::numeric;
      _yellow := (_spec->>'yellow')::numeric;
      _pts := CASE WHEN _value >= _green THEN 2 WHEN _value >= _yellow THEN 1 ELSE 0 END;
    ELSE -- band
      _green_min := (_spec->>'green_min')::numeric;
      _green_max := (_spec->>'green_max')::numeric;
      _yellow_min := (_spec->>'yellow_min')::numeric;
      _yellow_max := (_spec->>'yellow_max')::numeric;
      _pts := CASE
        WHEN _value BETWEEN _green_min AND _green_max THEN 2
        WHEN _value BETWEEN _yellow_min AND _yellow_max THEN 1
        ELSE 0 END;
    END IF;

    _total_score := _total_score + (_pts * _weight);
    _total_weight := _total_weight + (2 * _weight);
  END LOOP;

  IF _total_weight = 0 THEN RETURN _client.status::text; END IF;
  _final_pct := (_total_score / _total_weight) * 100;

  RETURN CASE
    WHEN _final_pct >= _g THEN 'GREEN'
    WHEN _final_pct >= _y THEN 'YELLOW'
    ELSE 'RED'
  END;
END;
$$;

-- Bulk recompute for a workspace
CREATE OR REPLACE FUNCTION public.recompute_all_client_statuses(_workspace_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row RECORD;
  _new text;
  _count integer := 0;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.workspace_role_of(auth.uid(), _workspace_id) IN ('owner','admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR _row IN SELECT id, status FROM public.clients WHERE workspace_id = _workspace_id LOOP
    _new := public.compute_client_status(_row.id);
    IF _new <> _row.status::text THEN
      UPDATE public.clients SET status = _new::client_status, updated_at = now() WHERE id = _row.id;
      _count := _count + 1;
    END IF;
  END LOOP;
  RETURN _count;
END;
$$;

-- Seed global presets
INSERT INTO public.kpi_threshold_presets (workspace_id, name, description, kpis, is_default) VALUES
(NULL, 'Generic', 'Balanced defaults across verticals', '{
  "cpl":          {"weight": 25, "direction": "lower",  "green": 30, "yellow": 60},
  "cpm":          {"weight": 15, "direction": "lower",  "green": 80, "yellow": 120},
  "form_cvr":     {"weight": 20, "direction": "higher", "green": 15, "yellow": 10},
  "frequency":    {"weight": 15, "direction": "lower",  "green": 3,  "yellow": 3.5},
  "spend_pacing": {"weight": 10, "direction": "band",   "green_min": 80, "green_max": 110, "yellow_min": 60, "yellow_max": 130},
  "lead_quality": {"weight": 15, "direction": "higher", "green": 40, "yellow": 25}
}'::jsonb, true),
(NULL, 'Mortgage', 'Tuned for mortgage / lending verticals', '{
  "cpl":          {"weight": 30, "direction": "lower",  "green": 50, "yellow": 90},
  "cpm":          {"weight": 10, "direction": "lower",  "green": 100,"yellow": 150},
  "form_cvr":     {"weight": 20, "direction": "higher", "green": 12, "yellow": 8},
  "frequency":    {"weight": 15, "direction": "lower",  "green": 3,  "yellow": 4},
  "spend_pacing": {"weight": 10, "direction": "band",   "green_min": 80, "green_max": 110, "yellow_min": 60, "yellow_max": 130},
  "lead_quality": {"weight": 15, "direction": "higher", "green": 35, "yellow": 20}
}'::jsonb, false),
(NULL, 'Real Estate', 'Tuned for real estate buyer/seller leads', '{
  "cpl":          {"weight": 25, "direction": "lower",  "green": 25, "yellow": 50},
  "cpm":          {"weight": 15, "direction": "lower",  "green": 70, "yellow": 110},
  "form_cvr":     {"weight": 20, "direction": "higher", "green": 18, "yellow": 12},
  "frequency":    {"weight": 15, "direction": "lower",  "green": 2.5,"yellow": 3.5},
  "spend_pacing": {"weight": 10, "direction": "band",   "green_min": 85, "green_max": 110, "yellow_min": 65, "yellow_max": 130},
  "lead_quality": {"weight": 15, "direction": "higher", "green": 45, "yellow": 30}
}'::jsonb, false);