import { create } from "zustand";
import { AdBuilderState, makeInitialState, Objective, SpecialAdCategory } from "@/components/ads/builder/types";

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
}

export const useAdDraftStore = create<AdDraftStore>((set) => ({
  draftId: null,
  state: makeInitialState("leads"),
  dirty: false,
  setDraftId: (id) => set({ draftId: id }),
  hydrate: (id, state) => set({ draftId: id, state, dirty: false }),
  init: (objective, specialAdCategory, countries) =>
    set({ draftId: null, state: makeInitialState(objective, specialAdCategory, countries), dirty: true }),
  patch: (key, value) => set((s) => ({ state: { ...s.state, [key]: value }, dirty: true })),
  patchMany: (partial) => set((s) => ({ state: { ...s.state, ...partial }, dirty: true })),
  markClean: () => set({ dirty: false }),
  reset: () => set({ draftId: null, state: makeInitialState("leads"), dirty: false }),
}));
