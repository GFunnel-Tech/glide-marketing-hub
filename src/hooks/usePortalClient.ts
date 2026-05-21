// Compatibility shim — delegates to the multi-client hook in usePortalClients.ts
// while preserving the original single-client API used across portal pages.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalClient as usePortalClientMulti } from "./usePortalClients";

export type PortalClient = {
  id: number;
  name: string;
  brand: string;
  status: "GREEN" | "YELLOW" | "RED" | "BLOCKED" | string;
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
    queryKey: ["portal-mapping-legacy", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_users")
        .select("client_id, status")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return null;
      const active = rows.find((r) => r.status === "active");
      return (active ?? rows[0]).client_id;
    },
  });
}

export function usePortalClient() {
  const multi = usePortalClientMulti();
  return {
    clientId: multi.activeClientId,
    client: multi.client as unknown as PortalClient | null,
    isLoading: multi.isLoading,
    hasMapping: multi.hasAnyMapping,
  };
}
