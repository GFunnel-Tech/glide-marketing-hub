
-- 1. ai_insights table
CREATE TABLE public.ai_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id integer REFERENCES public.clients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('anomaly','forecast','recommendation','benchmark','summary')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','critical')),
  title text NOT NULL,
  body text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasoning text,
  source text NOT NULL DEFAULT 'ai-ops-scan',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','acted_on')),
  related_action_id uuid REFERENCES public.ai_pending_actions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  dismissed_by uuid
);

CREATE INDEX ai_insights_workspace_status_idx ON public.ai_insights (workspace_id, status, created_at DESC);
CREATE INDEX ai_insights_client_idx ON public.ai_insights (client_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_insights TO authenticated;
GRANT ALL ON public.ai_insights TO service_role;

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read workspace insights"
  ON public.ai_insights FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can update workspace insights"
  ON public.ai_insights FOR UPDATE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Admins can insert insights"
  ON public.ai_insights FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(auth.uid(), workspace_id));

CREATE POLICY "Admins can delete insights"
  ON public.ai_insights FOR DELETE TO authenticated
  USING (public.can_write_workspace(auth.uid(), workspace_id));

-- 2. Per-client KPI snapshot view (last 7d and 30d windows from meta_insights_daily via ad_accounts)
CREATE OR REPLACE VIEW public.v_client_kpi_snapshot AS
WITH ins AS (
  SELECT a.client_id, a.workspace_id, mid.date, mid.spend, mid.leads, mid.impressions, mid.clicks, mid.cpl, mid.cpm, mid.ctr, mid.frequency
  FROM public.meta_insights_daily mid
  JOIN public.ad_accounts a ON a.id = mid.ad_account_id
  WHERE a.client_id IS NOT NULL
), win AS (
  SELECT client_id, workspace_id,
    SUM(spend) FILTER (WHERE date >= (current_date - INTERVAL '7 days'))::numeric AS spend_7d,
    SUM(leads) FILTER (WHERE date >= (current_date - INTERVAL '7 days'))::numeric AS leads_7d,
    SUM(spend) FILTER (WHERE date >= (current_date - INTERVAL '30 days'))::numeric AS spend_30d,
    SUM(leads) FILTER (WHERE date >= (current_date - INTERVAL '30 days'))::numeric AS leads_30d,
    SUM(spend) FILTER (WHERE date >= (current_date - INTERVAL '14 days') AND date < (current_date - INTERVAL '7 days'))::numeric AS spend_prev7,
    SUM(leads) FILTER (WHERE date >= (current_date - INTERVAL '14 days') AND date < (current_date - INTERVAL '7 days'))::numeric AS leads_prev7,
    AVG(cpm) FILTER (WHERE date >= (current_date - INTERVAL '7 days'))::numeric AS cpm_7d,
    AVG(ctr) FILTER (WHERE date >= (current_date - INTERVAL '7 days'))::numeric AS ctr_7d,
    AVG(frequency) FILTER (WHERE date >= (current_date - INTERVAL '7 days'))::numeric AS frequency_7d
  FROM ins GROUP BY client_id, workspace_id
)
SELECT
  c.id AS client_id, c.workspace_id, c.name, c.brand, c.status::text AS status,
  c.cpl AS current_cpl, c.leads AS current_leads, c.spend AS current_spend,
  COALESCE(w.spend_7d, 0) AS spend_7d,
  COALESCE(w.leads_7d, 0) AS leads_7d,
  CASE WHEN COALESCE(w.leads_7d,0) > 0 THEN ROUND(w.spend_7d / w.leads_7d, 2) END AS cpl_7d,
  COALESCE(w.spend_30d, 0) AS spend_30d,
  COALESCE(w.leads_30d, 0) AS leads_30d,
  CASE WHEN COALESCE(w.leads_30d,0) > 0 THEN ROUND(w.spend_30d / w.leads_30d, 2) END AS cpl_30d,
  COALESCE(w.spend_prev7, 0) AS spend_prev7,
  COALESCE(w.leads_prev7, 0) AS leads_prev7,
  CASE WHEN COALESCE(w.leads_prev7,0) > 0 AND COALESCE(w.leads_7d,0) > 0
       THEN ROUND(((w.spend_7d / NULLIF(w.leads_7d,0)) - (w.spend_prev7 / NULLIF(w.leads_prev7,0))) / NULLIF(w.spend_prev7 / NULLIF(w.leads_prev7,0), 0) * 100, 1) END AS cpl_wow_pct,
  w.cpm_7d, w.ctr_7d, w.frequency_7d,
  public.client_red_kpis(c.id) AS red_kpis
