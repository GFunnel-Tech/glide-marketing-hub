SELECT cron.schedule(
  'ghl-full-sync-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kkuvdoejqruszisyojap.supabase.co/functions/v1/ghl-full-sync-cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrdXZkb2VqcXJ1c3ppc3lvamFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNDk0NzYsImV4cCI6MjA5MDcyNTQ3Nn0.jTempbX08aDxY7Ak746DKTX1pRGEJw045nkGw2qqlaA"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);