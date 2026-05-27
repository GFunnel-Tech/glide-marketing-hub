
-- Reconciler every minute
SELECT cron.unschedule('meta-lead-reconcile-1min') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname='meta-lead-reconcile-1min'
);
SELECT cron.schedule(
  'meta-lead-reconcile-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kkuvdoejqruszisyojap.supabase.co/functions/v1/meta-lead-reconcile',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)),
    body := '{}'::jsonb
  );
  $$
);

-- 4h missing checker every 15 minutes
SELECT cron.unschedule('ghl-lead-check-15min') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname='ghl-lead-check-15min'
);
SELECT cron.schedule(
  'ghl-lead-check-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kkuvdoejqruszisyojap.supabase.co/functions/v1/ghl-lead-check',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)),
    body := '{}'::jsonb
  );
  $$
);

-- Requeue failed leads where a GHL location is mapped so the new V2 sync can retry
UPDATE public.meta_leads ml
SET sync_status = 'pending',
    sync_attempts = 0,
    next_check_at = now(),
    last_sync_error = NULL
FROM public.clients c
WHERE ml.client_id = c.id
  AND ml.sync_status = 'failed'
  AND c.ghl_location_id IS NOT NULL;
