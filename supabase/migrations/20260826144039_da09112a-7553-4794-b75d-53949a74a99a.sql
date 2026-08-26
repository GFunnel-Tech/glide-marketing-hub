ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS contact_name text;

UPDATE public.clients c
SET contact_name = btrim(concat_ws(' ', btrim(l.raw->>'firstName'), btrim(l.raw->>'lastName')))
FROM public.ghl_locations l
WHERE l.location_id = c.ghl_location_id
  AND (c.contact_name IS NULL OR btrim(c.contact_name) = '')
  AND btrim(concat_ws(' ', btrim(l.raw->>'firstName'), btrim(l.raw->>'lastName'))) <> '';