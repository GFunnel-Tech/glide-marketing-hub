// Shared types for the ad builder
export type Objective = "leads" | "website" | "awareness" | "messages";
export type SpecialAdCategoryValue = "housing" | "credit" | "employment";
export type SpecialAdCategory = SpecialAdCategoryValue[];
export type BuilderMode = "generate" | "template" | "manual";
export type CreativeType = "dynamic" | "standard" | "carousel";
export type BudgetType = "daily" | "lifetime";
export type CTA =
  | "LEARN_MORE" | "SIGN_UP" | "GET_QUOTE" | "APPLY_NOW" | "CONTACT_US"
  | "SHOP_NOW" | "DOWNLOAD" | "GET_STARTED" | "BOOK_NOW" | "SUBSCRIBE";

export const CTA_OPTIONS: { value: CTA; label: string }[] = [
  { value: "LEARN_MORE", label: "Learn More" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "GET_QUOTE", label: "Get Quote" },
  { value: "APPLY_NOW", label: "Apply Now" },
  { value: "CONTACT_US", label: "Contact Us" },
  { value: "SHOP_NOW", label: "Shop Now" },
  { value: "DOWNLOAD", label: "Download" },
  { value: "GET_STARTED", label: "Get Started" },
  { value: "BOOK_NOW", label: "Book Now" },
  { value: "SUBSCRIBE", label: "Subscribe" },
];

export interface MediaAsset {
  id: string;
  url: string;
  type: "image" | "video";
  thumbnail?: string;
  name?: string;
}

export interface InterestTarget {
  id: string;
  name: string;
  audience_size?: number;
}

export interface AudienceRef {
  id: string;
  name: string;
}

export interface LeadFormQuestion {
  id: string;
  type: "FULL_NAME" | "EMAIL" | "PHONE" | "CUSTOM" | "MULTIPLE_CHOICE";
  label: string;
  options?: string[];
}

export interface LeadFormDraft {
  mode: "existing" | "new";
  existingFormId?: string;
  existingFormName?: string;
  name?: string;
  intro?: string;
  privacyUrl?: string;
  followUpUrl?: string;
  thankYou?: string;
  questions?: LeadFormQuestion[];
}

// ----- Multi ad-set / multi-ad data model (GHL-style) -----
export interface AdSnapshot {
  id: string;
  name: string;
  media: MediaAsset[];
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  caption: string;
  cta: CTA;
  displayLink: string;
  websiteUrl: string;
}

export interface AdSetSnapshot {
  id: string;
  name: string;
  ads: AdSnapshot[];
  interests: InterestTarget[];
  customAudiences: AudienceRef[];
  excludedAudiences: AudienceRef[];
  ageMin: number;
  ageMax: number;
  genders: ("male" | "female" | "all")[];
  placements: "advantage_plus" | "manual";
  budgetType: BudgetType;
  budgetAmount: number;
}

// Keys that mirror to the selected Ad snapshot
export const AD_LEVEL_KEYS = [
  "media", "primaryTexts", "headlines", "descriptions", "caption",
  "cta", "displayLink", "websiteUrl",
] as const;

// Keys that mirror to the selected Ad Set snapshot
export const ADSET_LEVEL_KEYS = [
  "interests", "customAudiences", "excludedAudiences", "ageMin", "ageMax", "genders", "placements",
  "budgetType", "budgetAmount",
] as const;

export interface AdBuilderState {
  // Meta
  objective: Objective;
  specialAdCategory: SpecialAdCategory;
  countries: string[];
  channel: "meta";
  clientId: number | null;

  // Draft / campaign label
  draftName: string;

  // Mode
  mode: BuilderMode;

  // Generate
  genPrompt: string;
  genCreativeType: "ai_images" | "use_own";

  // Creative (live mirror of selected ad)
  creativeType: CreativeType;
  media: MediaAsset[];
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  caption: string;
  description: string; // legacy single field kept for back-compat
  cta: CTA;
  displayLink: string;
  websiteUrl: string;

  // Creative Bank
  bankImages: MediaAsset[];
  bankVideos: MediaAsset[];
  bankCopy: string[];

  // Lead Form (when objective=leads) — campaign-level
  leadForm: LeadFormDraft;

  // Targeting (live mirror of selected ad set)
  interests: InterestTarget[];
  customAudiences: AudienceRef[];
  excludedAudiences: AudienceRef[];
  ageMin: number;
  ageMax: number;
  genders: ("male" | "female" | "all")[];
  placements: "advantage_plus" | "manual";

  // Budget (live mirror of selected ad set)
  budgetType: BudgetType;
  budgetAmount: number;
  currency: string;

  // Optional
  optimizeForMe: boolean;
  updateProductGroup: boolean;
  savePrompt: boolean;
  saveAsTemplate: boolean;
  activateOnPublish: boolean;
  campaignName: string;
  utmParameters: string;

  // Identity (Page + Instagram + Ad Account)
  pageId: string | null;
  pageName: string | null;
  pageAvatar: string | null;
  igAccountId: string | null;
  igUsername: string | null;
  adAccountId: string | null;
  adAccountName: string | null;

