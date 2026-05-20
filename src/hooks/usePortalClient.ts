import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type PortalClient = {
  id: number;
  name: string;
  brand: string;
  status: "GREEN" | "YELLOW" | "RED" | "BLOCKED";
  spend: number;
  leads: number;
  reported_leads: number;
  true_leads: number;
  cpl: number;
  true_cpl: number;
  cpm: number;
  form_cvr: number;
  frequency: number;
  ghl_location_id: string | null;
  workspace_id: string | null;
};

export function usePortalMapping() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal-mapping", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_users")
        .select("client_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.client_id ?? null;
    },
  });
}

export function usePortalClient() {
  const mapping = usePortalMapping();
  const clientId = mapping.data ?? null;

  const client = useQuery({
    queryKey: ["portal-client", clientId],
    enabled: clientId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as PortalClient | null;
    },
  });

  return {
    clientId,
    client: client.data ?? null,
    isLoading: mapping.isLoading || client.isLoading,
    hasMapping: clientId !== null,
  };
}
