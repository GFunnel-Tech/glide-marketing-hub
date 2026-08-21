import {
  makeInitialState, makeAd, makeAdSet,
  type AdBuilderState, type CTA, type Objective, type SpecialAdCategory,
} from "@/components/ads/builder/types";

export interface PlanAd {
  name: string;
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  cta: string;
  imagePrompt: string;
  imageUrl: string | null;
  approved?: boolean;
}

export interface PlanAdSet {
  name: string;
  rationale: string;
  interests: string[];
  ageMin: number;
  ageMax: number;
  genders: "all" | "male" | "female";
  budgetType: "daily" | "lifetime";
  budgetAmount: number;
  ads: PlanAd[];
}

export interface CampaignPlan {
  campaignName: string;
  strategy: string;
  adSets: PlanAdSet[];
}

/** Convert an approved AI plan into a full ad-builder draft state. */
export function planToBuilderState(
  plan: CampaignPlan,
  objective: Objective,
  specialAdCategory: SpecialAdCategory,
  clientId: number | null,
): AdBuilderState {
  const base = makeInitialState(objective, specialAdCategory, ["US"]);

  const adSets = plan.adSets.map((s, i) => {
    const set = makeAdSet(s.name || `Ad Set ${i + 1}`, (s.ads[0]?.cta as CTA) || "LEARN_MORE");
    set.interests = s.interests.map((n) => ({ id: `pending:${n}`, name: n }));
    set.ageMin = s.ageMin;
    set.ageMax = s.ageMax;
    set.genders = [s.genders];
    set.budgetType = s.budgetType === "lifetime" ? "lifetime" : "daily";
    set.budgetAmount = s.budgetAmount;
    set.ads = (s.ads.length ? s.ads : [{} as PlanAd]).map((a, j) => {
      const ad = makeAd(a.name || `Ad ${j + 1}`, (a.cta as CTA) || "LEARN_MORE");
      ad.primaryTexts = a.primaryTexts?.length ? a.primaryTexts : [""];
      ad.headlines = a.headlines ?? [];
      ad.descriptions = a.descriptions ?? [];
      ad.media = a.imageUrl ? [{ id: crypto.randomUUID(), url: a.imageUrl, type: "image" as const }] : [];
      return ad;
    });
    return set;
  });

  const firstSet = adSets[0];
  const firstAd = firstSet.ads[0];

  return {
    ...base,
    clientId,
    campaignName: plan.campaignName,
    draftName: plan.campaignName || base.draftName,
    adSets,
    selectedAdSetId: firstSet.id,
    selectedAdId: firstAd.id,
    // hydrate live mirrors from the first ad / ad set
    media: firstAd.media,
    primaryTexts: firstAd.primaryTexts,
    headlines: firstAd.headlines,
    descriptions: firstAd.descriptions,
    caption: firstAd.caption,
    cta: firstAd.cta,
    displayLink: firstAd.displayLink,
    websiteUrl: firstAd.websiteUrl,
    interests: firstSet.interests,
    ageMin: firstSet.ageMin,
    ageMax: firstSet.ageMax,
    genders: firstSet.genders,
    placements: firstSet.placements,
    budgetType: firstSet.budgetType,
    budgetAmount: firstSet.budgetAmount,
  };
}
