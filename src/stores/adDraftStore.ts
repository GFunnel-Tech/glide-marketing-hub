import { create } from "zustand";
import {
  AdBuilderState, makeInitialState, makeAd, makeAdSet,
  Objective, SpecialAdCategory, AD_LEVEL_KEYS, ADSET_LEVEL_KEYS,
  AdSnapshot, AdSetSnapshot,
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
    ageMin: set.ageMin,
    ageMax: set.ageMax,
    genders: set.genders,
    placements: set.placements,
    budgetType: set.budgetType,
    budgetAmount: set.budgetAmount,
  };
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
    set({ draftId: id, state: next, dirty: false });
  },

  init: (objective, specialAdCategory, countries) =>
    set({ draftId: null, state: makeInitialState(objective, specialAdCategory, countries), dirty: true }),

  patch: (key, value) =>
    set((s) => {
      const updated = { ...s.state, [key]: value };
      return { state: mirrorToSnapshots(updated, [key as string]), dirty: true };
    }),

  patchMany: (partial) =>
    set((s) => {
      const updated = { ...s.state, ...partial };
      return { state: mirrorToSnapshots(updated, Object.keys(partial)), dirty: true };
    }),

  markClean: () => set({ dirty: false }),

  reset: () => set({ draftId: null, state: makeInitialState("leads"), dirty: false }),

  setDraftName: (name) => set((s) => ({ state: { ...s.state, draftName: name }, dirty: true })),

  selectAdSet: (setId) =>
    set((s) => {
      const target = s.state.adSets.find((x) => x.id === setId);
      if (!target) return s;
      return { state: hydrateFromSelection(s.state, setId, target.ads[0]?.id ?? s.state.selectedAdId), dirty: true };
    }),

  selectAd: (setId, adId) =>
    set((s) => ({ state: hydrateFromSelection(s.state, setId, adId), dirty: true })),

  addAdSet: () =>
    set((s) => {
      const newSet = makeAdSet(`Ad Set ${s.state.adSets.length + 1}`, s.state.cta);
      const adSets = [...s.state.adSets, newSet];
      const next = hydrateFromSelection({ ...s.state, adSets }, newSet.id, newSet.ads[0].id);
      return { state: next, dirty: true };
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
      return { state: next, dirty: true };
    }),

  renameAdSet: (setId, name) =>
    set((s) => ({
      state: {
        ...s.state,
        adSets: s.state.adSets.map((x) => (x.id === setId ? { ...x, name } : x)),
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
      },
      dirty: true,
    })),

  deleteAdSet: (setId) =>
    set((s) => {
      if (s.state.adSets.length <= 1) return s;
      const adSets = s.state.adSets.filter((x) => x.id !== setId);
      const nextSet = adSets[0];
      const next = hydrateFromSelection({ ...s.state, adSets }, nextSet.id, nextSet.ads[0]?.id ?? "");
      return { state: next, dirty: true };
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
      return { state: next, dirty: true };
    }),
}));
