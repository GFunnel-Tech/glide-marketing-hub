export type AdChannel = "meta" | "google" | "tiktok" | "linkedin";

export const CHANNEL_LABELS: Record<AdChannel, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

export interface DuplicateInput {
  workspaceId: string;
  adId: string;
  newName?: string;
  status?: "PAUSED" | "ACTIVE";
  targetAdsetId?: string;
}
export interface SetStatusInput {
  workspaceId: string;
  adIds: string[];
  status: "PAUSED" | "ACTIVE";
}
export interface UpdateBudgetInput {
  workspaceId: string;
  adsetId: string;
  percent?: number;
  dailyBudget?: number;
  lifetimeBudget?: number;
}
export interface UpdateCreativeInput {
  workspaceId: string;
  adId: string;
  title?: string;
  body?: string;
  callToActionType?: string;
  linkUrl?: string;
}

export interface ChannelAdapter {
  channel: AdChannel;
  supports: { duplicate: boolean; setStatus: boolean; updateBudget: boolean; updateCreative: boolean; create: boolean };
  duplicateAd(input: DuplicateInput): Promise<{ newAdId: string }>;
  setStatus(input: SetStatusInput): Promise<{ results: { adId: string; ok: boolean; error?: string }[] }>;
  updateBudget(input: UpdateBudgetInput): Promise<void>;
  updateCreative(input: UpdateCreativeInput): Promise<{ newCreativeId: string }>;
}
