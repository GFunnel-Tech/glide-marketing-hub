import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileUp } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useClients } from "@/hooks/useDatabase";
import { useVisibleClients } from "@/hooks/useVisibleClients";
import { toast } from "sonner";

// Minimal CSV parser: comma-separated, supports quoted fields with commas.
function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase().trim());
  const rows = lines.slice(1).map((line) => {
    const cells = split(line);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
  return { headers, rows };
}

const pick = (r: Record<string, string>, keys: string[]) => {
  for (const k of keys) {
    const v = r[k] || r[k.replace(/\s+/g, "_")] || r[k.replace(/_/g, " ")];
    if (v) return v;
  }
  return "";
};

export function MetaLeadImport() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const clients = useVisibleClients();
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, string>[] }>({ headers: [], rows: [] });
  const [clientId, setClientId] = useState<string>("auto");
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File) => {
    const text = await f.text();
    setParsed(parseCSV(text));
  };

  const importMut = useMutation({
    mutationFn: async () => {
      if (!currentWorkspace) throw new Error("No workspace");
      if (!parsed.rows.length) throw new Error("Nothing to import");

      // Build campaign_id -> client_id lookup from meta_campaigns
      const campaignIds = Array.from(new Set(parsed.rows.map((r) => pick(r, ["campaign_id"])).filter(Boolean)));
      let campaignMap = new Map<string, number>();
      if (campaignIds.length) {
        const { data } = await (supabase as any)
          .from("meta_campaigns")
          .select("campaign_id, client_id")
          .eq("workspace_id", currentWorkspace.id)
          .in("campaign_id", campaignIds);
        campaignMap = new Map((data ?? []).map((c: any) => [String(c.campaign_id), c.client_id]));
      }

      const forcedClient = clientId === "auto" ? null : Number(clientId);
      const knownKeys = new Set([
        "id","lead_id","created_time","platform","is_organic",
        "ad_id","ad_name","adset_id","adset_name","campaign_id","campaign_name",
        "form_id","form_name","form",
        "full_name","full name","name","first_name","first name","last_name","last name",
        "email","email address","phone","phone_number","phone number",
      ]);

      const payload = parsed.rows.map((r) => {
        const campaign_id = pick(r, ["campaign_id"]) || null;
        const auto = campaign_id ? campaignMap.get(String(campaign_id)) ?? null : null;
        const first = pick(r, ["first_name", "first name"]);
        const last = pick(r, ["last_name", "last name"]);
        const full = pick(r, ["full_name", "full name", "name"]) || `${first} ${last}`.trim();
        const created = pick(r, ["created_time", "created time", "createdtime"]);
        return {
          workspace_id: currentWorkspace.id,
          client_id: forcedClient ?? auto,
          lead_id: pick(r, ["id", "lead_id"]) || null,
          full_name: full || null,
          email: pick(r, ["email", "email address"]) || null,
          phone: pick(r, ["phone_number", "phone number", "phone"]) || null,
          form_id: pick(r, ["form_id"]) || null,
          form_name: pick(r, ["form_name", "form"]) || null,
          campaign_id,
          campaign_name: pick(r, ["campaign_name"]) || null,
          ad_id: pick(r, ["ad_id"]) || null,
          ad_name: pick(r, ["ad_name"]) || null,
          adset_id: pick(r, ["adset_id"]) || null,
          adset_name: pick(r, ["adset_name"]) || null,
          platform: pick(r, ["platform"]) || "facebook",
          created_time: created ? new Date(created).toISOString() : new Date().toISOString(),
          field_data: Object.entries(r)
            .filter(([k, v]) => v && !knownKeys.has(k))
            .map(([k, v]) => ({ name: k, values: [v] })),
          stage: "intake",
        };
      });

      // Upsert on lead_id when present, insert otherwise
      const withId = payload.filter((p) => p.lead_id);
      const withoutId = payload.filter((p) => !p.lead_id);
      if (withId.length) {
        const { error } = await (supabase as any)
          .from("meta_leads")
          .upsert(withId, { onConflict: "lead_id" });
        if (error) throw error;
      }
      if (withoutId.length) {
        const { error } = await (supabase as any).from("meta_leads").insert(withoutId);
        if (error) throw error;
      }
      return payload.length;
    },
    onSuccess: (n) => {
      toast.success(`Imported ${n} Meta lead${n === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["channel_leads", "meta"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
      setParsed({ headers: [], rows: [] });
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: any) => toast.error(e?.message || "Import failed"),
  });

  const previewMatched = useMemo(() => {
    const ids = new Set(parsed.rows.map((r) => pick(r, ["campaign_id"])).filter(Boolean));
    return ids.size;
  }, [parsed]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileUp className="h-3.5 w-3.5 mr-1.5" /> Import Meta CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Meta leads from CSV</DialogTitle>
          <DialogDescription>
            Export leads from Meta Ads Manager or Forms Library, then upload the CSV here.
            Rows are matched to clients by <code>campaign_id</code> automatically, or you can force a target client.
            Duplicates (by <code>lead_id</code>) are updated in place.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-accent"
          />

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Assign to client</label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (match by campaign_id)</SelectItem>
                {clients.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.brand || c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {parsed.rows.length > 0 && (
            <div className="text-xs text-muted-foreground rounded-md border border-border p-3 max-h-40 overflow-y-auto">
              <div className="font-medium text-foreground mb-1">
                Preview ({parsed.rows.length} rows · {previewMatched} unique campaign IDs)
              </div>
              {parsed.rows.slice(0, 5).map((r, i) => (
                <div key={i} className="truncate">
                  {pick(r, ["full_name", "full name", "name"]) || "—"} · {pick(r, ["email", "email address"]) || "—"} · {pick(r, ["campaign_name"]) || "—"}
                </div>
              ))}
              {parsed.rows.length > 5 && <div className="text-muted-foreground/70">…and {parsed.rows.length - 5} more</div>}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => importMut.mutate()} disabled={!parsed.rows.length || importMut.isPending}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Import {parsed.rows.length || ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
