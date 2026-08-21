CREATE OR REPLACE FUNCTION public.rollup_client_kpis_for_workspace(_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Accounts split between multiple clients need per-campaign attribution.
  shared_accounts AS (
    SELECT ad_account_id
    FROM public.meta_ad_account_clients
    GROUP BY ad_account_id
    HAVING COUNT(DISTINCT client_id) > 1
  ),
  -- Single-client accounts: the account-level daily row is the complete truth.
  account_rows AS (
    SELECT
      a.client_id,
      mid.ad_account_id,
      mid.date,
      mid.spend,
      mid.leads,
      mid.clicks,
      mid.impressions,
      mid.frequency
    FROM public.meta_insights_daily mid
    JOIN public.meta_ad_accounts a ON a.id = mid.ad_account_id
    WHERE a.client_id IN (SELECT client_id FROM targets)
      AND mid.date >= _since_date
      AND mid.ad_account_id NOT IN (SELECT ad_account_id FROM shared_accounts)
  ),
  -- Shared accounts: attribute per campaign, falling back to the account's own
  -- client when the campaign is no longer present (deleted/archived in Meta).
  shared_rows AS (
    SELECT
      COALESCE(c.client_id, a.client_id) AS client_id,
      mgd.ad_account_id,
      mgd.date,
      mgd.spend,
      mgd.leads,
      mgd.clicks,
      mgd.impressions,
      COALESCE((mgd.raw->>'frequency')::numeric, 0) AS frequency
    FROM public.meta_insights_granular_daily mgd
    JOIN public.meta_ad_accounts a ON a.id = mgd.ad_account_id
    LEFT JOIN public.campaigns c ON c.id = mgd.object_id
    WHERE mgd.level = 'campaign'
      AND mgd.date >= _since_date
      AND mgd.ad_account_id IN (SELECT ad_account_id FROM shared_accounts)
      AND COALESCE(c.client_id, a.client_id) IN (SELECT client_id FROM targets)
  ),
  combined AS (
    SELECT * FROM account_rows
    UNION ALL
    SELECT * FROM shared_rows
  ),
  spend_agg AS (
    SELECT client_id,
           COALESCE(SUM(spend), 0)::numeric                       AS spend,
           COALESCE(SUM(leads), 0)::int                           AS leads,
           COALESCE(SUM(clicks), 0)::bigint                       AS clicks,
           COALESCE(SUM(impressions), 0)::bigint                  AS impressions,
           COALESCE(SUM(frequency * impressions), 0)::numeric     AS freq_w
    FROM combined
    GROUP BY client_id
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
                          THEN (COALESCE(s.spend, 0) / s.impressions) * 1000
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
$function$;