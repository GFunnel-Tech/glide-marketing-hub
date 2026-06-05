
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS last_alert_status text,
  ADD COLUMN IF NOT EXISTS last_alert_at timestamptz;

ALTER TABLE public.stripe_charges
  ADD COLUMN IF NOT EXISTS alert_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.client_red_kpis(_client_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cfg jsonb; _kpis jsonb; _client RECORD;
  _key text; _spec jsonb; _value numeric; _direction text;
  _green numeric; _yellow numeric;
  _green_min numeric; _green_max numeric; _yellow_min numeric; _yellow_max numeric;
  _is_red boolean;
  _out jsonb := '[]'::jsonb;
  _credit_total int; _credit_above int;
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
      IF COALESCE(_credit_total,0) = 0 THEN CONTINUE; END IF;
      _value := (_credit_above::numeric / _credit_total::numeric) * 100;
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
$$;
