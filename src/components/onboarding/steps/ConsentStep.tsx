import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { CONSENT_TEXT_VOICE_LIKENESS } from "../config";
import type { WizardContext } from "../OnboardingWizard";

export function ConsentStep({ ctx }: { ctx: WizardContext }) {
  const [checked, setChecked] = useState(!!ctx.state?.consent_done);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!checked) return;
    setBusy(true);
    try {
      // Append-only consent log — re-checking on revisit is a no-op for the
      // wizard but writes one row per acceptance for the audit trail.
      const { error } = await (supabase as any).from("client_consents").insert({
        client_id: ctx.clientId,
        workspace_id: ctx.workspaceId,
        consent_type: "voice_likeness",
        consent_text: CONSENT_TEXT_VOICE_LIKENESS,
        granted_by: ctx.userId,
        method: "both", // checkbox + spoken line during the voice step
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
      });
      if (error && !/duplicate/i.test(error.message)) throw error;
      await ctx.save({ consent_done: true });
      ctx.advance();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not record consent");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-3 items-start">
        <div className="rounded-lg bg-[hsl(var(--primary))]/10 p-2 text-[hsl(var(--primary))]">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Welcome — here's what we'll do</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We'll capture your business details, at least five photos of you, and a short voice
            recording. EMM uses these to produce your ads with AI-generated voice and avatar
            assets that sound and look like you.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Consent to use your voice and likeness
        </p>
        <p className="text-sm text-foreground leading-relaxed">
          {CONSENT_TEXT_VOICE_LIKENESS}
        </p>
        <label className="flex items-start gap-2 pt-2 cursor-pointer">
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => setChecked(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm text-foreground">
            I agree. (You'll also read a short spoken consent line during the voice step.)
          </span>
        </label>
      </div>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={!checked || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
          Agree & continue
        </Button>
      </div>
    </div>
  );
}