FROM public.clients c
LEFT JOIN win w ON w.client_id = c.id;

GRANT SELECT ON public.v_client_kpi_snapshot TO authenticated, service_role;

-- 3. Workspace portfolio rollup
CREATE OR REPLACE VIEW public.v_portfolio_snapshot AS
SELECT
  workspace_id,
  COUNT(*) AS total_clients,
  COUNT(*) FILTER (WHERE status = 'RED') AS red_clients,
  COUNT(*) FILTER (WHERE status = 'YELLOW') AS yellow_clients,
  COUNT(*) FILTER (WHERE status = 'GREEN') AS green_clients,
  SUM(spend_30d) AS spend_30d,
  SUM(leads_30d) AS leads_30d,
  CASE WHEN SUM(leads_30d) > 0 THEN ROUND(SUM(spend_30d)/SUM(leads_30d), 2) END AS portfolio_cpl_30d,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY cpl_30d) AS median_cpl_30d,
  percentile_cont(0.9) WITHIN GROUP (ORDER BY cpl_30d) AS p90_cpl_30d
FROM public.v_client_kpi_snapshot
GROUP BY workspace_id;

GRANT SELECT ON public.v_portfolio_snapshot TO authenticated, service_role;

-- 4. End-of-month forecast (linear extrapolation on last 14 days)
CREATE OR REPLACE FUNCTION public.forecast_client_eom(_client_id integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _days_in_month int := EXTRACT(day FROM (date_trunc('month', current_date) + INTERVAL '1 month - 1 day'))::int;
  _day_of_month int := EXTRACT(day FROM current_date)::int;
  _remaining int := _days_in_month - _day_of_month;
  _avg_spend numeric; _avg_leads numeric;
  _mtd_spend numeric; _mtd_leads numeric;
  _proj_spend numeric; _proj_leads numeric; _proj_cpl numeric;
BEGIN
  SELECT AVG(mid.spend), AVG(mid.leads)
    INTO _avg_spend, _avg_leads
  FROM public.meta_insights_daily mid
  JOIN public.ad_accounts a ON a.id = mid.ad_account_id
  WHERE a.client_id = _client_id
    AND mid.date >= current_date - INTERVAL '14 days';

  SELECT COALESCE(SUM(mid.spend),0), COALESCE(SUM(mid.leads),0)
    INTO _mtd_spend, _mtd_leads
  FROM public.meta_insights_daily mid
  JOIN public.ad_accounts a ON a.id = mid.ad_account_id
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
END $$;

GRANT EXECUTE ON FUNCTION public.forecast_client_eom(integer) TO authenticated, service_role;

-- 5. Anomaly detection (z-score on 14d baseline excluding last 3d)
CREATE OR REPLACE FUNCTION public.detect_client_anomalies(_client_id integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _r RECORD;
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
      JOIN public.ad_accounts a ON a.id = mid.ad_account_id
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
END $$;

GRANT EXECUTE ON FUNCTION public.detect_client_anomalies(integer) TO authenticated, service_role;

CREATE TRIGGER update_ai_insights_updated_at
  BEFORE UPDATE ON public.ai_insights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
