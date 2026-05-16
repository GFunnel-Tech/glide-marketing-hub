
-- Remove broad anon SELECT on client_reports; share-link access will go through an edge function with service role + token check
DROP POLICY IF EXISTS "Public view by share token" ON public.client_reports;

-- Tighten storage: drop my broad SELECT, replace with object-by-name access (public file URLs still work) but no listing
DROP POLICY IF EXISTS "Public read client-reports" ON storage.objects;
-- Public buckets serve files via signed-public URL path /object/public/<bucket>/<path>; that bypasses listing RLS,
-- so we don't need a SELECT policy at all for fetching by URL. Add none.
