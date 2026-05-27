
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

  -- Guard against null, empty, or non-object kpi configs
  IF _kpis IS NULL OR jsonb_typeof(_kpis) <> 'object' OR _kpis = '{}'::jsonb THEN
    RETURN _client.status::text;
  END IF;

  FOR _key, _spec IN SELECT * FROM jsonb_each(_kpis) LOOP
    IF _spec IS NULL OR jsonb_typeof(_spec) <> 'object' THEN CONTINUE; END IF;
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
  RETURN CASE WHEN _final_pct >= COALESCE(_g, 80) THEN 'GREEN'
              WHEN _final_pct >= COALESCE(_y, 50) THEN 'YELLOW'
              ELSE 'RED' END;
END $function$;
