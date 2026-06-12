
-- Recreate v_client_kpi_snapshot joining the correct meta_ad_accounts table
CREATE OR REPLACE VIEW public.v_client_kpi_snapshot
WITH (security_invoker=on) AS
WITH ins AS (
  SELECT a.client_id,
         a.workspace_id,
         mid.date,
         mid.spend,
         mid.leads,
         mid.impressions,
         mid.clicks,
         mid.cpl,
         mid.cpm,
         mid.ctr,
         mid.frequency
  FROM meta_insights_daily mid
  JOIN meta_ad_accounts a ON a.id = mid.ad_account_id
  WHERE a.client_id IS NOT NULL
), win AS (
  SELECT ins.client_id,
         ins.workspace_id,
         sum(ins.spend) FILTER (WHERE ins.date >= (CURRENT_DATE - INTERVAL '7 days'))  AS spend_7d,
         sum(ins.leads) FILTER (WHERE ins.date >= (CURRENT_DATE - INTERVAL '7 days'))::numeric  AS leads_7d,
         sum(ins.spend) FILTER (WHERE ins.date >= (CURRENT_DATE - INTERVAL '30 days')) AS spend_30d,
         sum(ins.leads) FILTER (WHERE ins.date >= (CURRENT_DATE - INTERVAL '30 days'))::numeric AS leads_30d,
         sum(ins.spend) FILTER (WHERE ins.date >= (CURRENT_DATE - INTERVAL '14 days') AND ins.date < (CURRENT_DATE - INTERVAL '7 days')) AS spend_prev7,
         sum(ins.leads) FILTER (WHERE ins.date >= (CURRENT_DATE - INTERVAL '14 days') AND ins.date < (CURRENT_DATE - INTERVAL '7 days'))::numeric AS leads_prev7,
         avg(ins.cpm)       FILTER (WHERE ins.date >= (CURRENT_DATE - INTERVAL '7 days')) AS cpm_7d,
         avg(ins.ctr)       FILTER (WHERE ins.date >= (CURRENT_DATE - INTERVAL '7 days')) AS ctr_7d,
         avg(ins.frequency) FILTER (WHERE ins.date >= (CURRENT_DATE - INTERVAL '7 days')) AS frequency_7d
  FROM ins
  GROUP BY ins.client_id, ins.workspace_id
)
SELECT c.id AS client_id,
       c.workspace_id,
       c.name,
       c.brand,
       c.status::text AS status,
       c.cpl   AS current_cpl,
       c.leads AS current_leads,
       c.spend AS current_spend,
       COALESCE(w.spend_7d, 0::numeric)  AS spend_7d,
       COALESCE(w.leads_7d, 0::numeric)  AS leads_7d,
       CASE WHEN COALESCE(w.leads_7d, 0) > 0 THEN round(w.spend_7d / w.leads_7d, 2) END AS cpl_7d,
       COALESCE(w.spend_30d, 0::numeric) AS spend_30d,
       COALESCE(w.leads_30d, 0::numeric) AS leads_30d,
       CASE WHEN COALESCE(w.leads_30d, 0) > 0 THEN round(w.spend_30d / w.leads_30d, 2) END AS cpl_30d,
       COALESCE(w.spend_prev7, 0::numeric) AS spend_prev7,
       COALESCE(w.leads_prev7, 0::numeric) AS leads_prev7,
       CASE
         WHEN COALESCE(w.leads_prev7,0) > 0 AND COALESCE(w.leads_7d,0) > 0
         THEN round(
           (w.spend_7d / NULLIF(w.leads_7d,0) - w.spend_prev7 / NULLIF(w.leads_prev7,0))
           / NULLIF(w.spend_prev7 / NULLIF(w.leads_prev7,0), 0) * 100, 1)
       END AS cpl_wow_pct,
       w.cpm_7d,
       w.ctr_7d,
       w.frequency_7d,
       client_red_kpis(c.id) AS red_kpis
FROM clients c
LEFT JOIN win w ON w.client_id = c.id;

GRANT SELECT ON public.v_client_kpi_snapshot TO authenticated, service_role;
GRANT SELECT ON public.v_portfolio_snapshot TO authenticated, service_role;

