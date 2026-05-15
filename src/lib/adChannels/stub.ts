import type { ChannelAdapter } from "./types";

const notSupported = (channel: string) => async () => {
  throw new Error(`${channel} ad management is coming soon. Connect your account first.`);
};

export const makeStubAdapter = (channel: ChannelAdapter["channel"]): ChannelAdapter => ({
  channel,
  supports: { duplicate: false, setStatus: false, updateBudget: false, updateCreative: false, create: false },
  duplicateAd: notSupported(channel) as any,
  setStatus: notSupported(channel) as any,
  updateBudget: notSupported(channel) as any,
  updateCreative: notSupported(channel) as any,
});
