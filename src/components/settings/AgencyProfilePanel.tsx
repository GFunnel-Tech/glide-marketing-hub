import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Upload, Copy, Check, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  useAgencyProfile,
  useUpsertAgencyProfile,
  type AgencyProfile,
  type AgencyProfileInput,
} from "@/hooks/useAgencyProfile";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

const CURRENCIES = [
  "USD - US Dollar ($)", "EUR - Euro (€)", "GBP - British Pound (£)",
  "CAD - Canadian Dollar ($)", "AUD - Australian Dollar ($)", "INR - Indian Rupee (₹)",
];
const BUSINESS_TYPES = [
  "Sole Proprietorship", "Partnership", "LLC", "Corporation",
  "Non-Profit", "Government", "Other",
];
const INDUSTRIES = [
  "Advertising & Marketing", "Automotive", "Education", "Finance",
  "Healthcare", "Real Estate", "Retail & E-commerce", "Technology",
  "Travel & Hospitality", "Other",
];
const REGISTRATION_ID_TYPES = ["EIN", "DUNS", "CBN", "VAT", "Other"];
const NICHES = [
  "Agency", "Coaching & Consulting", "Home Services", "Legal",
  "Medical & Dental", "Real Estate", "SaaS", "Other",
];
const REGIONS = ["Africa", "Asia", "Europe", "Latin America", "USA and Canada"];
const COUNTRIES = [
  "United States", "Canada", "United Kingdom", "Australia",
  "India", "Germany", "France", "Other",
];
const TIME_ZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "Europe/London",
  "Europe/Paris", "Asia/Kolkata", "Australia/Sydney", "UTC",
];
const LANGUAGES = [
  "English (United States)", "English (United Kingdom)", "Spanish",
  "French", "German", "Portuguese",
];
const JOB_POSITIONS = [
  "CEO", "CFO", "COO", "Director", "Manager", "Owner", "Other",
];

type FormState = AgencyProfileInput;

function buildInitialState(profile: AgencyProfile | null, wsName?: string): FormState {
  return {
    logo_url: profile?.logo_url ?? null,
    friendly_business_name: profile?.friendly_business_name ?? wsName ?? "",
    legal_business_name: profile?.legal_business_name ?? "",
    business_email: profile?.business_email ?? "",
    business_phone: profile?.business_phone ?? "",
    branded_domain: profile?.branded_domain ?? "",
    business_website: profile?.business_website ?? "",
    business_niche: profile?.business_niche ?? "",
    business_currency: profile?.business_currency ?? "USD - US Dollar ($)",
    business_type: profile?.business_type ?? "",
    business_industry: profile?.business_industry ?? "",
    business_registration_id_type: profile?.business_registration_id_type ?? "",
    business_registration_number: profile?.business_registration_number ?? "",
    business_not_registered: profile?.business_not_registered ?? false,
    business_regions: profile?.business_regions ?? [],
    street_address: profile?.street_address ?? "",
    city: profile?.city ?? "",
    postal_code: profile?.postal_code ?? "",
    state_region: profile?.state_region ?? "",
    country: profile?.country ?? "United States",
    time_zone: profile?.time_zone ?? "America/New_York",
    platform_language: profile?.platform_language ?? "English (United States)",
    outbound_language: profile?.outbound_language ?? "",
    rep_first_name: profile?.rep_first_name ?? "",
    rep_last_name: profile?.rep_last_name ?? "",
    rep_email: profile?.rep_email ?? "",
    rep_job_position: profile?.rep_job_position ?? "",
    rep_phone: profile?.rep_phone ?? "",
  };
}

