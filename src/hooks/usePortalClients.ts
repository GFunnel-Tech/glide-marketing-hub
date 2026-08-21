import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { usePortalLocationId, usePortalLocationClient } from "./usePortalLocationScope";

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
const VIEW_AS_KEY = "portal:viewAsClientId";

export function getViewAsClientId(): number | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(VIEW_AS_KEY);
  return v ? Number(v) : null;
}

export function setViewAsClientId(id: number | null) {
  if (typeof window === "undefined") return;
  if (id === null) window.localStorage.removeItem(VIEW_AS_KEY);
  else window.localStorage.setItem(VIEW_AS_KEY, String(id));
  window.dispatchEvent(new Event("portal:viewAsChanged"));
}

export function useViewAsClientId(): number | null {
  const [v, setV] = useState<number | null>(getViewAsClientId());
  useEffect(() => {
    const refresh = () => setV(getViewAsClientId());
    window.addEventListener("portal:viewAsChanged", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("portal:viewAsChanged", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return v;
}

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
  const viewAsId = useViewAsClientId();
  const locationId = usePortalLocationId();
  const locationClientQ = usePortalLocationClient(locationId);
  const scopedId = locationClientQ.data ?? null;
  const effectiveId = scopedId ?? viewAsId ?? activeId;
  const mapping = mappingsQ.data?.find((m) => m.client_id === effectiveId) ?? null;

  const clientQ = useQuery({
    queryKey: ["portal-client", effectiveId],
    enabled: effectiveId !== null && (!!scopedId || !!viewAsId || mapping?.status === "active"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", effectiveId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as PortalClient | null;
    },
  });

  return {
    mappings: mappingsQ.data ?? [],
    activeClientId: effectiveId,
    setActiveClientId: setActiveId,
    activeMapping: mapping,
    client: clientQ.data ?? null,
    isLoading: mappingsQ.isLoading || clientQ.isLoading || locationClientQ.isLoading,
    hasAnyMapping: (mappingsQ.data?.length ?? 0) > 0,
    viewAsClientId: viewAsId,
    locationId,
    locationClientId: scopedId,
    locationNotFound: !!locationId && !locationClientQ.isLoading && !locationClientQ.isError && scopedId === null,
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
