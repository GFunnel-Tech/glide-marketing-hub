import { CSSProperties, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { ShieldCheck, Building2, Camera, Mic, FileText, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EMM_THEME } from "./config";
import { OnboardingState, useOnboardingState, useWizardStep, WIZARD_STEPS, WizardStep } from "./hooks/useOnboardingState";
import { MediaAsset, useMediaAssets } from "./hooks/useMediaAssets";
import { ConsentStep } from "./steps/ConsentStep";
import { InfoStep } from "./steps/InfoStep";
import { ImagesStep } from "./steps/ImagesStep";
import { VoiceStep } from "./steps/VoiceStep";
import { FilesStep } from "./steps/FilesStep";
import { ReviewStep } from "./steps/ReviewStep";

export type OnboardingWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: number;
  workspaceId: string;
  brandLabel?: string;
  onSubmitted?: () => void;
};

const STEP_DEFS: { key: WizardStep; label: string; icon: typeof ShieldCheck }[] = [
  { key: "consent", label: "Consent", icon: ShieldCheck },
  { key: "info", label: "Your business", icon: Building2 },
  { key: "images", label: "Photos", icon: Camera },
  { key: "voice", label: "Voice", icon: Mic },
  { key: "files", label: "Files", icon: FileText },
  { key: "review", label: "Review", icon: CheckCircle2 },
];

export function OnboardingWizard({
  open,
  onOpenChange,
  clientId,
  workspaceId,
  brandLabel,
  onSubmitted,
}: OnboardingWizardProps) {
  const { user } = useAuth();

  const { state, isLoading, ensureRow, save, firstIncompleteStep, refetch } =
    useOnboardingState(user?.id, clientId, workspaceId);
  const [step, setStep] = useWizardStep(user?.id, clientId, "consent");

  // On open, make sure a row exists and jump to first-incomplete step
  // (unless the user has been navigating with localStorage's value).
  useEffect(() => {
    if (!open) return;
    ensureRow().then(() => refetch());
  }, [open, ensureRow, refetch]);

  useEffect(() => {
    if (!open) return;
    if (!state) return;
    const allDone = state.consent_done && state.info_done && state.images_done && state.voice_done && state.files_done;
    if (allDone && step !== "review") setStep("review");
    else if (!state.consent_done && step === "consent") {
      // stay
    }
  }, [open, state, step, setStep]);

  const assetsQ = useMediaAssets(clientId);

  const stepIndex = WIZARD_STEPS.indexOf(step);
  const progress = Math.round(((stepIndex + 1) / WIZARD_STEPS.length) * 100);

  const goto = (next: WizardStep) => setStep(next);
  const advance = () => {
    const i = WIZARD_STEPS.indexOf(step);
    if (i < WIZARD_STEPS.length - 1) setStep(WIZARD_STEPS[i + 1]);
  };
  const back = () => {
    const i = WIZARD_STEPS.indexOf(step);
    if (i > 0) setStep(WIZARD_STEPS[i - 1]);
  };

  const themeStyle = useMemo<CSSProperties>(() => {
    const out: any = {};
    for (const [k, v] of Object.entries(EMM_THEME)) out[k] = v;
    return out;
  }, []);

  const ctx = {
    clientId,
    workspaceId,
    userId: user?.id ?? "",
    state,
    assets: assetsQ.data ?? [],
    refetchAssets: assetsQ.refetch,
    save,
    refetch,
    advance,
    back,
    goto,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={themeStyle}
        className="bg-background text-foreground p-0 max-w-3xl gap-0 overflow-hidden"
      >
        {/* Header */}
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <DialogTitle className="text-base text-foreground font-semibold">
              EMM client onboarding{brandLabel ? ` — ${brandLabel}` : ""}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              We collect this to produce your ads. You can save and come back any time.
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 pt-4">
          <Progress value={progress} className="h-1.5 bg-muted" />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {STEP_DEFS.map((s, i) => {
              const Icon = s.icon;
              const flag = s.key === "review"
                ? state?.submitted_at
                : (state as any)?.[`${s.key}_done`];
              const isDone = !!flag;
              const isActive = i === stepIndex;
              return (
                <button
                  key={s.key}
                  onClick={() => goto(s.key)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium transition-colors",
                    isActive ? "text-[hsl(var(--primary))]" :
                    isDone ? "text-[hsl(var(--success))]" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
              {step === "consent" && <ConsentStep ctx={ctx} />}
              {step === "info" && <InfoStep ctx={ctx} />}
              {step === "images" && <ImagesStep ctx={ctx} />}
              {step === "voice" && <VoiceStep ctx={ctx} />}
              {step === "files" && <FilesStep ctx={ctx} />}
              {step === "review" && <ReviewStep ctx={ctx} onClose={() => { onOpenChange(false); onSubmitted?.(); }} />}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type WizardContext = {
  clientId: number;
  workspaceId: string;
  userId: string;
  state: OnboardingState | null | undefined;
  assets: MediaAsset[];
  refetchAssets: () => void | Promise<unknown>;
  save: (patch: Partial<OnboardingState>) => Promise<OnboardingState>;
  refetch: () => void | Promise<unknown>;
  advance: () => void;
  back: () => void;
  goto: (s: WizardStep) => void;
};
