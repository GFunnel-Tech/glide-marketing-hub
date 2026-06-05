import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export interface AgencyProfile {
  id: string;
  workspace_id: string;

  // General information
  logo_url: string | null;
  friendly_business_name: string | null;
  legal_business_name: string | null;
  business_email: string | null;
  business_phone: string | null;
  branded_domain: string | null;
  business_website: string | null;
  business_niche: string | null;
  business_currency: string;

  // Business information
  business_type: string | null;
  business_industry: string | null;
  business_registration_id_type: string | null;
  business_registration_number: string | null;
  business_not_registered: boolean;
  business_regions: string[];

  // Physical address
  street_address: string | null;
  city: string | null;
  postal_code: string | null;
  state_region: string | null;
  country: string;
  time_zone: string;
  platform_language: string;
  outbound_language: string | null;

  // Authorized representative
  rep_first_name: string | null;
  rep_last_name: string | null;
  rep_email: string | null;
  rep_job_position: string | null;
  rep_phone: string | null;
}

export type AgencyProfileInput = Partial<Omit<AgencyProfile, "id" | "workspace_id">>;

export function useAgencyProfile() {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ["agency-profile", currentWorkspace?.id],
    enabled: !!currentWorkspace,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agency_profiles")
        .select("*")
        .eq("workspace_id", currentWorkspace!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as AgencyProfile | null;
    },
  });
}

export function useUpsertAgencyProfile() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (input: AgencyProfileInput) => {
      if (!currentWorkspace) throw new Error("No workspace selected");
      const payload = { workspace_id: currentWorkspace.id, ...input };
      const { error } = await supabase
        .from("agency_profiles")
        .upsert(payload as never, { onConflict: "workspace_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency-profile"] });
      toast.success("Agency profile saved");
    },
    onError: (e: Error) => toast.error(e?.message || "Failed to save agency profile"),
  });
}
