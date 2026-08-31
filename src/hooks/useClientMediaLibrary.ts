import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MediaSource = "ghl" | "meta" | "metahub";

export interface LibraryItem {
  id: string;
  source: MediaSource;
  type: "image" | "video";
  name: string;
  url: string;
  thumbnail?: string;
  createdAt?: string;
}

interface LibraryResponse {
  items: LibraryItem[];
  errors: { source: string; message: string }[];
}

export function useClientMediaLibrary(
  workspaceId: string | undefined,
  clientId: number | null | undefined,
  enabled: boolean,
) {
  return useQuery<LibraryResponse>({
    queryKey: ["client-media-library", workspaceId, clientId],
    enabled: Boolean(workspaceId) && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("client-media-library", {
        body: {
          action: "list",
          workspaceId,
          clientId: clientId ?? undefined,
          sources: ["ghl", "meta", "metahub"],
          limit: 100,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return { items: (data as LibraryResponse).items ?? [], errors: (data as LibraryResponse).errors ?? [] };
    },
  });
}

/** Copies remote library media into Glide Media storage so the editor can use it without CORS issues. */
export async function importLibraryAssets(
  workspaceId: string,
  assets: { url: string; name?: string; type?: "image" | "video" }[],
) {
  const { data, error } = await supabase.functions.invoke("client-media-library", {
    body: { action: "import", workspaceId, assets },
  });
  if (error) throw new Error(error.message);
  const payload = data as {
    imported?: { url: string; name: string; type: "image" | "video" }[];
    failures?: { url: string; message: string }[];
    error?: string;
  };
  if (payload?.error) throw new Error(payload.error);
  return { imported: payload.imported ?? [], failures: payload.failures ?? [] };
}
