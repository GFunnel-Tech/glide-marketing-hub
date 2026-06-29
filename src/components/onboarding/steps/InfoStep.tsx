import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import type { WizardContext } from "../OnboardingWizard";

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export function InfoStep({ ctx }: { ctx: WizardContext }) {
  const s = ctx.state;
  const [legalName, setLegalName] = useState(s?.legal_business_name ?? s?.business_name ?? "");
  const [brandName, setBrandName] = useState(s?.brand_display_name ?? "");
  const [contactName, setContactName] = useState(s?.contact_name ?? "");
  const [contactEmail, setContactEmail] = useState(s?.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(s?.contact_phone ?? "");
  const [nmls, setNmls] = useState(s?.nmls_id ?? "");
  const [tagline, setTagline] = useState(s?.brand_tagline ?? "");
  const [primaryColor, setPrimaryColor] = useState(s?.brand_primary_color ?? "#1B3F7B");
  const [tz, setTz] = useState(s?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/New_York");
  const [preferred, setPreferred] = useState(s?.preferred_contact ?? "email");
  const [notes, setNotes] = useState(s?.brand_notes ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!s) return;
    setLegalName(s.legal_business_name ?? s.business_name ?? "");
    setBrandName(s.brand_display_name ?? "");
    setContactName(s.contact_name ?? "");
    setContactEmail(s.contact_email ?? "");
    setContactPhone(s.contact_phone ?? "");
    setNmls(s.nmls_id ?? "");
    setTagline(s.brand_tagline ?? "");
    setPrimaryColor(s.brand_primary_color ?? "#1B3F7B");
    setTz(s.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/New_York");
    setPreferred(s.preferred_contact ?? "email");
    setNotes(s.brand_notes ?? "");
  }, [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const emailOk = !!contactEmail && /.+@.+\..+/.test(contactEmail);
  const phoneOk = !contactPhone || contactPhone.replace(/\D/g, "").length >= 7;
  const nmlsOk = !nmls || /^\d{3,9}$/.test(nmls.trim());

  const canContinue = !!legalName && !!brandName && !!contactName && emailOk && phoneOk && nmlsOk;

  const save = async (advance: boolean) => {
    setBusy(true);
    try {
      await ctx.save({
        legal_business_name: legalName,
        brand_display_name: brandName,
        business_name: legalName, // keep legacy column in sync
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        nmls_id: nmls || null,
        brand_tagline: tagline || null,
        brand_primary_color: primaryColor,
        time_zone: tz,
        preferred_contact: preferred,
        brand_notes: notes || null,
        info_done: canContinue,
        // also flip the legacy "profile_done" flag so the old portal flow
        // shows the right green check on this row.
        profile_done: canContinue,
      });
      if (advance) ctx.advance();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Business & contact</h2>
        <p className="text-sm text-muted-foreground mt-1">
          This appears on your ads and in our internal records — accuracy matters.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Legal business name" required>
          <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Acme Mortgage, LLC" />
        </Field>
        <Field label="Brand display name" required hint="What clients call you">
          <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Acme Lending" />
        </Field>
        <Field label="Primary contact name" required>
          <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </Field>
        <Field label="Contact email" required error={!emailOk && contactEmail ? "Looks invalid" : undefined}>
          <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </Field>
        <Field label="Phone" error={!phoneOk ? "Need at least 7 digits" : undefined}>
          <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="(555) 555-5555" />
        </Field>
        <Field label="NMLS #" hint="Digits only" error={!nmlsOk ? "3-9 digits" : undefined}>
          <Input value={nmls} onChange={(e) => setNmls(e.target.value)} placeholder="123456" />
        </Field>
        <Field label="Brand primary color">
          <div className="flex items-center gap-2">
            <Input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-14 h-9 p-1" />
            <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1" />
          </div>
        </Field>
        <Field label="Tagline">
          <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Time zone">
          <select
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </Field>
        <Field label="Preferred contact method">
          <select
            value={preferred}
            onChange={(e) => setPreferred(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="text">Text</option>
          </select>
        </Field>
      </div>

      <Field label="Notes for the creative team">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          placeholder="Tone, audience, must-avoid topics, sample messaging…" />
      </Field>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={ctx.back}>Back</Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => save(false)} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Save
          </Button>
          <Button onClick={() => save(true)} disabled={busy || !canContinue}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Save & continue
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label}{required ? " *" : ""}
        {hint ? <span className="text-muted-foreground font-normal"> — {hint}</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
