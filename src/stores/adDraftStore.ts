import { create } from "zustand";
import {
  AdBuilderState, makeInitialState, makeAd, makeAdSet,
  Objective, SpecialAdCategory, AD_LEVEL_KEYS, ADSET_LEVEL_KEYS,
  AdSnapshot, AdSetSnapshot, CampaignSnapshot,
  makeCampaign, cloneCampaign, cloneAdSet, cloneAd,
} from "@/components/ads/builder/types";

const AD_KEY_SET = new Set<string>(AD_LEVEL_KEYS as readonly string[]);
const SET_KEY_SET = new Set<string>(ADSET_LEVEL_KEYS as readonly string[]);

// Mirror live state changes back into the matching snapshot in adSets
function mirrorToSnapshots(state: AdBuilderState, changedKeys: string[]): AdBuilderState {
  let adSets = state.adSets;
  const adChanged = changedKeys.some((k) => AD_KEY_SET.has(k));
  const setChanged = changedKeys.some((k) => SET_KEY_SET.has(k));
  if (!adChanged && !setChanged) return state;

  adSets = adSets.map((s) => {
    if (s.id !== state.selectedAdSetId) return s;
    let next = s;
    if (setChanged) {
      next = {
        ...next,
        interests: state.interests,
        customAudiences: state.customAudiences,
        excludedAudiences: state.excludedAudiences,
        ageMin: state.ageMin,
        ageMax: state.ageMax,
        genders: state.genders,
        placements: state.placements,
        budgetType: state.budgetType,
        budgetAmount: state.budgetAmount,
      };
    }
    if (adChanged) {
      next = {
        ...next,
        ads: next.ads.map((a) => {
          if (a.id !== state.selectedAdId) return a;
          return {
            ...a,
            media: state.media,
            primaryTexts: state.primaryTexts,
            headlines: state.headlines,
            descriptions: state.descriptions,
            caption: state.caption,
            cta: state.cta,
            displayLink: state.displayLink,
            websiteUrl: state.websiteUrl,
          };
        }),
      };
    }
    return next;
  });
  return { ...state, adSets };
}

function hydrateFromSelection(state: AdBuilderState, setId: string, adId: string): AdBuilderState {
  const set = state.adSets.find((s) => s.id === setId) ?? state.adSets[0];
  if (!set) return state;
  const ad = set.ads.find((a) => a.id === adId) ?? set.ads[0];
  if (!ad) return state;
  return {
    ...state,
    selectedAdSetId: set.id,
    selectedAdId: ad.id,
    // ad-level
    media: ad.media,
    primaryTexts: ad.primaryTexts,
    headlines: ad.headlines,
    descriptions: ad.descriptions,
    caption: ad.caption,
    cta: ad.cta,
    displayLink: ad.displayLink,
    websiteUrl: ad.websiteUrl,
    // set-level
    interests: set.interests,
    customAudiences: set.customAudiences ?? [],
    excludedAudiences: set.excludedAudiences ?? [],
    ageMin: set.ageMin,
    ageMax: set.ageMax,
    genders: set.genders,
    placements: set.placements,
    budgetType: set.budgetType,
    budgetAmount: set.budgetAmount,
  };
}

// Write the live ad-set tree back into the selected campaign snapshot
function syncCampaign(state: AdBuilderState): AdBuilderState {
  const campaigns = state.campaigns ?? [];
  if (campaigns.length === 0) return state;
  return {
    ...state,
    campaigns: campaigns.map((c) =>
      c.id === state.selectedCampaignId
        ? {
            ...c,
            objective: state.objective,
            specialAdCategory: state.specialAdCategory,
            adSets: state.adSets,
            selectedAdSetId: state.selectedAdSetId,
            selectedAdId: state.selectedAdId,
          }
        : c,
    ),
  };
}

// Load a campaign snapshot into the live editing surface
function loadCampaign(state: AdBuilderState, campaignId: string): AdBuilderState {
  const synced = syncCampaign(state);
  const target = synced.campaigns.find((c) => c.id === campaignId);
  if (!target) return synced;
  const base: AdBuilderState = {
    ...synced,
    selectedCampaignId: target.id,
    objective: target.objective,
    specialAdCategory: target.specialAdCategory,
    adSets: target.adSets,
    selectedAdSetId: target.selectedAdSetId,
    selectedAdId: target.selectedAdId,
  };
  return hydrateFromSelection(base, target.selectedAdSetId, target.selectedAdId);
}

interface AdDraftStore {
  draftId: string | null;
  state: AdBuilderState;
  dirty: boolean;

  setDraftId: (id: string | null) => void;
  hydrate: (id: string | null, state: AdBuilderState) => void;
  init: (objective: Objective, specialAdCategory: SpecialAdCategory, countries: string[]) => void;
  patch: <K extends keyof AdBuilderState>(key: K, value: AdBuilderState[K]) => void;
  patchMany: (partial: Partial<AdBuilderState>) => void;
  markClean: () => void;
  reset: () => void;
  setDraftName: (name: string) => void;

