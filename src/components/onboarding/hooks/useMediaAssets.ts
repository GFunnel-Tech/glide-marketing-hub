import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type MediaAsset = {
  id: string;
  client_id: number;
  workspace_id: string;
  uploaded_by: string | null;
  kind: "image" | "voice" | "logo" | "file";
  storage_bucket: string;
  storage_path: string;
  filename: string | null;
  mime_type: string | null;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  drive_file_id: string | null;
  drive_sync_status: "pending" | "synced" | "failed";
  drive_synced_at: string | null;
  processing_status: "pending" | "ready_for_processing" | "processing" | "processed" | "failed";
  elevenlabs_voice_id: string | null;
  higgsfield_character_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export function useMediaAssets(clientId: number | undefined) {
  return useQuery({
    queryKey: ["client-media-assets", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<MediaAsset[]> => {
      const { data, error } = await (supabase as any)
        .from("client_media_assets")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MediaAsset[];
    },
  });
}

export type UploadInput = {
  clientId: number;
  workspaceId: string;
  userId: string;
  kind: MediaAsset["kind"];
  file: Blob;
  filename: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
};

function extOf(filename: string, mime: string | undefined) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename);
  if (m) return m[1].toLowerCase();
  if (!mime) return "bin";
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "image/svg+xml": "svg",
  };
  return map[mime] ?? "bin";
}

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  return Math.random().toString(36).slice(2);
}

export function useUploadAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UploadInput): Promise<MediaAsset> => {
      const id = randomId();
      const ext = extOf(input.filename, input.mimeType);
      const storage_path = `${input.clientId}/${input.kind}/${id}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("client-onboarding")
        .upload(storage_path, input.file, {
          contentType: input.mimeType,
          upsert: false,
        });
      if (uploadErr) throw uploadErr;

      const row = {
        id,
        client_id: input.clientId,
        workspace_id: input.workspaceId,
        uploaded_by: input.userId,
        kind: input.kind,
        storage_bucket: "client-onboarding",
        storage_path,
        filename: input.filename,
        mime_type: input.mimeType ?? null,
        byte_size: (input.file as any).size ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        duration_seconds: input.durationSeconds ?? null,
      };
      const { data, error } = await (supabase as any)
        .from("client_media_assets")
        .insert(row)
        .select("*")
        .maybeSingle();
      if (error) {
        // Best-effort cleanup so we don't leave an orphan file behind
        await supabase.storage.from("client-onboarding").remove([storage_path]).catch(() => {});
        throw error;
      }
      return data as MediaAsset;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["client-media-assets", data.client_id] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Upload failed");
    },
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (asset: MediaAsset) => {
      const { error } = await (supabase as any)
        .from("client_media_assets")
        .delete()
        .eq("id", asset.id);
      if (error) throw error;
      // Best-effort storage cleanup. RLS may block portal users from delete —
      // we don't throw on that; the DB row is gone and admin can sweep later.
      await supabase.storage.from("client-onboarding").remove([asset.storage_path]).catch(() => {});
      return asset;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["client-media-assets", data.client_id] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Could not remove file");
    },
  });
}
