// Shared types for the ad builder
export type Objective = "leads" | "website" | "awareness" | "messages";
export type SpecialAdCategory = "housing" | "credit" | "employment" | null;
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

export interface AdBuilderState {
  // Meta
  objective: Objective;
  specialAdCategory: SpecialAdCategory;
  countries: string[];
  channel: "meta";
  clientId: number | null;

  // Mode
  mode: BuilderMode;

  // Generate
  genPrompt: string;
  genCreativeType: "ai_images" | "use_own";

  // Creative
  creativeType: CreativeType;
  media: MediaAsset[];
  primaryTexts: string[];
  headlines: string[];
  description: string;
  cta: CTA;
  displayLink: string;
  websiteUrl: string;

  // Creative Bank
  bankImages: MediaAsset[];
  bankVideos: MediaAsset[];
  bankCopy: string[];

  // Lead Form (when objective=leads)
  leadForm: LeadFormDraft;

  // Targeting
  interests: InterestTarget[];
  ageMin: number;
  ageMax: number;
  genders: ("male" | "female" | "all")[];
  placements: "advantage_plus" | "manual";

  // Budget
  budgetType: BudgetType;
  budgetAmount: number;
  currency: string;

  // Optional
  optimizeForMe: boolean;
  updateProductGroup: boolean;
  savePrompt: boolean;
  saveAsTemplate: boolean;
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
}

export const DEFAULT_UTM =
  "utm_source=fb_ad&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}";

export function makeInitialState(
  objective: Objective,
  specialAdCategory: SpecialAdCategory = null,
  countries: string[] = ["US"],
): AdBuilderState {
  return {
    objective,
    specialAdCategory,
    countries,
    channel: "meta",
    clientId: null,
    mode: "manual",
    genPrompt: "",
    genCreativeType: "ai_images",
    creativeType: "dynamic",
    media: [],
    primaryTexts: [""],
    headlines: [],
    description: "",
    cta: objective === "leads" ? "APPLY_NOW" : "LEARN_MORE",
    displayLink: "",
    websiteUrl: "",
    bankImages: [],
    bankVideos: [],
    bankCopy: [],
    leadForm: { mode: "new", name: "Lead Form", questions: [
      { id: "q1", type: "FULL_NAME", label: "Full name" },
      { id: "q2", type: "EMAIL", label: "Email" },
      { id: "q3", type: "PHONE", label: "Phone number" },
    ]},
    interests: [],
    ageMin: 18,
    ageMax: 65,
    genders: ["all"],
    placements: "advantage_plus",
    budgetType: "daily",
    budgetAmount: 50,
    currency: "USD",
    optimizeForMe: true,
    updateProductGroup: true,
    savePrompt: true,
    saveAsTemplate: false,
    campaignName: "",
    utmParameters: DEFAULT_UTM,
    pageId: null,
    pageName: null,
    pageAvatar: null,
    igAccountId: null,
    igUsername: null,
    adAccountId: null,
    adAccountName: null,
  };
}
