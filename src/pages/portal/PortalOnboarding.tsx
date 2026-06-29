import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalClient, useActiveOnboarding } from "@/hooks/usePortalClients";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Circle, Loader2, User, Facebook, CreditCard, Palette, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

const STEPS = [
  { key: "profile", label: "Profile", icon: User },
  { key: "meta", label: "Connect Meta", icon: Facebook },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "brand", label: "Brand assets", icon: Palette },
] as const;

export default function PortalOnboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { client, activeClientId, activeMapping } = usePortalClient();
  const { data: onboarding, refetch } = useActiveOnboarding(activeClientId);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // form state
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [brandColor, setBrandColor] = useState("#1B3F7B");
  const [brandNotes, setBrandNotes] = useState("");

  useEffect(() => {
    if (!onboarding) return;
    setBusinessName(onboarding.business_name ?? "");
    setContactName(onboarding.contact_name ?? "");
    setContactPhone(onboarding.contact_phone ?? "");
    setBrandColor(onboarding.brand_primary_color ?? "#1B3F7B");
    setBrandNotes(onboarding.brand_notes ?? "");
    // jump to first incomplete
    const order = ["profile_done", "meta_done", "billing_done", "brand_done"];
    const firstIncomplete = order.findIndex((k) => !(onboarding as any)[k]);
    if (firstIncomplete >= 0) setStep(firstIncomplete);
  }, [onboarding]);

  if (!user || !activeClientId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const upsert = async (patch: Record<string, any>) => {
    setSaving(true);
    const { error } = await supabase.from("portal_onboarding").upsert(
      {
        user_id: user.id,
        client_id: activeClientId,
        workspace_id: client?.workspace_id ?? activeMapping?.workspace_id ?? null,
        ...patch,
      },
      { onConflict: "user_id,client_id" },
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    await refetch();
    return true;
  };

  const completeAll = async () => {
    await upsert({ completed_at: new Date().toISOString() });
    toast.success("Onboarding complete!");
    navigate("/portal", { replace: true });
  };

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const done = (key: string) => (onboarding as any)?.[`${key}_done`] === true;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#0F172A]">Welcome{client ? ` to ${client.name}` : ""}</h1>
          <p className="text-sm text-muted-foreground">Complete these steps to finish setup.</p>
        </div>

        {(() => {
          const o: any = onboarding ?? {};
          const mediaComplete = !!o.consent_done && !!o.info_done && !!o.images_done && !!o.voice_done && !!o.files_done && !!o.submitted_at;
          if (mediaComplete) return null;
          const mediaStarted = !!o.consent_done || !!o.info_done || !!o.images_done || !!o.voice_done || !!o.files_done;
          return (
            <Card className="p-5 mb-6 border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-[hsl(var(--primary))]/15 p-2 text-[hsl(var(--primary))]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-foreground">Create your AI ad assets</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    A short wizard: business info, at least 5 photos, and a 2–3 min voice recording.
                    We use these to produce your ads.
                  </p>
                  <Button className="mt-3" onClick={() => setWizardOpen(true)} size="sm">
                    {mediaStarted ? "Resume asset capture" : "Start asset capture"}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })()}

        {activeClientId && client?.workspace_id && (
          <OnboardingWizard
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            clientId={activeClientId}
            workspaceId={client.workspace_id}
            brandLabel={client?.brand ?? client?.name}
            onSubmitted={() => refetch()}
          />
        )}

        {/* Stepper */}
        <div className="flex items-center justify-between mb-6">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isDone = done(s.key);
            const isActive = i === step;
            return (
              <div key={s.key} className="flex-1 flex items-center">
                <button
                  onClick={() => setStep(i)}
                  className={`flex items-center gap-2 text-sm font-medium ${isActive ? "text-[#1B3F7B]" : isDone ? "text-success" : "text-muted-foreground"}`}
                >
                  {isDone ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 ${isDone ? "bg-success" : "bg-border"}`} />}
              </div>
            );
          })}
        </div>

        <Card className="p-6">
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Profile & business details</h2>
              <div>
                <Label htmlFor="bn">Business name</Label>
                <Input id="bn" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="cn">Primary contact name</Label>
                  <Input id="cn" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="cp">Phone</Label>
                  <Input id="cp" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={async () => {
                    const ok = await upsert({
                      business_name: businessName,
                      contact_name: contactName,
                      contact_phone: contactPhone,
                      profile_done: !!(businessName && contactName),
                    });
                    if (ok) next();
                  }}
                  disabled={saving || !businessName || !contactName}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Save & continue
                </Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Connect your Meta ad account</h2>
              <p className="text-sm text-muted-foreground">
                We use Meta to manage your ads and pull performance data. You'll be redirected to Facebook to grant access.
              </p>
              <div className="rounded-md bg-muted/50 border border-border p-3 text-xs text-muted-foreground">
                Your agency will see only the ad accounts you grant access to. You can revoke access anytime from your Meta Business settings.
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={prev}>Back</Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={async () => { await upsert({ meta_done: false }); next(); }}>
                    Skip for now
                  </Button>
                  <Button
                    onClick={async () => {
                      await upsert({ meta_done: true });
                      toast.info("Opening Meta connection…");
                      // The actual OAuth start lives in MetaConnectionsPanel; just mark intent and continue.
                      next();
                    }}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Mark connected & continue
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Add billing method</h2>
              <p className="text-sm text-muted-foreground">
                Set up automatic top-ups for your ad spend wallet. You can add a payment method later from the Billing page.
              </p>
              <div className="rounded-md bg-muted/50 border border-border p-3 text-xs text-muted-foreground">
                Billing flows through your agency. You'll be prompted to add a card via Stripe on the Billing page once your account is approved.
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={prev}>Back</Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={async () => { await upsert({ billing_done: false }); next(); }}>
                    Skip for now
                  </Button>
                  <Button onClick={async () => { await upsert({ billing_done: true }); next(); }} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Mark complete & continue
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Brand assets</h2>
              <div>
                <Label htmlFor="bc">Brand primary color</Label>
                <div className="flex items-center gap-2">
                  <Input id="bc" type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="w-16 h-9 p-1" />
                  <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="flex-1" />
                </div>
              </div>
              <div>
                <Label htmlFor="bn2">Notes for creative team</Label>
                <Textarea id="bn2" value={brandNotes} onChange={(e) => setBrandNotes(e.target.value)} rows={4} placeholder="Tone, audience, must-avoid topics, sample messaging…" />
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={prev}>Back</Button>
                <Button
                  onClick={async () => {
                    await upsert({
                      brand_primary_color: brandColor,
                      brand_notes: brandNotes,
                      brand_done: true,
                    });
                    completeAll();
                  }}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Finish setup
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className="mt-4 text-center">
          <button onClick={() => navigate("/portal")} className="text-xs text-muted-foreground hover:underline">
            Skip onboarding for now
          </button>
        </div>
      </div>
    </div>
  );
}