-- Forecast: same join fix
CREATE OR REPLACE FUNCTION public.forecast_client_eom(_client_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _days_in_month int := EXTRACT(day FROM (date_trunc('month', current_date) + INTERVAL '1 month - 1 day'))::int;
  _day_of_month  int := EXTRACT(day FROM current_date)::int;
  _remaining int := _days_in_month - _day_of_month;
  _avg_spend numeric; _avg_leads numeric;
  _mtd_spend numeric; _mtd_leads numeric;
  _proj_spend numeric; _proj_leads numeric; _proj_cpl numeric;
BEGIN
  SELECT AVG(mid.spend), AVG(mid.leads)
    INTO _avg_spend, _avg_leads
  FROM public.meta_insights_daily mid
  JOIN public.meta_ad_accounts a ON a.id = mid.ad_account_id
  WHERE a.client_id = _client_id
    AND mid.date >= current_date - INTERVAL '14 days';

  SELECT COALESCE(SUM(mid.spend),0), COALESCE(SUM(mid.leads),0)
    INTO _mtd_spend, _mtd_leads
  FROM public.meta_insights_daily mid
  JOIN public.meta_ad_accounts a ON a.id = mid.ad_account_id
  WHERE a.client_id = _client_id
    AND mid.date >= date_trunc('month', current_date);

  _proj_spend := _mtd_spend + COALESCE(_avg_spend,0) * _remaining;
  _proj_leads := _mtd_leads + COALESCE(_avg_leads,0) * _remaining;
  _proj_cpl := CASE WHEN _proj_leads > 0 THEN ROUND(_proj_spend / _proj_leads, 2) END;

  RETURN jsonb_build_object(
    'mtd_spend', ROUND(COALESCE(_mtd_spend,0), 2),
    'mtd_leads', COALESCE(_mtd_leads,0),
    'avg_daily_spend', ROUND(COALESCE(_avg_spend,0), 2),
    'avg_daily_leads', ROUND(COALESCE(_avg_leads,0), 2),
    'days_remaining', _remaining,
    'projected_spend', ROUND(COALESCE(_proj_spend,0), 2),
    'projected_leads', ROUND(COALESCE(_proj_leads,0), 0),
    'projected_cpl', _proj_cpl
  );
END $function$;

-- Anomalies: same join fix
CREATE OR REPLACE FUNCTION public.detect_client_anomalies(_client_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _out jsonb := '[]'::jsonb;
  _metrics text[] := ARRAY['cpl','cpm','ctr','frequency','leads'];
  _m text;
  _recent numeric; _baseline_avg numeric; _baseline_sd numeric; _z numeric;
  _sev text;
BEGIN
  FOREACH _m IN ARRAY _metrics LOOP
    EXECUTE format($q$
      SELECT
        AVG(%1$I) FILTER (WHERE date >= current_date - INTERVAL '3 days'),
        AVG(%1$I) FILTER (WHERE date >= current_date - INTERVAL '17 days' AND date < current_date - INTERVAL '3 days'),
        STDDEV_POP(%1$I) FILTER (WHERE date >= current_date - INTERVAL '17 days' AND date < current_date - INTERVAL '3 days')
      FROM public.meta_insights_daily mid
      JOIN public.meta_ad_accounts a ON a.id = mid.ad_account_id
      WHERE a.client_id = $1
    $q$, _m) INTO _recent, _baseline_avg, _baseline_sd USING _client_id;

    IF _recent IS NULL OR _baseline_avg IS NULL OR COALESCE(_baseline_sd,0) = 0 THEN CONTINUE; END IF;
    _z := (_recent - _baseline_avg) / _baseline_sd;
    IF ABS(_z) < 1.5 THEN CONTINUE; END IF;
    _sev := CASE WHEN ABS(_z) >= 3 THEN 'critical' WHEN ABS(_z) >= 2 THEN 'warn' ELSE 'info' END;
    _out := _out || jsonb_build_object(
      'metric', _m,
      'recent', ROUND(_recent, 2),
      'baseline', ROUND(_baseline_avg, 2),
      'stddev', ROUND(_baseline_sd, 2),
      'z_score', ROUND(_z, 2),
      'direction', CASE WHEN _z > 0 THEN 'up' ELSE 'down' END,
      'severity', _sev
    );
  END LOOP;
  RETURN _out;
END $function$;
