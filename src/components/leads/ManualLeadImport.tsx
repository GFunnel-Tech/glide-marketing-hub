import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Upload, Plus } from "lucide-react";
import { useInsertManualLead } from "@/hooks/useChannelLeads";

// Minimal CSV parser: comma-separated, supports quoted fields with commas.
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length);
  if (!lines.length) return [];
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
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = split(line);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
}

export function ManualLeadImport() {
  const insert = useInsertManualLead();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File) => {
    const text = await f.text();
    setPreview(parseCSV(text));
  };

  const importNow = () => {
    if (!preview.length) return;
    const rows = preview.map((r) => ({
      full_name: r.name || r.full_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || null,
      email: r.email || null,
      phone: r.phone || r.phone_number || null,
      campaign_name: r.campaign || r.campaign_name || null,
      form_name: r.form || r.form_name || "Manual import",
      note: r.note || null,
      field_data: Object.entries(r)
        .filter(([k]) => !["name","full_name","first_name","last_name","email","phone","phone_number","campaign","campaign_name","form","form_name","note"].includes(k))
        .map(([k, v]) => ({ name: k, values: [v] })),
    }));
    insert.mutate(rows, {
      onSuccess: () => {
        setOpen(false);
        setPreview([]);
        if (fileRef.current) fileRef.current.value = "";
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import manual leads</DialogTitle>
          <DialogDescription>
            CSV with headers like <code>name, email, phone, campaign, note</code>. Extra columns become form answers.
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
          {preview.length > 0 && (
            <div className="text-xs text-muted-foreground rounded-md border border-border p-3 max-h-40 overflow-y-auto">
              <div className="font-medium text-foreground mb-1">Preview ({preview.length} rows)</div>
              {preview.slice(0, 5).map((r, i) => (
                <div key={i} className="truncate">
                  {r.name || r.full_name || "—"} · {r.email || "—"} · {r.phone || "—"}
                </div>
              ))}
              {preview.length > 5 && <div className="text-muted-foreground/70">…and {preview.length - 5} more</div>}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={importNow} disabled={!preview.length || insert.isPending}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Import {preview.length || ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
