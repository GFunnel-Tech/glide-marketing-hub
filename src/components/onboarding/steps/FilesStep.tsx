import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useUploadAsset, useDeleteAsset } from "../hooks/useMediaAssets";
import { ACCEPTED_FILE_MIME } from "../config";
import type { WizardContext } from "../OnboardingWizard";

export function FilesStep({ ctx }: { ctx: WizardContext }) {
  const upload = useUploadAsset();
  const del = useDeleteAsset();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const logo = ctx.assets.find((a) => a.kind === "logo");
  const otherFiles = ctx.assets.filter((a) => a.kind === "file");

  const onPick = async (kind: "logo" | "file", files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        if (f.size === 0) continue;
        if (ACCEPTED_FILE_MIME.length && f.type && !ACCEPTED_FILE_MIME.includes(f.type) && kind === "file") {
          toast.error(`Unsupported file type: ${f.name}`);
          continue;
        }
        await upload.mutateAsync({
          clientId: ctx.clientId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          kind,
          file: f,
          filename: f.name,
          mimeType: f.type,
        });
      }
      await ctx.refetchAssets();
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    await ctx.save({ files_done: true });
    ctx.advance();
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Supporting files</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Logo (vector preferred), and any compliance docs or extras the creative team should have.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">Logo</p>
        {logo ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground">{logo.filename}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => del.mutateAsync(logo).then(() => ctx.refetchAssets())}
              disabled={del.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Remove
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No logo uploaded yet.</p>
        )}
        <label>
          <input
            type="file"
            accept=".svg,.png,.jpg,.jpeg,.webp,.pdf,.ai,.eps"
            className="hidden"
            onChange={(e) => { onPick("logo", e.target.files); e.target.value = ""; }}
          />
          <Button size="sm" variant="outline" asChild={false} type="button"
            onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement)?.click()}
            disabled={busy}
          >
            <Upload className="h-4 w-4 mr-1" />
            {logo ? "Replace logo" : "Upload logo"}
          </Button>
        </label>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Other files</p>
          <span className="text-xs text-muted-foreground">{otherFiles.length} uploaded</span>
        </div>

        {otherFiles.length === 0 ? (
          <p className="text-xs text-muted-foreground">Optional. PDFs, headshots, compliance docs, etc.</p>
        ) : (
          <ul className="space-y-1">
            {otherFiles.map((f) => (
              <li key={f.id} className="flex items-center justify-between text-sm bg-muted/30 rounded px-2 py-1.5">
                <span className="flex items-center gap-2 truncate">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{f.filename}</span>
                </span>
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => del.mutateAsync(f).then(() => ctx.refetchAssets())}
                  disabled={del.isPending}
                  aria-label="Remove file"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { onPick("file", e.target.files); e.target.value = ""; }}
        />
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
          Add files
        </Button>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={ctx.back}>Back</Button>
        <Button onClick={advance} disabled={busy}>Continue</Button>
      </div>
    </div>
  );
}
