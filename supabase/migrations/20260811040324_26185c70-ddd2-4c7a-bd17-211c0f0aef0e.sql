CREATE OR REPLACE FUNCTION public.compute_client_status(_client_id integer)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _cfg jsonb; _kpis jsonb; _client RECORD;
  _key text; _spec jsonb; _value numeric; _weight numeric; _direction text;
  _green numeric; _yellow numeric;
  _green_min numeric; _green_max numeric; _yellow_min numeric; _yellow_max numeric;
  _pts numeric; _total_score numeric := 0; _total_weight numeric := 0;
  _final_pct numeric; _g numeric; _y numeric;
  _credit_total int; _credit_above int;
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
    ELSIF _key = 'credit_above_640' THEN
      SELECT count(*) FILTER (WHERE public.lead_credit_scored(ml.field_data)),
             count(*) FILTER (WHERE public.lead_credit_answer(ml.field_data))
        INTO _credit_total, _credit_above
        FROM public.meta_leads ml
       WHERE ml.client_id = _client_id
         AND ml.created_time >= now() - interval '30 days';
      IF COALESCE(_credit_total, 0) = 0 THEN CONTINUE; END IF;
      _value := (_credit_above::numeric / _credit_total::numeric) * 100;
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
$fn$;