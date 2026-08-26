CREATE OR REPLACE FUNCTION public.auto_classify_new_clients(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cfg jsonb; _kpis jsonb; _client RECORD;
  _key text; _spec jsonb; _value numeric; _weight numeric; _direction text;
  _green numeric; _yellow numeric;
  _green_min numeric; _green_max numeric; _yellow_min numeric; _yellow_max numeric;
  _pts numeric; _total_score numeric; _total_weight numeric;
  _final_pct numeric; _g numeric; _y numeric;
  _new_status text;
  _moved int := 0; _skipped int := 0;
  _result jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.workspace_role_of(auth.uid(), _workspace_id) IN ('owner','admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR _client IN
    SELECT * FROM public.clients
    WHERE workspace_id = _workspace_id AND status::text = 'NEW'
  LOOP
    _cfg := public.resolve_client_kpi_config(_client.id);
    _kpis := _cfg->'kpis';
    _g := COALESCE((_cfg->>'green_score_min')::numeric, 80);
    _y := COALESCE((_cfg->>'yellow_score_min')::numeric, 50);

    _total_score := 0; _total_weight := 0;

    IF _kpis IS NOT NULL AND jsonb_typeof(_kpis) = 'object' THEN
      FOR _key, _spec IN SELECT * FROM jsonb_each(_kpis) LOOP
        IF _spec IS NULL OR jsonb_typeof(_spec) <> 'object' THEN CONTINUE; END IF;
        _weight := COALESCE((_spec->>'weight')::numeric, 0);
        IF _weight <= 0 THEN CONTINUE; END IF;
        _direction := COALESCE(_spec->>'direction', 'lower');

        IF _key = 'cpl' THEN _value := _client.cpl;
        ELSIF _key = 'cpm' THEN _value := _client.cpm;
        ELSIF _key = 'frequency' THEN _value := _client.frequency;
        ELSIF _key = 'leads' THEN _value := _client.leads;
        ELSE CONTINUE;
        END IF;

        IF _value IS NULL THEN CONTINUE; END IF;

        IF _direction = 'lower' THEN
          _green := (_spec->>'green')::numeric; _yellow := (_spec->>'yellow')::numeric;
          _pts := CASE WHEN _value <= _green THEN 2 WHEN _value <= _yellow THEN 1 ELSE 0 END;
        ELSIF _direction = 'higher' THEN
          _green := (_spec->>'green')::numeric; _yellow := (_spec->>'yellow')::numeric;
          _pts := CASE WHEN _value >= _green THEN 2 WHEN _value >= _yellow THEN 1 ELSE 0 END;
        ELSIF _direction = 'band' THEN
          _green_min := (_spec->>'green_min')::numeric; _green_max := (_spec->>'green_max')::numeric;
          _yellow_min := (_spec->>'yellow_min')::numeric; _yellow_max := (_spec->>'yellow_max')::numeric;
          _pts := CASE
            WHEN _value BETWEEN _green_min AND _green_max THEN 2
            WHEN _value BETWEEN _yellow_min AND _yellow_max THEN 1
            ELSE 0 END;
        ELSE CONTINUE;
        END IF;

        _total_score := _total_score + (_pts * _weight);
        _total_weight := _total_weight + (2 * _weight);
      END LOOP;
    END IF;

    IF _total_weight = 0 THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    _final_pct := (_total_score / _total_weight) * 100;
    IF _final_pct >= _g THEN _new_status := 'GREEN';
    ELSIF _final_pct >= _y THEN _new_status := 'YELLOW';
    ELSE _new_status := 'RED';
    END IF;

    UPDATE public.clients
      SET status = _new_status::public.client_status, updated_at = now()
      WHERE id = _client.id;
    _moved := _moved + 1;
    _result := _result || jsonb_build_object('id', _client.id, 'name', _client.name, 'status', _new_status);
  END LOOP;

  RETURN jsonb_build_object('moved', _moved, 'skipped', _skipped, 'details', _result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.client_red_kpis(_client_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cfg jsonb; _kpis jsonb; _client RECORD;
  _key text; _spec jsonb; _value numeric; _direction text;
  _green numeric; _yellow numeric;
  _green_min numeric; _green_max numeric; _yellow_min numeric; _yellow_max numeric;
  _is_red boolean;
  _out jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO _client FROM public.clients WHERE id = _client_id;
  _cfg := public.resolve_client_kpi_config(_client_id);
  _kpis := _cfg->'kpis';
  IF _kpis IS NULL OR jsonb_typeof(_kpis) <> 'object' THEN RETURN _out; END IF;

  FOR _key, _spec IN SELECT * FROM jsonb_each(_kpis) LOOP
    IF _spec IS NULL OR jsonb_typeof(_spec) <> 'object' THEN CONTINUE; END IF;
    IF COALESCE((_spec->>'weight')::numeric, 0) <= 0 THEN CONTINUE; END IF;
    _direction := COALESCE(_spec->>'direction', 'lower');

    IF _key = 'cpl' THEN _value := _client.cpl;
    ELSIF _key = 'cpm' THEN _value := _client.cpm;
    ELSIF _key = 'frequency' THEN _value := _client.frequency;
    ELSIF _key = 'leads' THEN _value := _client.leads;
    ELSE CONTINUE;
    END IF;

    IF _value IS NULL THEN CONTINUE; END IF;

    _is_red := false;
    IF _direction = 'lower' THEN
      _yellow := (_spec->>'yellow')::numeric;
      IF _value > _yellow THEN _is_red := true; END IF;
    ELSIF _direction = 'higher' THEN
      _yellow := (_spec->>'yellow')::numeric;
      IF _value < _yellow THEN _is_red := true; END IF;
    ELSE
      _yellow_min := (_spec->>'yellow_min')::numeric;
      _yellow_max := (_spec->>'yellow_max')::numeric;
      IF _value < _yellow_min OR _value > _yellow_max THEN _is_red := true; END IF;
    END IF;

    IF _is_red THEN
      _out := _out || jsonb_build_object(
        'key', _key,
        'value', _value,
        'direction', _direction,
        'spec', _spec
      );
    END IF;
  END LOOP;

  RETURN _out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_client_status(_client_id integer)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cfg jsonb; _kpis jsonb; _client RECORD;
  _key text; _spec jsonb; _value numeric; _weight numeric; _direction text;
  _green numeric; _yellow numeric;
  _green_min numeric; _green_max numeric; _yellow_min numeric; _yellow_max numeric;
  _pts numeric; _total_score numeric := 0; _total_weight numeric := 0;
  _final_pct numeric; _g numeric; _y numeric;
  _has_learning_campaign boolean := false;
  _has_activity boolean := false;
  _has_history boolean := false;
BEGIN
  SELECT * INTO _client FROM public.clients WHERE id = _client_id;

  IF _client.status::text IN (
    'BLOCKED','CANCELLED','PENDING_CANCELLATION','PAUSED',
    'PENDING_APPROVAL','SETUP_COMPLETE'
  ) THEN
    RETURN _client.status::text;
  END IF;

  _has_activity := COALESCE(_client.spend, 0) > 0 OR COALESCE(_client.leads, 0) > 0;

  -- Lifetime footprint: linked ad account or any historical insight rows.
  SELECT EXISTS (
    SELECT 1 FROM public.meta_ad_accounts m WHERE m.client_id = _client_id
  ) INTO _has_history;

  -- NEW is a time-boxed onboarding state: it only lasts 10 days from creation.
  IF _client.status::text = 'NEW' THEN
    IF _has_activity THEN
      NULL; -- fall through and grade it
    ELSIF COALESCE(_client.created_at, now()) > (now() - interval '10 days') THEN
      RETURN 'NEW';
    ELSIF _has_history THEN
      RETURN 'NEW'; -- linked account / real history: never auto-pause on stale rollups
    ELSE
      RETURN 'PAUSED'; -- empty shell after onboarding window
    END IF;
  ELSIF _client.status::text IN ('RELAUNCH','LAUNCHING') AND NOT _has_activity THEN
    RETURN _client.status::text;
  END IF;

  IF _client.launched_at IS NOT NULL AND _client.launched_at > (now() - interval '7 days') THEN
    RETURN 'LEARNING';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.campaigns ca
    WHERE ca.client_id = _client_id
      AND lower(ca.status::text) = 'active'
      AND ca.created_at > (now() - interval '7 days')
  ) OR EXISTS (
    SELECT 1 FROM public.meta_ads ma
    WHERE ma.client_id = _client_id
      AND ma.effective_status IN ('IN_PROCESS','PENDING_REVIEW','LEARNING','CAMPAIGN_PAUSED_LEARNING')
  ) INTO _has_learning_campaign;

  IF _has_learning_campaign THEN RETURN 'LEARNING'; END IF;

  _cfg := public.resolve_client_kpi_config(_client_id);
  _kpis := COALESCE(_cfg->'kpis', '{}'::jsonb);

  FOR _key, _spec IN SELECT * FROM jsonb_each(_kpis) LOOP
    _weight := COALESCE((_spec->>'weight')::numeric, 0);
    IF _weight <= 0 THEN CONTINUE; END IF;
    _direction := COALESCE(_spec->>'direction', 'lower_better');

    IF _key = 'cpl' THEN _value := COALESCE(_client.cpl, 0);
    ELSIF _key = 'cpm' THEN _value := COALESCE(_client.cpm, 0);
    ELSIF _key = 'ctr' THEN _value := COALESCE(_client.ctr, 0);
    ELSIF _key = 'frequency' THEN _value := COALESCE(_client.frequency, 0);
    ELSIF _key = 'spend' THEN _value := COALESCE(_client.spend, 0);
    ELSIF _key = 'leads' THEN _value := COALESCE(_client.leads, 0);
    ELSE CONTINUE;
    END IF;

    IF _value IS NULL THEN CONTINUE; END IF;

    _green := (_spec->>'green')::numeric;
    _yellow := (_spec->>'yellow')::numeric;
    IF _green IS NULL OR _yellow IS NULL THEN CONTINUE; END IF;

    IF _direction = 'higher_better' THEN
      IF _value >= _green THEN _pts := 1;
      ELSIF _value >= _yellow THEN _pts := 0.5;
      ELSE _pts := 0; END IF;
    ELSE
      IF _value <= _green THEN _pts := 1;
      ELSIF _value <= _yellow THEN _pts := 0.5;
      ELSE _pts := 0; END IF;
    END IF;

    _total_score := _total_score + (_pts * _weight);
    _total_weight := _total_weight + _weight;
  END LOOP;

  IF _total_weight = 0 THEN
    RETURN COALESCE(_client.status::text, 'NEW');
  END IF;

  _final_pct := (_total_score / _total_weight) * 100;
  _g := COALESCE((_cfg->>'green_min')::numeric, 80);
  _y := COALESCE((_cfg->>'yellow_min')::numeric, 55);

  IF _final_pct >= _g THEN RETURN 'GREEN';
  ELSIF _final_pct >= _y THEN RETURN 'YELLOW';
  ELSE RETURN 'RED'; END IF;
END;
$function$;

DROP FUNCTION IF EXISTS public.lead_credit_answer(jsonb);
DROP FUNCTION IF EXISTS public.lead_credit_scored(jsonb);