  // Campaign hierarchy
  selectCampaign: (campaignId: string) => void;
  addCampaign: () => void;
  duplicateCampaign: (campaignId: string) => void;
  renameCampaign: (campaignId: string, name: string) => void;
  deleteCampaign: (campaignId: string) => void;
  duplicateAdSet: (setId: string) => void;
  duplicateAd: (setId: string, adId: string) => void;

  // Ad set hierarchy
  selectAdSet: (setId: string) => void;
  selectAd: (setId: string, adId: string) => void;
  addAdSet: () => void;
  addAd: (setId: string) => void;
  renameAdSet: (setId: string, name: string) => void;
  renameAd: (setId: string, adId: string, name: string) => void;
  deleteAdSet: (setId: string) => void;
  deleteAd: (setId: string, adId: string) => void;
}

export const useAdDraftStore = create<AdDraftStore>((set) => ({
  draftId: null,
  state: makeInitialState("leads"),
  dirty: false,

  setDraftId: (id) => set({ draftId: id }),

  hydrate: (id, s) => {
    // Backfill snapshots if loading an older draft missing adSets
    let next = s;
    if (!next.adSets || next.adSets.length === 0) {
      const seed = makeAdSet("Ad Set 1", next.cta);
      const seedAd = seed.ads[0];
      // copy current creative into seed ad
      seed.ads = [{
        ...seedAd,
        media: next.media ?? [],
        primaryTexts: next.primaryTexts ?? [""],
        headlines: next.headlines ?? [],
        descriptions: (next as any).descriptions ?? [],
        caption: (next as any).caption ?? "",
        cta: next.cta,
        displayLink: next.displayLink ?? "",
        websiteUrl: next.websiteUrl ?? "",
      }];
      seed.interests = next.interests ?? [];
      seed.ageMin = next.ageMin ?? 18;
      seed.ageMax = next.ageMax ?? 65;
      seed.genders = next.genders ?? ["all"];
      seed.placements = next.placements ?? "advantage_plus";
      seed.budgetType = next.budgetType ?? "daily";
      seed.budgetAmount = next.budgetAmount ?? 50;
      next = {
        ...next,
        descriptions: (next as any).descriptions ?? [],
        caption: (next as any).caption ?? "",
        draftName: (next as any).draftName ?? "Untitled Campaign",
        adSets: [seed],
        selectedAdSetId: seed.id,
        selectedAdId: seed.ads[0].id,
      };
    }
    if (!next.campaigns || next.campaigns.length === 0) {
      const cid = crypto.randomUUID();
      next = {
        ...next,
        campaigns: [{
          id: cid,
          name: next.campaignName || next.draftName || "Campaign 1",
          objective: next.objective,
          specialAdCategory: next.specialAdCategory ?? [],
          adSets: next.adSets,
          selectedAdSetId: next.selectedAdSetId,
          selectedAdId: next.selectedAdId,
        }],
        selectedCampaignId: cid,
      };
    } else if (!next.campaigns.some((c) => c.id === next.selectedCampaignId)) {
      next = { ...next, selectedCampaignId: next.campaigns[0].id };
    }
    set({ draftId: id, state: next, dirty: false });
  },

  init: (objective, specialAdCategory, countries) =>
    set({ draftId: null, state: makeInitialState(objective, specialAdCategory, countries), dirty: true }),

  patch: (key, value) =>
    set((s) => {
      const updated = { ...s.state, [key]: value };
      return { state: syncCampaign(mirrorToSnapshots(updated, [key as string])), dirty: true };
    }),

  patchMany: (partial) =>
    set((s) => {
      const updated = { ...s.state, ...partial };
      return { state: syncCampaign(mirrorToSnapshots(updated, Object.keys(partial))), dirty: true };
    }),

  markClean: () => set({ dirty: false }),

  reset: () => set({ draftId: null, state: makeInitialState("leads"), dirty: false }),

  setDraftName: (name) => set((s) => ({ state: { ...s.state, draftName: name }, dirty: true })),

  selectCampaign: (campaignId) =>
    set((s) => ({ state: loadCampaign(s.state, campaignId), dirty: true })),

  addCampaign: () =>
    set((s) => {
      const synced = syncCampaign(s.state);
      const created = makeCampaign(
        `Campaign ${(synced.campaigns?.length ?? 0) + 1}`,
        synced.objective,
        synced.specialAdCategory,
      );
      const withNew = { ...synced, campaigns: [...(synced.campaigns ?? []), created] };
      return { state: loadCampaign(withNew, created.id), dirty: true };
    }),

  duplicateCampaign: (campaignId) =>
    set((s) => {
      const synced = syncCampaign(s.state);
      const source = synced.campaigns.find((c) => c.id === campaignId);
      if (!source) return s;
      const copy = cloneCampaign(source);
      const withNew = { ...synced, campaigns: [...synced.campaigns, copy] };
      return { state: loadCampaign(withNew, copy.id), dirty: true };
    }),

  renameCampaign: (campaignId, name) =>
    set((s) => ({
      state: {
        ...syncCampaign(s.state),
        campaigns: syncCampaign(s.state).campaigns.map((c) => (c.id === campaignId ? { ...c, name } : c)),
      },
      dirty: true,
    })),

  deleteCampaign: (campaignId) =>
    set((s) => {
      const synced = syncCampaign(s.state);
      if ((synced.campaigns?.length ?? 0) <= 1) return s;
      const campaigns = synced.campaigns.filter((c) => c.id !== campaignId);
      const withRemoved = { ...synced, campaigns };
      const nextId = campaignId === synced.selectedCampaignId ? campaigns[0].id : synced.selectedCampaignId;
      return { state: loadCampaign(withRemoved, nextId), dirty: true };
    }),

  duplicateAdSet: (setId) =>
    set((s) => {
      const source = s.state.adSets.find((x) => x.id === setId);
      if (!source) return s;
      const copy = cloneAdSet(source);
      const adSets = [...s.state.adSets, copy];
      const next = hydrateFromSelection({ ...s.state, adSets }, copy.id, copy.ads[0].id);
      return { state: syncCampaign(next), dirty: true };
    }),

  duplicateAd: (setId, adId) =>
    set((s) => {
      const setRef = s.state.adSets.find((x) => x.id === setId);
      const source = setRef?.ads.find((a) => a.id === adId);
      if (!setRef || !source) return s;
      const copy = cloneAd(source);
      const adSets = s.state.adSets.map((x) => (x.id === setId ? { ...x, ads: [...x.ads, copy] } : x));
      const next = hydrateFromSelection({ ...s.state, adSets }, setId, copy.id);
      return { state: syncCampaign(next), dirty: true };
    }),

  selectAdSet: (setId) =>
    set((s) => {
      const target = s.state.adSets.find((x) => x.id === setId);
      if (!target) return s;
      return { state: syncCampaign(hydrateFromSelection(s.state, setId, target.ads[0]?.id ?? s.state.selectedAdId)), dirty: true };
    }),

  selectAd: (setId, adId) =>
    set((s) => ({ state: syncCampaign(hydrateFromSelection(s.state, setId, adId)), dirty: true })),

  addAdSet: () =>
    set((s) => {
      const newSet = makeAdSet(`Ad Set ${s.state.adSets.length + 1}`, s.state.cta);
      const adSets = [...s.state.adSets, newSet];
      const next = hydrateFromSelection({ ...s.state, adSets }, newSet.id, newSet.ads[0].id);
      return { state: syncCampaign(next), dirty: true };
    }),

  addAd: (setId) =>
    set((s) => {
      const newAdName = (() => {
        const set = s.state.adSets.find((x) => x.id === setId);
        return `Ad ${(set?.ads.length ?? 0) + 1}`;
      })();
      const newAd: AdSnapshot = makeAd(newAdName, s.state.cta);
      const adSets = s.state.adSets.map((set) =>
        set.id === setId ? { ...set, ads: [...set.ads, newAd] } : set,
      );
      const next = hydrateFromSelection({ ...s.state, adSets }, setId, newAd.id);
      return { state: syncCampaign(next), dirty: true };
    }),

  renameAdSet: (setId, name) =>
    set((s) => ({
      state: {
        ...s.state,
        adSets: s.state.adSets.map((x) => (x.id === setId ? { ...x, name } : x)),
        campaigns: (s.state.campaigns ?? []).map((c) =>
          c.id === s.state.selectedCampaignId
            ? { ...c, adSets: c.adSets.map((x) => (x.id === setId ? { ...x, name } : x)) }
            : c,
        ),
      },
      dirty: true,
    })),

  renameAd: (setId, adId, name) =>
    set((s) => ({
      state: {
        ...s.state,
        adSets: s.state.adSets.map((set) =>
          set.id === setId
            ? { ...set, ads: set.ads.map((a) => (a.id === adId ? { ...a, name } : a)) }
            : set,
        ),
        campaigns: (s.state.campaigns ?? []).map((c) =>
          c.id === s.state.selectedCampaignId
            ? {
                ...c,
                adSets: c.adSets.map((set) =>
                  set.id === setId
                    ? { ...set, ads: set.ads.map((a) => (a.id === adId ? { ...a, name } : a)) }
                    : set,
                ),
              }
            : c,
        ),
      },
      dirty: true,
    })),

  deleteAdSet: (setId) =>
    set((s) => {
      if (s.state.adSets.length <= 1) return s;
      const adSets = s.state.adSets.filter((x) => x.id !== setId);
      const nextSet = adSets[0];
      const next = hydrateFromSelection({ ...s.state, adSets }, nextSet.id, nextSet.ads[0]?.id ?? "");
      return { state: syncCampaign(next), dirty: true };
    }),

  deleteAd: (setId, adId) =>
    set((s) => {
      const setRef = s.state.adSets.find((x) => x.id === setId);
      if (!setRef || setRef.ads.length <= 1) return s;
      const adSets = s.state.adSets.map((set) =>
        set.id === setId ? { ...set, ads: set.ads.filter((a) => a.id !== adId) } : set,
      );
      const newSet = adSets.find((x) => x.id === setId)!;
      const next = hydrateFromSelection({ ...s.state, adSets }, setId, newSet.ads[0].id);
      return { state: syncCampaign(next), dirty: true };
    }),
}));
