import { supabase } from "@/integrations/supabase/client";
import type { ChannelAdapter, DuplicateInput, SetStatusInput, UpdateBudgetInput, UpdateCreativeInput } from "./types";

async function invoke<T>(fn: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const metaAdapter: ChannelAdapter = {
  channel: "meta",
  supports: { duplicate: true, setStatus: true, updateBudget: true, updateCreative: true, create: false },
  async duplicateAd(input: DuplicateInput) {
    return await invoke<{ ok: true; newAdId: string }>("meta-ad-duplicate", input);
  },
  async setStatus(input: SetStatusInput) {
    return await invoke<{ results: { adId: string; ok: boolean; error?: string }[] }>("meta-ad-status", input);
  },
  async updateBudget(input: UpdateBudgetInput) {
    await invoke("meta-ad-budget", input);
  },
  async updateCreative(input: UpdateCreativeInput) {
    return await invoke<{ ok: true; newCreativeId: string }>("meta-ad-update", input);
  },
};
