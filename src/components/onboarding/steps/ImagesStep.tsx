import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, Loader2, Camera, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useUploadAsset, useDeleteAsset } from "../hooks/useMediaAssets";
import {
  ACCEPTED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  MIN_IMAGE_COUNT,
  MIN_IMAGE_SHORT_SIDE_PX,
  RECOMMENDED_IMAGE_COUNT,
} from "../config";
import type { WizardContext } from "../OnboardingWizard";

type Preview = { id: string; url: string };

async function inspectImage(file: File): Promise<{ width: number; height: number; previewUrl: string }> {
  const url = URL.createObjectURL(file);
  try {
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("Could not decode image"));
      img.src = url;
    });
    return { ...dims, previewUrl: url };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

export function ImagesStep({ ctx }: { ctx: WizardContext }) {
  const upload = useUploadAsset();
  const del = useDeleteAsset();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const images = ctx.assets.filter((a) => a.kind === "image");

  useEffect(() => {
    const missing = images.filter((a) => !signedUrls[a.id]);
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      for (const a of missing) {
        const { data } = await supabase.storage
          .from("client-onboarding")
          .createSignedUrl(a.storage_path, 3600);
        if (cancelled || !data?.signedUrl) continue;
        setSignedUrls((m) => ({ ...m, [a.id]: data.signedUrl }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.map((a) => a.id).join(",")]);

  const onPick = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    let added = 0, rejected = 0;
    try {
      for (const f of Array.from(files)) {
        if (!ACCEPTED_IMAGE_MIME.includes(f.type)) {
          toast.error(`Skipped ${f.name}: not a JPEG/PNG/HEIC/WebP`);
          rejected++;
          continue;
        }
        if (f.size > MAX_IMAGE_BYTES) {
          toast.error(`Skipped ${f.name}: over 15 MB`);
          rejected++;
          continue;
        }
        let width = 0, height = 0;
        try {
          // HEIC won't decode in <img>; skip dimension check rather than reject.
          if (f.type === "image/heic" || f.type === "image/heif") {
            // accept blindly; backend can re-check later
          } else {
            const r = await inspectImage(f);
            width = r.width; height = r.height;
            const shortSide = Math.min(width, height);
            if (shortSide < MIN_IMAGE_SHORT_SIDE_PX) {
              toast.error(`Skipped ${f.name}: short side under ${MIN_IMAGE_SHORT_SIDE_PX}px`);
              rejected++;
              URL.revokeObjectURL(r.previewUrl);
              continue;
            }
            URL.revokeObjectURL(r.previewUrl);
          }
        } catch {
          toast.error(`Skipped ${f.name}: could not read image`);
          rejected++;
          continue;
        }
        await upload.mutateAsync({
          clientId: ctx.clientId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          kind: "image",
          file: f,
          filename: f.name,
          mimeType: f.type,
          width: width || undefined,
          height: height || undefined,
        });
        added++;
      }
      await ctx.refetchAssets();
      if (added > 0) toast.success(`Added ${added} image${added === 1 ? "" : "s"}`);
      // Auto-flip the done flag when we cross the gate
      if (images.length + added >= MIN_IMAGE_COUNT && !ctx.state?.images_done) {
        await ctx.save({ images_done: true });
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const a = images.find((x) => x.id === id);
    if (!a) return;
    await del.mutateAsync(a);
    await ctx.refetchAssets();
    if (images.length - 1 < MIN_IMAGE_COUNT && ctx.state?.images_done) {
      await ctx.save({ images_done: false });
    }
  };

  const meetsGate = images.length >= MIN_IMAGE_COUNT;

  const advance = async () => {
    if (!meetsGate) return;
    await ctx.save({ images_done: true });
    ctx.advance();
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Photos of you</h2>
        <p className="text-sm text-muted-foreground mt-1">
          At least {MIN_IMAGE_COUNT}, ideally {RECOMMENDED_IMAGE_COUNT}. The more variety, the better your avatar.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p className="flex items-center gap-1.5 text-foreground font-medium">
          <Camera className="h-3.5 w-3.5" /> For best results
        </p>
        <ul className="list-disc ml-5 space-y-0.5">
          <li>Single subject only — just you in the frame.</li>
          <li>Clear, well-lit face. Mix front, 3/4, and profile angles.</li>
          <li>Close-up and waist-up shots both.</li>
          <li>Recent. Avoid heavy filters, sunglasses, face-covering hats, motion blur.</li>
        </ul>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-foreground">
            {images.length} / {MIN_IMAGE_COUNT} minimum
          </span>
          {!meetsGate && (
            <span className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> Need {MIN_IMAGE_COUNT - images.length} more
            </span>
          )}
        </div>

        {images.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-4">
            {images.map((a) => (
              <div key={a.id} className="relative group rounded-md overflow-hidden border border-border bg-muted aspect-square">
                {signedUrls[a.id] ? (
                  <img src={signedUrls[a.id]} alt={a.filename ?? ""} className="object-cover w-full h-full" />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="absolute top-1 right-1 rounded-full bg-background/90 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remove image"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => { onPick(e.target.files); e.target.value = ""; }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={busy} variant="outline">
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
          Choose photos
        </Button>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={ctx.back}>Back</Button>
        <Button onClick={advance} disabled={!meetsGate || busy}>Continue</Button>
      </div>
    </div>
  );
}
