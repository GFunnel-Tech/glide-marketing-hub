import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";

export type PortalMapping = {
  id: string;
  client_id: number;
  workspace_id: string | null;
  status: string;
  accepted_at: string | null;
};

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

const ACTIVE_CLIENT_KEY = "portal:activeClientId";

export function usePortalMappings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal-mappings", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<PortalMapping[]> => {
      const { data, error } = await supabase
        .from("portal_users")
        .select("id, client_id, workspace_id, status, accepted_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PortalMapping[];
    },
  });
}

export function useActiveClientId(mappings: PortalMapping[] | undefined): [number | null, (id: number) => void] {
  const [active, setActive] = useState<number | null>(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_CLIENT_KEY) : null;
    return stored ? Number(stored) : null;
  });

  useEffect(() => {
    if (!mappings || mappings.length === 0) return;
    const activeMappings = mappings.filter((m) => m.status === "active");
    const pool = activeMappings.length > 0 ? activeMappings : mappings;
    if (active && pool.some((m) => m.client_id === active)) return;
    const first = pool[0].client_id;
    setActive(first);
    window.localStorage.setItem(ACTIVE_CLIENT_KEY, String(first));
  }, [mappings, active]);

  const set = (id: number) => {
    setActive(id);
    window.localStorage.setItem(ACTIVE_CLIENT_KEY, String(id));
  };
  return [active, set];
}

export function usePortalClient() {
  const mappingsQ = usePortalMappings();
  const [activeId, setActiveId] = useActiveClientId(mappingsQ.data);
  const mapping = mappingsQ.data?.find((m) => m.client_id === activeId) ?? null;

  const clientQ = useQuery({
    queryKey: ["portal-client", activeId],
    enabled: activeId !== null && mapping?.status === "active",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", activeId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as PortalClient | null;
    },
  });

  return {
    mappings: mappingsQ.data ?? [],
    activeClientId: activeId,
    setActiveClientId: setActiveId,
    activeMapping: mapping,
    client: clientQ.data ?? null,
    isLoading: mappingsQ.isLoading || clientQ.isLoading,
    hasAnyMapping: (mappingsQ.data?.length ?? 0) > 0,
  };
}

export function useActiveOnboarding(clientId: number | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal-onboarding", user?.id, clientId],
    enabled: !!user && clientId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_onboarding")
        .select("*")
        .eq("user_id", user!.id)
        .eq("client_id", clientId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
