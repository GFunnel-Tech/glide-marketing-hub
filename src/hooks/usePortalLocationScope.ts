import { useMatch } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Segments directly under /portal that are real pages, not GHL location ids.
const RESERVED = new Set([
  "login",
  "accept",
  "onboarding",
  "performance",
  "leads",
  "requests",
  "reports",
  "integrations",
  "approvals",
  "creative",
  "documents",
  "billing",
  "support",
  "settings",
]);

/**
 * Reads the GHL location id from URLs shaped like
 * `/portal/:locationId` or `/portal/:locationId/<page>`.
 * Returns null for the plain `/portal/...` routes.
 */
export function usePortalLocationId(): string | null {
  const exact = useMatch("/portal/:seg");
  const nested = useMatch("/portal/:seg/*");
  const seg = exact?.params.seg ?? nested?.params.seg ?? null;
  if (!seg || RESERVED.has(seg)) return null;
  return seg;
}

/** Base path for portal links — location-scoped when embedded. */
export function usePortalBasePath(): string {
  const locationId = usePortalLocationId();
  return locationId ? `/portal/${locationId}` : "/portal";
}

/** Resolves a GHL location id to a client id. */
export function usePortalLocationClient(locationId: string | null) {
  return useQuery({
    queryKey: ["portal-location-client", locationId],
    enabled: !!locationId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id")
        .eq("ghl_location_id", locationId!)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
  });
}
