DELETE FROM public.ghl_locations gl
WHERE gl.last_synced_at < now() - interval '2 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.ghl_location_id = gl.location_id
  );