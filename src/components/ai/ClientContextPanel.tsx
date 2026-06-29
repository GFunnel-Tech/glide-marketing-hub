import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, FileText, Globe, Building2, MapPin, Tag } from "lucide-react";
import { toast } from "sonner";

type Identity = {
  ai_context: string;
  website: string;
  bio: string;
  country: string;
  vertical: string;
};

const COUNTRY_OPTS = [
  { value: "", label: "—" },
  { value: "US", label: "United States" },
  { value: "Canada", label: "Canada" },
];
const VERTICAL_OPTS = [
  { value: "", label: "—" },
  { value: "home_buyer", label: "Home Buyer" },
  { value: "investor", label: "Investor" },
  { value: "refinance", label: "Refinance" },
  { value: "reverse_mortgage", label: "Reverse Mortgage" },
];

export function ClientContextPanel({ clientId }: { clientId: number }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["client_identity", clientId],
    queryFn: async (): Promise<Identity> => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("ai_context, website, bio, country, vertical")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return {
        ai_context: (data?.ai_context ?? "") as string,
        website: (data?.website ?? "") as string,
        bio: (data?.bio ?? "") as string,
        country: (data?.country ?? "") as string,
        vertical: (data?.vertical ?? "") as string,
      };
    },
  });

  const [form, setForm] = useState<Identity>({ ai_context: "", website: "", bio: "", country: "", vertical: "" });
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("clients")
        .update({
          ai_context: form.ai_context,
          website: form.website.trim() || null,
          bio: form.bio.trim() || null,
          country: form.country || null,
          vertical: form.vertical || null,
        })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client identity saved");
      qc.invalidateQueries({ queryKey: ["client_identity", clientId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const dirty =
    !!data &&
    (form.ai_context !== data.ai_context ||
      form.website !== data.website ||
      form.bio !== data.bio ||
      form.country !== data.country ||
      form.vertical !== data.vertical);

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Client Identity & AI Context
        </h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          The AI uses this on every scan and morning brief. Reference the client by their real
          business name everywhere — never by ID.
        </p>
      </div>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground flex items-center gap-1">
                <Globe className="h-3 w-3" /> Website
              </span>
              <Input
                value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value.slice(0, 300) }))}
                placeholder="https://acme.com"
                className="h-8 text-xs"
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Short Bio
              </span>
              <Input
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value.slice(0, 300) }))}
                placeholder="What does this business do?"
                className="h-8 text-xs"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Country / Region
              </span>
              <Input
                list="client-country-suggestions"
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value.slice(0, 80) }))}
                placeholder="e.g. US, Canada, UK, Australia…"
                className="h-8 text-xs"
              />
              <datalist id="client-country-suggestions">
                {COUNTRY_OPTS.filter((c) => c.value).map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </datalist>
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground flex items-center gap-1">
                <Tag className="h-3 w-3" /> Vertical / Niche
              </span>
              <Input
                list="client-vertical-suggestions"
                value={form.vertical}
                onChange={(e) => setForm((f) => ({ ...f, vertical: e.target.value.slice(0, 80) }))}
                placeholder="e.g. Home Buyer, Solar, Med Spa, SaaS…"
                className="h-8 text-xs"
              />
              <datalist id="client-vertical-suggestions">
                {VERTICAL_OPTS.filter((v) => v.value).map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </datalist>
            </label>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] text-muted-foreground">AI context (free-form)</span>
            <Textarea
              value={form.ai_context}
              onChange={(e) => setForm((f) => ({ ...f, ai_context: e.target.value.slice(0, 4000) }))}
              rows={6}
              placeholder={`e.g.\n• Target CAC: $80\n• Min daily leads: 5\n• Only takes leads M–F\n• Avg deal size: $5k\n• Don't pause weekend campaigns`}
              className="text-xs font-mono"
            />
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !dirty}>
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1" />
              )}
              Save
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
