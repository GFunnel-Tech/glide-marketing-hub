import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Shape of a row in portal_onboarding (extended set used by the new wizard).
export type OnboardingState = {
  id?: string;
  user_id: string;
  client_id: number;
  workspace_id: string;
  // Legacy 4-step flags (left intact — old portal still uses them)
  profile_done?: boolean;
  meta_done?: boolean;
  billing_done?: boolean;
  brand_done?: boolean;
  // New wizard flags (added in 20260629050741_onboarding_media_capture.sql)
  consent_done?: boolean;
  info_done?: boolean;
  images_done?: boolean;
  voice_done?: boolean;
  files_done?: boolean;
  submitted_at?: string | null;
  completed_at?: string | null;
  // Info fields
  legal_business_name?: string | null;
  brand_display_name?: string | null;
  business_name?: string | null; // legacy column, still kept in sync
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  nmls_id?: string | null;
  brand_primary_color?: string | null;
  brand_tagline?: string | null;
  brand_notes?: string | null;
  brand_logo_url?: string | null;
  time_zone?: string | null;
  preferred_contact?: string | null;
};

export type WizardStep = "consent" | "info" | "images" | "voice" | "files" | "review";
export const WIZARD_STEPS: WizardStep[] = ["consent", "info", "images", "voice", "files", "review"];

const STEP_FLAG: Record<WizardStep, keyof OnboardingState | null> = {
  consent: "consent_done",
  info: "info_done",
  images: "images_done",
  voice: "voice_done",
  files: "files_done",
  review: null,
};

export function useOnboardingState(userId: string | undefined, clientId: number | undefined, workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  const key = ["onboarding-wizard", userId, clientId];

  const query = useQuery({
    queryKey: key,
    enabled: !!userId && !!clientId,
    queryFn: async (): Promise<OnboardingState | null> => {
      const { data, error } = await (supabase as any)
        .from("portal_onboarding")
        .select("*")
        .eq("user_id", userId)
        .eq("client_id", clientId)
        .maybeSingle();
      if (error && (error as any).code !== "PGRST116") throw error;
      return (data ?? null) as OnboardingState | null;
    },
  });

  // Make sure a row exists so subsequent UPDATEs hit it. Idempotent.
  const ensureRow = useCallback(async () => {
    if (!userId || !clientId || !workspaceId) return null;
    const { data, error } = await (supabase as any)
      .from("portal_onboarding")
      .upsert(
        { user_id: userId, client_id: clientId, workspace_id: workspaceId },
        { onConflict: "user_id,client_id" },
      )
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data as OnboardingState;
  }, [userId, clientId, workspaceId]);

  const save = useMutation({
    mutationFn: async (patch: Partial<OnboardingState>) => {
      if (!userId || !clientId || !workspaceId) throw new Error("Missing identity");
      const { data, error } = await (supabase as any)
        .from("portal_onboarding")
        .upsert(
          { user_id: userId, client_id: clientId, workspace_id: workspaceId, ...patch },
          { onConflict: "user_id,client_id" },
        )
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as OnboardingState;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Could not save");
    },
  });

  const firstIncompleteStep: WizardStep = useMemo(() => {
    const s = query.data;
    if (!s) return "consent";
    for (const step of WIZARD_STEPS) {
      const flag = STEP_FLAG[step];
      if (flag && !(s as any)[flag]) return step;
    }
    return "review";
  }, [query.data]);

  return {
    state: query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
    ensureRow,
    save: save.mutateAsync,
    saving: save.isPending,
    firstIncompleteStep,
  };
}

// Resume-aware wizard step state. Persists `current` step in localStorage
// per (user, client) so a refresh comes back to the same place.
export function useWizardStep(userId: string | undefined, clientId: number | undefined, initial: WizardStep) {
  const storageKey = userId && clientId ? `metahub:onboarding-wizard:${userId}:${clientId}:step` : null;
  const [step, setStep] = useState<WizardStep>(() => {
    if (typeof window === "undefined" || !storageKey) return initial;
    const saved = window.localStorage.getItem(storageKey);
    return (saved as WizardStep) || initial;
  });

  useEffect(() => {
    if (!storageKey) return;
    window.localStorage.setItem(storageKey, step);
  }, [step, storageKey]);

  return [step, setStep] as const;
}
