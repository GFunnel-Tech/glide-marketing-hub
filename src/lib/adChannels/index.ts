import type { AdChannel, ChannelAdapter } from "./types";
import { metaAdapter } from "./meta";
import { makeStubAdapter } from "./stub";

const adapters: Record<AdChannel, ChannelAdapter> = {
  meta: metaAdapter,
  google: makeStubAdapter("google"),
  tiktok: makeStubAdapter("tiktok"),
  linkedin: makeStubAdapter("linkedin"),
};

export function getAdapter(channel: AdChannel): ChannelAdapter {
  return adapters[channel];
}

export type { AdChannel, ChannelAdapter } from "./types";
export { CHANNEL_LABELS } from "./types";
