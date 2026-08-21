select cron.unschedule('meta-lead-reconcile-every-minute');
select cron.unschedule('ghl-lead-check-hourly');
select cron.unschedule('meta-leads-sync-30min');
select cron.unschedule('meta-sync-nightly');
select cron.unschedule('recompute-statuses-nightly');

select cron.alter_job(jobid, schedule => '*/5 * * * *') from cron.job where jobname in ('meta-lead-reconcile-1min','meta-leads-sync-1min','fire-due-client-notes');
select cron.alter_job(jobid, schedule => '*/30 * * * *') from cron.job where jobname in ('ai-optimization-cron-every-15m','client-alerts-scan-15min','custom-kpi-evaluate-15min','ghl-lead-check-15min');