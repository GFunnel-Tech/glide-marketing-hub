
-- Shared readers for credit-score answers in Meta lead form field_data.
CREATE OR REPLACE FUNCTION public.lead_credit_answer(_field_data jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  f jsonb; nm text; vl text; n int;
BEGIN
  IF _field_data IS NULL OR jsonb_typeof(_field_data) <> 'array' THEN RETURN NULL; END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(_field_data) LOOP
    nm := lower(regexp_replace(COALESCE(f->>'name',''), '[_-]+', ' ', 'g'));
    IF NOT (nm LIKE '%credit score%' OR (nm LIKE '%credit%' AND nm ~ '\m6[0-9]0\M')) THEN
      CONTINUE;
    END IF;
    vl := btrim(lower(regexp_replace(COALESCE(f->'values'->>0,''), '[_-]+', ' ', 'g')));
    IF vl = '' THEN CONTINUE; END IF;

    IF vl ~ '^(unsure|unknown|not sure|n/a|prefer not)' THEN RETURN false; END IF;
    IF vl ~ '^(above|over|more than)' THEN
      n := NULLIF(regexp_replace(vl, '[^0-9]', '', 'g'), '')::int;
      RETURN COALESCE(n >= 640, true);
    END IF;
    IF vl ~ '^(below|under|less than)' THEN RETURN false; END IF;
    IF vl ~ '^(yes|yep|yeah|y)\M' OR vl = 'true' THEN
      n := NULLIF((regexp_match(nm, '\m(\d{3})\M'))[1], '')::int;
      RETURN COALESCE(n >= 640, true);
    END IF;
    IF vl ~ '^(no|nope|n)\M' OR vl = 'false' THEN RETURN false; END IF;

    n := NULLIF((regexp_match(vl, '(\d{3})'))[1], '')::int;
    IF n IS NOT NULL THEN RETURN n >= 640; END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.lead_credit_scored(_field_data jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$ SELECT public.lead_credit_answer(_field_data) IS NOT NULL $$;

GRANT EXECUTE ON FUNCTION public.lead_credit_answer(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lead_credit_scored(jsonb) TO authenticated, service_role;
