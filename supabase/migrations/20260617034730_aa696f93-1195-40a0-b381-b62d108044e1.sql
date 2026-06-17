WITH src AS (
  SELECT DISTINCT ON (mig.parent_campaign_id)
    mig.parent_campaign_id AS campaign_id,
    mig.ad_account_id
  FROM public.meta_insights_granular_daily mig
  JOIN public.meta_ad_accounts a ON a.id = mig.ad_account_id
  WHERE mig.level = 'campaign'
    AND mig.parent_campaign_id IS NOT NULL
  ORDER BY mig.parent_campaign_id, mig.date DESC
)
UPDATE public.campaigns c
SET ad_account_id = src.ad_account_id
FROM src
WHERE c.id = src.campaign_id
  AND c.ad_account_id IS NULL;