  // Campaign hierarchy
  campaigns: CampaignSnapshot[];
  selectedCampaignId: string;

  // Ad set hierarchy (live mirror of the selected campaign)
  adSets: AdSetSnapshot[];
  selectedAdSetId: string;
  selectedAdId: string;
}

export const DEFAULT_UTM =
  "utm_source=fb_ad&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}";

export function makeAd(name = "Ad 1", cta: CTA = "LEARN_MORE"): AdSnapshot {
  return {
    id: crypto.randomUUID(),
    name,
    media: [],
    primaryTexts: [""],
    headlines: [],
    descriptions: [],
    caption: "",
    cta,
    displayLink: "",
    websiteUrl: "",
  };
}

export function makeAdSet(name = "Ad Set 1", cta: CTA = "LEARN_MORE"): AdSetSnapshot {
  return {
    id: crypto.randomUUID(),
    name,
    ads: [makeAd("Ad 1", cta)],
    interests: [],
    customAudiences: [],
    excludedAudiences: [],
    ageMin: 18,
    ageMax: 65,
    genders: ["all"],
    placements: "advantage_plus",
    budgetType: "daily",
    budgetAmount: 50,
  };
}

export interface CampaignSnapshot {
  id: string;
  name: string;
  objective: Objective;
  specialAdCategory: SpecialAdCategory;
  adSets: AdSetSnapshot[];
  selectedAdSetId: string;
  selectedAdId: string;
}

export function makeCampaign(
  name = "Campaign 1",
  objective: Objective = "leads",
  specialAdCategory: SpecialAdCategory = [],
): CampaignSnapshot {
  const cta: CTA = objective === "leads" ? "APPLY_NOW" : "LEARN_MORE";
  const set = makeAdSet("Ad Set 1", cta);
  return {
    id: crypto.randomUUID(),
    name,
    objective,
    specialAdCategory,
    adSets: [set],
    selectedAdSetId: set.id,
    selectedAdId: set.ads[0].id,
  };
}

export function cloneAd(ad: AdSnapshot, name?: string): AdSnapshot {
  return { ...ad, id: crypto.randomUUID(), name: name ?? `${ad.name} copy` };
}

export function cloneAdSet(set: AdSetSnapshot, name?: string): AdSetSnapshot {
  return {
    ...set,
    id: crypto.randomUUID(),
    name: name ?? `${set.name} copy`,
    ads: set.ads.map((a) => cloneAd(a, a.name)),
  };
}

export function cloneCampaign(c: CampaignSnapshot, name?: string): CampaignSnapshot {
  const adSets = c.adSets.map((s) => cloneAdSet(s, s.name));
  return {
    ...c,
    id: crypto.randomUUID(),
    name: name ?? `${c.name} copy`,
    adSets,
    selectedAdSetId: adSets[0].id,
    selectedAdId: adSets[0].ads[0].id,
  };
}

export function makeInitialState(
  objective: Objective,
  specialAdCategory: SpecialAdCategory = [],
  countries: string[] = ["US"],
): AdBuilderState {
  const cta: CTA = objective === "leads" ? "APPLY_NOW" : "LEARN_MORE";
  const firstSet = makeAdSet("Ad Set 1", cta);
  const firstAd = firstSet.ads[0];
  return {
    objective,
    specialAdCategory,
    countries,
    channel: "meta",
    clientId: null,
    draftName: "Untitled Campaign",
    mode: "manual",
    genPrompt: "",
    genCreativeType: "ai_images",
    creativeType: "dynamic",
    media: firstAd.media,
    primaryTexts: firstAd.primaryTexts,
    headlines: firstAd.headlines,
    descriptions: firstAd.descriptions,
    caption: firstAd.caption,
    description: "",
    cta: firstAd.cta,
    displayLink: firstAd.displayLink,
    websiteUrl: firstAd.websiteUrl,
    bankImages: [],
    bankVideos: [],
    bankCopy: [],
    leadForm: { mode: "new", name: "Lead Form", questions: [
      { id: "q1", type: "FULL_NAME", label: "Full name" },
      { id: "q2", type: "EMAIL", label: "Email" },
      { id: "q3", type: "PHONE", label: "Phone number" },
    ]},
    interests: firstSet.interests,
    customAudiences: firstSet.customAudiences,
    excludedAudiences: firstSet.excludedAudiences,
    ageMin: firstSet.ageMin,
    ageMax: firstSet.ageMax,
    genders: firstSet.genders,
    placements: firstSet.placements,
    budgetType: firstSet.budgetType,
    budgetAmount: firstSet.budgetAmount,
    currency: "USD",
    optimizeForMe: true,
    updateProductGroup: true,
    savePrompt: true,
    saveAsTemplate: false,
    activateOnPublish: false,
    campaignName: "",
    utmParameters: DEFAULT_UTM,
    pageId: null,
    pageName: null,
    pageAvatar: null,
    igAccountId: null,
    igUsername: null,
    adAccountId: null,
    adAccountName: null,
    adSets: [firstSet],
    selectedAdSetId: firstSet.id,
    selectedAdId: firstAd.id,
  };
}
