import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MIN_IMAGE_COUNT, VOICE_MIN_SECONDS } from "../config";
import type { WizardContext } from "../OnboardingWizard";

export function ReviewStep({ ctx, onClose }: { ctx: WizardContext; onClose: () => void }) {
  const s = ctx.state;
  const [busy, setBusy] = useState(false);
  const images = ctx.assets.filter((a) => a.kind === "image");
  const voice = ctx.assets.find((a) => a.kind === "voice");
  const logo = ctx.assets.find((a) => a.kind === "logo");
  const files = ctx.assets.filter((a) => a.kind === "file");

  const issues: string[] = [];
  if (!s?.consent_done) issues.push("Consent not recorded");
  if (!s?.info_done) issues.push("Business info incomplete");
  if (images.length < MIN_IMAGE_COUNT) issues.push(`Need ${MIN_IMAGE_COUNT - images.length} more image(s)`);
  if (!voice) issues.push("Voice recording missing");
  else if ((voice.duration_seconds ?? 0) < VOICE_MIN_SECONDS) issues.push(`Voice recording must be at least ${VOICE_MIN_SECONDS}s`);

  const alreadySubmitted = !!s?.submitted_at;

  const submit = async () => {
    if (issues.length) {
      toast.error("Resolve the highlighted issues first");
      return;
    }
    setBusy(true);
    try {
      await ctx.save({
        submitted_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
      // Best-effort: kick the Drive sync edge function. It will mark
      // failures honestly on each asset row if it cannot reach n8n.
      const { error } = await supabase.functions.invoke("onboarding-drive-sync", {
        body: { client_id: ctx.clientId },
      });
      if (error) {
        // Don't block the user — admin view will surface the failure.
        toast.warning("Submitted, but Drive sync did not start (admin will retry)");
      } else {
        toast.success("You're all set");
      }
      await ctx.refetchAssets();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not submit");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Review & submit</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Last check before we send everything to your creative team.
        </p>
      </div>

      <div className="space-y-2">
        <ReviewLine
          label="Consent recorded"
          ok={!!s?.consent_done}
          jumpTo={() => ctx.goto("consent")}
        />
        <ReviewLine
          label="Business info complete"
          detail={s?.brand_display_name ?? s?.business_name ?? "—"}
          ok={!!s?.info_done}
          jumpTo={() => ctx.goto("info")}
        />
        <ReviewLine
          label={`Photos (${images.length})`}
          detail={images.length >= MIN_IMAGE_COUNT ? "Meets minimum" : `${MIN_IMAGE_COUNT - images.length} more required`}
          ok={images.length >= MIN_IMAGE_COUNT}
          jumpTo={() => ctx.goto("images")}
        />
        <ReviewLine
          label="Voice recording"
          detail={voice ? `${Math.round(voice.duration_seconds ?? 0)}s` : "Missing"}
          ok={!!voice && (voice.duration_seconds ?? 0) >= VOICE_MIN_SECONDS}
          jumpTo={() => ctx.goto("voice")}
        />
        <ReviewLine
          label={`Files (logo + ${files.length} other)`}
          detail={logo ? `Logo: ${logo.filename}` : "No logo uploaded"}
          ok={!!s?.files_done}
          jumpTo={() => ctx.goto("files")}
        />
      </div>

      {issues.length > 0 && !alreadySubmitted && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <ul className="list-disc ml-4 space-y-0.5">
            {issues.map((i) => <li key={i}>{i}</li>)}
          </ul>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={ctx.back}>Back</Button>
        {alreadySubmitted ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <Button onClick={submit} disabled={busy || issues.length > 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Submit
          </Button>
        )}
      </div>

      {alreadySubmitted && (
        <p className="text-xs text-muted-foreground text-center">
          Submitted {new Date(s!.submitted_at!).toLocaleString()}. Your team has it from here.
        </p>
      )}
    </div>
  );
}

function ReviewLine({ label, detail, ok, jumpTo }: { label: string; detail?: string; ok: boolean; jumpTo: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
        ) : (
          <AlertCircle className="h-4 w-4 text-destructive" />
        )}
        <div className="text-sm">
          <div className="text-foreground font-medium">{label}</div>
          {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={jumpTo}>Edit</Button>
    </div>
  );
}
