
-- 1) Bump cron schedules to every 10 minutes
SELECT cron.unschedule('meta-leads-sync-hourly');
SELECT cron.unschedule('meta-sync-hourly');

SELECT cron.schedule(
  'meta-leads-sync-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kkuvdoejqruszisyojap.supabase.co/functions/v1/meta-leads-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'meta-sync-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kkuvdoejqruszisyojap.supabase.co/functions/v1/meta-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- 2) Backfill orphan client_id on meta_leads using ad_account → client mapping
UPDATE public.meta_leads ml
SET client_id = maa.client_id
FROM public.meta_ad_accounts maa
WHERE ml.ad_account_id = maa.id
  AND ml.client_id IS NULL
  AND maa.client_id IS NOT NULL;
