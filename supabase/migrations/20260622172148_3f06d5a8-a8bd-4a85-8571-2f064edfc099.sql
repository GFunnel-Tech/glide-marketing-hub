
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
           SUM(mid.spend)::numeric                                AS spend,
           SUM(mid.leads)::int                                    AS leads,
           SUM(mid.clicks)::bigint                                AS clicks,
           SUM(mid.impressions)::bigint                           AS impressions,
           SUM(mid.cpm * mid.impressions)::numeric                AS cpm_w,
           SUM(mid.frequency * mid.impressions)::numeric          AS freq_w
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
           )) AS true_leads,
           COUNT(*) AS lead_rows
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
                          THEN l.true_leads
                          ELSE COALESCE(s.leads, 0) END,
    cpl            = CASE WHEN COALESCE(s.leads, 0) > 0
                          THEN s.spend / s.leads
                          ELSE 0 END,
    true_cpl       = CASE
                       WHEN COALESCE(l.lead_rows, 0) > 0 AND l.true_leads > 0
                         THEN s.spend / l.true_leads
                       WHEN COALESCE(s.leads, 0) > 0
                         THEN s.spend / s.leads
                       ELSE 0
                     END,
    cpm            = CASE WHEN COALESCE(s.impressions, 0) > 0
                          THEN s.cpm_w / s.impressions
                          ELSE 0 END,
    frequency      = CASE WHEN COALESCE(s.impressions, 0) > 0
                          THEN s.freq_w / s.impressions
                          ELSE 0 END,
    form_cvr       = CASE WHEN COALESCE(s.clicks, 0) > 0
                          THEN (COALESCE(s.leads, 0)::numeric / s.clicks) * 100
                          ELSE 0 END,
    double_count   = COALESCE(l.lead_rows, 0) > 0
                     AND COALESCE(s.leads, 0) > 0
                     AND s.leads::numeric > l.true_leads * 1.15,
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