function FieldLabel({ children, hint, required }: { children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <Label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
      {children}
      {required && <span className="text-destructive">*</span>}
      {hint && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground/70" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </Label>
  );
}

function Card({ title, hint, children, footer }: {
  title: string; hint?: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-5 pt-5">
        <FieldLabel hint={hint}><span className="text-sm font-semibold text-foreground">{title}</span></FieldLabel>
      </div>
      <div className="space-y-4 p-5">{children}</div>
      {footer && <div className="flex justify-end border-t border-border px-5 py-3">{footer}</div>}
    </div>
  );
}

export function AgencyProfilePanel() {
  const { currentWorkspace } = useWorkspace();
  const { data: profile, isLoading } = useAgencyProfile();
  const upsert = useUpsertAgencyProfile();

  const [form, setForm] = useState<FormState>(() => buildInitialState(null, currentWorkspace?.name));
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Re-seed form whenever the loaded profile or workspace changes.
  useEffect(() => {
    setForm(buildInitialState(profile ?? null, currentWorkspace?.name));
  }, [profile, currentWorkspace?.id, currentWorkspace?.name]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleRegion = (region: string) => {
    const current = form.business_regions ?? [];
    set("business_regions", current.includes(region)
      ? current.filter((r) => r !== region)
      : [...current, region]);
  };

  const save = () => upsert.mutate(form);

  const handleLogoUpload = async (file: File) => {
    if (!currentWorkspace) return;
    if (file.size > 2.5 * 1024 * 1024) {
      toast.error("Logo must be no bigger than 2.5 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${currentWorkspace.id}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("agency-assets").upload(path, file, {
        cacheControl: "3600", upsert: true,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("agency-assets").getPublicUrl(path);
      set("logo_url", pub.publicUrl);
      toast.success("Logo uploaded — remember to save");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Logo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const copyLocationId = () => {
    if (!currentWorkspace) return;
    navigator.clipboard.writeText(currentWorkspace.id);
    setCopied(true);
    toast.success("Location ID copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const saveBtn = (
    <Button onClick={save} disabled={upsert.isPending}>
      {upsert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Update Information
    </Button>
  );

  if (!currentWorkspace) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Select a workspace to manage the agency profile.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading agency profile…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Agency Profile Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your agency profile information &amp; settings</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── General Information ─────────────────────────────── */}
        <Card title="General Information" footer={saveBtn}>
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <span>Location ID</span>
            <code className="rounded bg-accent px-2 py-0.5 text-foreground">{currentWorkspace.id}</code>
            <button onClick={copyLocationId} className="text-muted-foreground hover:text-foreground">
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-28 w-44 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-accent/40 transition-colors hover:border-primary/40"
            >
              {form.logo_url ? (
                <img src={form.logo_url} alt="Agency logo" className="h-full w-full object-contain" />
              ) : uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <Plus className="h-8 w-8 text-muted-foreground" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }}
            />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Agency Logo</p>
              <p className="text-xs text-muted-foreground">The proposed size is 350px * 180px. No bigger than 2.5 MB</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => set("logo_url", null)} disabled={!form.logo_url}>
                  Remove
                </Button>
              </div>
            </div>
          </div>

          <div>
            <FieldLabel>Friendly Business Name</FieldLabel>
            <Input value={form.friendly_business_name ?? ""} onChange={(e) => set("friendly_business_name", e.target.value)} className="mt-1" />
          </div>
          <div>
            <FieldLabel hint="Enter the exact legal business name, as registered with the EIN">Legal Business Name</FieldLabel>
            <Input value={form.legal_business_name ?? ""} onChange={(e) => set("legal_business_name", e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Business Email</FieldLabel>
              <Input type="email" value={form.business_email ?? ""} onChange={(e) => set("business_email", e.target.value)} placeholder="Business Email" className="mt-1" />
            </div>
            <div>
              <FieldLabel>Business Phone</FieldLabel>
              <Input value={form.business_phone ?? ""} onChange={(e) => set("business_phone", e.target.value)} placeholder="+1 833-839-0338" className="mt-1" />
            </div>
          </div>
          <div>
            <FieldLabel hint="A custom domain used for your client-facing links">Branded Domain</FieldLabel>
            <Input value={form.branded_domain ?? ""} onChange={(e) => set("branded_domain", e.target.value)} placeholder="Branded Domain" className="mt-1" />
          </div>
          <div>
            <FieldLabel>Business Website</FieldLabel>
            <Input value={form.business_website ?? ""} onChange={(e) => set("business_website", e.target.value)} placeholder="https://www.example.com/" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Business Niche</FieldLabel>
              <Select value={form.business_niche || undefined} onValueChange={(v) => set("business_niche", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choose one.." /></SelectTrigger>
                <SelectContent>{NICHES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel hint="Default currency for billing and reporting">Business Currency</FieldLabel>
              <Select value={form.business_currency || undefined} onValueChange={(v) => set("business_currency", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choose one.." /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* ── Business Physical Address ──────────────────────── */}
        <Card title="Business Physical Address" hint="Your registered business address" footer={saveBtn}>
          <div>
            <FieldLabel hint="Street address or PO Box">Street Address</FieldLabel>
            <Input value={form.street_address ?? ""} onChange={(e) => set("street_address", e.target.value)} placeholder="PO BOX 853" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>City</FieldLabel>
              <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} className="mt-1" />
            </div>
            <div>
              <FieldLabel>Postal/Zip Code</FieldLabel>
              <Input value={form.postal_code ?? ""} onChange={(e) => set("postal_code", e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <FieldLabel>State / Prov / Region</FieldLabel>
            <Input value={form.state_region ?? ""} onChange={(e) => set("state_region", e.target.value)} className="mt-1" />
          </div>
          <div>
            <FieldLabel>Country</FieldLabel>
            <Select value={form.country || undefined} onValueChange={(v) => set("country", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose one.." /></SelectTrigger>
              <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel required>Time Zone</FieldLabel>
            <Select value={form.time_zone || undefined} onValueChange={(v) => set("time_zone", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose one.." /></SelectTrigger>
              <SelectContent>{TIME_ZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel hint="Default language for the platform interface">Platform Language</FieldLabel>
            <Select value={form.platform_language || undefined} onValueChange={(v) => set("platform_language", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose one.." /></SelectTrigger>
              <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel hint="Language used for outbound communication custom values">Outbound communication language for custom values</FieldLabel>
            <Select value={form.outbound_language || undefined} onValueChange={(v) => set("outbound_language", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose one.." /></SelectTrigger>
              <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </Card>

        {/* ── Business Information ───────────────────────────── */}
        <Card title="Business Information" footer={saveBtn}>
          <div>
            <FieldLabel>Business Type</FieldLabel>
            <Select value={form.business_type || undefined} onValueChange={(v) => set("business_type", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Pick Business Type" /></SelectTrigger>
              <SelectContent>{BUSINESS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Business Industry</FieldLabel>
            <Select value={form.business_industry || undefined} onValueChange={(v) => set("business_industry", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Pick Business Industry" /></SelectTrigger>
              <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Business Registration ID Type</FieldLabel>
            <Select value={form.business_registration_id_type || undefined} onValueChange={(v) => set("business_registration_id_type", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Pick Business Registration ID Type" /></SelectTrigger>
              <SelectContent>{REGISTRATION_ID_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Business Registration Number</FieldLabel>
            <Input
              value={form.business_registration_number ?? ""}
              onChange={(e) => set("business_registration_number", e.target.value)}
              placeholder="Business Registration Number"
              className="mt-1"
              disabled={form.business_not_registered}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={form.business_not_registered ?? false}
              onCheckedChange={(c) => set("business_not_registered", c === true)}
            />
            My business is Not registered
          </label>
          <div>
            <FieldLabel>Business Regions of Operations</FieldLabel>
            <div className="mt-2 space-y-2">
              {REGIONS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={(form.business_regions ?? []).includes(r)}
                    onCheckedChange={() => toggleRegion(r)}
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>
        </Card>

        {/* ── Authorized Representative ──────────────────────── */}
        <Card title="Authorized Representative" footer={saveBtn}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>First Name</FieldLabel>
              <Input value={form.rep_first_name ?? ""} onChange={(e) => set("rep_first_name", e.target.value)} className="mt-1" />
            </div>
            <div>
              <FieldLabel>Last Name</FieldLabel>
              <Input value={form.rep_last_name ?? ""} onChange={(e) => set("rep_last_name", e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <FieldLabel>Representative Email</FieldLabel>
            <Input type="email" value={form.rep_email ?? ""} onChange={(e) => set("rep_email", e.target.value)} className="mt-1" />
          </div>
          <div>
            <FieldLabel>Job Position</FieldLabel>
            <Select value={form.rep_job_position || undefined} onValueChange={(v) => set("rep_job_position", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Pick Job Position" /></SelectTrigger>
              <SelectContent>{JOB_POSITIONS.map((j) => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Phone Number (With Country Code)</FieldLabel>
            <Input value={form.rep_phone ?? ""} onChange={(e) => set("rep_phone", e.target.value)} placeholder="Phone Number (With Country Code)" className="mt-1" />
          </div>
        </Card>
      </div>
    </div>
  );
}
