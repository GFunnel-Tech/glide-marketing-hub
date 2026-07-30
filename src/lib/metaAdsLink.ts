/** Build Meta Ads Manager deep links for an account / campaign / adset / ad. */
export function metaAdsManagerUrl(opts: {
  adAccountId?: string | null;
  campaignId?: string | null;
  adsetId?: string | null;
  adId?: string | null;
}): string | null {
  const act = (opts.adAccountId ?? "").replace(/^act_/, "");
  if (!act) return null;

  let level = "campaigns";
  const params = new URLSearchParams({ act });
  if (opts.adId) {
    level = "ads";
    params.set("selected_ad_ids", opts.adId);
  } else if (opts.adsetId) {
    level = "adsets";
    params.set("selected_adset_ids", opts.adsetId);
  } else if (opts.campaignId) {
    params.set("selected_campaign_ids", opts.campaignId);
  }

  return `https://adsmanager.facebook.com/adsmanager/manage/${level}?${params.toString()}`;
}

export function openMetaAdsManager(opts: Parameters<typeof metaAdsManagerUrl>[0]) {
  const url = metaAdsManagerUrl(opts);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}
