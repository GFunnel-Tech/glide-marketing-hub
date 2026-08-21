import { supabase } from "@/integrations/supabase/client";

/** Uploads an exported studio blob to the public ad-creatives bucket and returns its URL. */
export async function uploadStudioBlob(workspaceId: string, blob: Blob, filename: string) {
  const path = `${workspaceId}/studio/${crypto.randomUUID()}-${filename.replace(/[^\w.\-]+/g, "_")}`;
  const { error } = await supabase.storage.from("ad-creatives").upload(path, blob, {
    contentType: blob.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("ad-creatives").getPublicUrl(path);
  return data.publicUrl;
}

export const RATIOS: { id: string; label: string; w: number; h: number }[] = [
  { id: "1:1", label: "Square 1:1", w: 1080, h: 1080 },
  { id: "4:5", label: "Feed 4:5", w: 1080, h: 1350 },
  { id: "9:16", label: "Story 9:16", w: 1080, h: 1920 },
  { id: "16:9", label: "Landscape 16:9", w: 1920, h: 1080 },
  { id: "1.91:1", label: "Link 1.91:1", w: 1200, h: 628 },
];

/** Draws a source (image/video) into a canvas rect using cover fit. */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  srcW: number,
  srcH: number,
  dw: number,
  dh: number,
  zoom = 1,
  offsetX = 0,
  offsetY = 0,
) {
  if (!srcW || !srcH) return;
  const scale = Math.max(dw / srcW, dh / srcH) * zoom;
  const w = srcW * scale;
  const h = srcH * scale;
  ctx.drawImage(src, (dw - w) / 2 + offsetX, (dh - h) / 2 + offsetY, w, h);
}
