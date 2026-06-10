DELETE FROM public.account_match_suggestions s
WHERE s.source = 'meta'
  AND NOT EXISTS (SELECT 1 FROM public.meta_ad_accounts m WHERE m.id::text = s.source_ref);

DELETE FROM public.account_match_suggestions s
WHERE s.source = 'ghl'
  AND NOT EXISTS (SELECT 1 FROM public.ghl_locations g WHERE g.location_id = s.source_ref);