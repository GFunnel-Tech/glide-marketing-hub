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
  _credit_total int; _credit_above int;
  _has_learning_campaign boolean := false;
BEGIN
  SELECT * INTO _client FROM public.clients WHERE id = _client_id;

  IF _client.status::text IN (
    'BLOCKED','CANCELLED','PENDING_CANCELLATION','PAUSED',
    'PENDING_APPROVAL','NEW','LAUNCHING','RELAUNCH','SETUP_COMPLETE'
  ) THEN
    RETURN _client.status::text;
  END IF;

  IF _client.launched_at IS NOT NULL AND _client.launched_at > (now() - interval '7 days') THEN
    RETURN 'LEARNING';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.campaigns ca
    WHERE ca.client_id = _client_id
      AND lower(ca.status::text) = 'active'
      AND ca.created_at > (now() - interval '7 days')
  ) OR EXISTS (
    SELECT 1
    FROM public.meta_ads ma
    WHERE ma.client_id = _client_id
      AND ma.effective_status IN ('IN_PROCESS','PENDING_REVIEW','LEARNING','CAMPAIGN_PAUSED_LEARNING')
  ) INTO _has_learning_campaign;

  IF _has_learning_campaign THEN
    RETURN 'LEARNING';
  END IF;

  _cfg := public.resolve_client_kpi_config(_client_id);
  _kpis := _cfg->'kpis';
  _g := (_cfg->>'green_score_min')::numeric;
  _y := (_cfg->>'yellow_score_min')::numeric;

  IF _kpis IS NULL OR jsonb_typeof(_kpis) <> 'object' OR _kpis = '{}'::jsonb THEN
    RETURN _client.status::text;
  END IF;

  FOR _key, _spec IN SELECT * FROM jsonb_each(_kpis) LOOP
    IF _spec IS NULL OR jsonb_typeof(_spec) <> 'object' THEN CONTINUE; END IF;
    _weight := COALESCE((_spec->>'weight')::numeric, 0);
    IF _weight <= 0 THEN CONTINUE; END IF;
    _direction := COALESCE(_spec->>'direction', 'lower');

    IF _key = 'cpl' THEN _value := _client.cpl;
    ELSIF _key = 'cpm' THEN _value := _client.cpm;
    ELSIF _key = 'frequency' THEN _value := _client.frequency;
    ELSIF _key = 'leads' THEN _value := _client.leads;
    ELSIF _key = 'lead_quality' THEN
      SELECT
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements(ml.field_data) f
          WHERE lower(f->>'name') LIKE '%credit_score%'
            AND lower(f->'values'->>0) LIKE 'above%'
        )),
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements(ml.field_data) f
          WHERE lower(f->>'name') LIKE '%credit_score%'
        ))
      INTO _credit_above, _credit_total
      FROM public.meta_leads ml
      WHERE ml.client_id = _client_id
        AND ml.created_time >= now() - interval '30 days';

      IF _credit_total IS NULL OR _credit_total = 0 THEN CONTINUE; END IF;
      _value := (_credit_above::numeric / _credit_total::numeric) * 100;
    ELSE
      CONTINUE;
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

  IF _total_weight = 0 THEN RETURN _client.status::text; END IF;

  _final_pct := (_total_score / _total_weight) * 100;
  IF _final_pct >= COALESCE(_g, 80) THEN RETURN 'GREEN';
  ELSIF _final_pct >= COALESCE(_y, 50) THEN RETURN 'YELLOW';
  ELSE RETURN 'RED';
  END IF;
END;
$function$;