
CREATE OR REPLACE FUNCTION public.rollup_client_kpis_for_workspace(_workspace_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _since_date date := current_date - 30;
  _since_ts   timestamptz := now() - interval '30 days';
  _count integer := 0;
BEGIN
  WITH targets AS (
    SELECT DISTINCT a.client_id
    FROM public.meta_ad_accounts a
    WHERE a.client_id IS NOT NULL
      AND (_workspace_id IS NULL OR a.workspace_id = _workspace_id)
  ),
  spend_agg AS (
    SELECT a.client_id,
           COALESCE(SUM(mid.spend),0)::numeric                       AS spend,
           COALESCE(SUM(mid.leads),0)::int                           AS leads,
           COALESCE(SUM(mid.clicks),0)::bigint                       AS clicks,
           COALESCE(SUM(mid.impressions),0)::bigint                  AS impressions,
           COALESCE(SUM(mid.cpm * mid.impressions),0)::numeric       AS cpm_w,
           COALESCE(SUM(mid.frequency * mid.impressions),0)::numeric AS freq_w
    FROM public.meta_insights_daily mid
    JOIN public.meta_ad_accounts a ON a.id = mid.ad_account_id
    WHERE a.client_id IN (SELECT client_id FROM targets)
      AND mid.date >= _since_date
    GROUP BY a.client_id
  ),
  leads_agg AS (
    SELECT client_id,
           COUNT(DISTINCT COALESCE(
             NULLIF(LOWER(TRIM(email)), ''),
             NULLIF(regexp_replace(COALESCE(phone,''), '\D+', '', 'g'), ''),
             'lid:' || COALESCE(lead_id::text, '')
           ))::int AS true_leads,
           COUNT(*)::int AS lead_rows
    FROM public.meta_leads
    WHERE client_id IN (SELECT client_id FROM targets)
      AND created_time >= _since_ts
    GROUP BY client_id
  )
  UPDATE public.clients c
  SET
    spend          = COALESCE(s.spend, 0),
    leads          = COALESCE(s.leads, 0),
    reported_leads = COALESCE(s.leads, 0),
    true_leads     = CASE WHEN COALESCE(l.lead_rows, 0) > 0
                          THEN COALESCE(l.true_leads, 0)
                          ELSE COALESCE(s.leads, 0) END,
    cpl            = CASE WHEN COALESCE(s.leads, 0) > 0
                          THEN COALESCE(s.spend, 0) / s.leads
                          ELSE 0 END,
    true_cpl       = CASE
                       WHEN COALESCE(l.lead_rows, 0) > 0 AND COALESCE(l.true_leads, 0) > 0
                         THEN COALESCE(s.spend, 0) / l.true_leads
                       WHEN COALESCE(s.leads, 0) > 0
                         THEN COALESCE(s.spend, 0) / s.leads
                       ELSE 0
                     END,
    cpm            = CASE WHEN COALESCE(s.impressions, 0) > 0
                          THEN COALESCE(s.cpm_w, 0) / s.impressions
                          ELSE 0 END,
    frequency      = CASE WHEN COALESCE(s.impressions, 0) > 0
                          THEN COALESCE(s.freq_w, 0) / s.impressions
                          ELSE 0 END,
    form_cvr       = CASE WHEN COALESCE(s.clicks, 0) > 0
                          THEN (COALESCE(s.leads, 0)::numeric / s.clicks) * 100
                          ELSE 0 END,
    double_count   = COALESCE(l.lead_rows, 0) > 0
                     AND COALESCE(s.leads, 0) > 0
                     AND s.leads::numeric > COALESCE(l.true_leads, 0) * 1.15,
    last_audit     = current_date,
    updated_at     = now()
  FROM targets t
  LEFT JOIN spend_agg s ON s.client_id = t.client_id
  LEFT JOIN leads_agg l ON l.client_id = t.client_id
  WHERE c.id = t.client_id;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rollup_client_kpis_for_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollup_client_kpis_for_workspace(uuid) TO authenticated, service_role;
