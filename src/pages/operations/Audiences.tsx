import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Users, Database, Plus, RefreshCw, Upload, Sparkles, Globe, Copy, Trash2, Activity,
} from "lucide-react";

type Audience = {
  id: string;
  name: string;
  subtype?: string;
  description?: string;
  approximate_count_lower_bound?: number;
  delivery_status?: { code: number; description: string };
  retention_days?: number;
  time_updated?: number;
};

type Dataset = { id: string; name: string; last_fired_time?: string; creation_time?: string };

async function callFn(fn: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let detail = error.message;
    try { detail = (await (error as any).context?.text?.()) || detail; } catch { /* noop */ }
    try { const parsed = JSON.parse(detail); detail = parsed.error || detail; } catch { /* noop */ }
    throw new Error(detail);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

function parseCsv(text: string): { email?: string; phone?: string }[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const emailIdx = header.findIndex((h) => h.includes("email"));
  const phoneIdx = header.findIndex((h) => h.includes("phone") || h.includes("mobile"));
  const hasHeader = emailIdx >= 0 || phoneIdx >= 0;
  const rows = hasHeader ? lines.slice(1) : lines;
  return rows.map((line) => {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (!hasHeader) {
      const v = cells[0] ?? "";
      return v.includes("@") ? { email: v } : { phone: v };
    }
    return {
      email: emailIdx >= 0 ? cells[emailIdx] : undefined,
      phone: phoneIdx >= 0 ? cells[phoneIdx] : undefined,
    };
  }).filter((r) => r.email || r.phone);
}

export default function Audiences() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const qc = useQueryClient();
  const [adAccountId, setAdAccountId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["meta_ad_accounts_audiences", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("meta_ad_accounts")
        .select("id, act_id, account_name").eq("workspace_id", wsId).order("account_name");
      return (data ?? []) as { id: string; act_id: string; account_name: string }[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients_for_audiences", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("clients")
        .select("id, name").eq("workspace_id", wsId).order("name");
      return (data ?? []) as { id: number; name: string }[];
    },
  });

  const activeAct = useMemo(
    () => accounts.find((a) => a.act_id === adAccountId) ?? accounts[0],
    [accounts, adAccountId],
  );
  const actId = activeAct?.act_id ?? "";

  const audiencesQ = useQuery({
    queryKey: ["meta_audiences", wsId, actId],
    enabled: !!wsId && !!actId,
    queryFn: async () => {
      const res = await callFn("meta-audiences", { workspaceId: wsId, adAccountId: actId, action: "list" });
      return (res.audiences ?? []) as Audience[];
    },
    retry: false,
  });

  const datasetsQ = useQuery({
    queryKey: ["meta_datasets", wsId, actId],
    enabled: !!wsId && !!actId,
    queryFn: async () => {
      const res = await callFn("meta-datasets", { workspaceId: wsId, adAccountId: actId, action: "list" });
      return (res.datasets ?? []) as Dataset[];
    },
    retry: false,
  });

  // ---- dialogs
  const [dlg, setDlg] = useState<null | "upload" | "leads" | "website" | "lookalike" | "dataset">(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [csvRecords, setCsvRecords] = useState<{ email?: string; phone?: string }[]>([]);

  const openDlg = (kind: typeof dlg) => { setForm({}); setCsvRecords([]); setDlg(kind); };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  const refreshAudiences = () => qc.invalidateQueries({ queryKey: ["meta_audiences", wsId, actId] });
  const refreshDatasets = () => qc.invalidateQueries({ queryKey: ["meta_datasets", wsId, actId] });

  const submitUpload = () => run(async () => {
    if (!form.name) throw new Error("Give the audience a name");
    if (!csvRecords.length) throw new Error("Upload a CSV with an email or phone column");
    const res = await callFn("meta-audiences", {
      workspaceId: wsId, adAccountId: actId, action: "create_customer_list",
      name: form.name, description: form.description, records: csvRecords,
    });
    toast.success(`Audience created — ${res.uploaded} records uploaded`);
    setDlg(null); refreshAudiences();
  });

  const submitLeads = () => run(async () => {
    if (!form.name || !form.clientId) throw new Error("Name and client are required");
    const res = await callFn("meta-audiences", {
      workspaceId: wsId, adAccountId: actId, action: "create_from_leads",
      name: form.name, clientId: Number(form.clientId), days: Number(form.days) || 180,
    });
    toast.success(`Audience created from ${res.sourced} leads — ${res.uploaded} matched records uploaded`);
    setDlg(null); refreshAudiences();
  });

  const submitWebsite = () => run(async () => {
    if (!form.name || !form.pixelId) throw new Error("Name and dataset are required");
    await callFn("meta-audiences", {
      workspaceId: wsId, adAccountId: actId, action: "create_website",
      name: form.name, pixelId: form.pixelId,
      retentionDays: Number(form.retentionDays) || 30, urlContains: form.urlContains || undefined,
    });
    toast.success("Website audience created");
    setDlg(null); refreshAudiences();
  });

  const submitLookalike = () => run(async () => {
    if (!form.name || !form.originAudienceId) throw new Error("Name and source audience are required");
    await callFn("meta-audiences", {
      workspaceId: wsId, adAccountId: actId, action: "create_lookalike",
      name: form.name, originAudienceId: form.originAudienceId,
      ratio: Number(form.ratio) || 0.01, country: form.country || "US",
    });
    toast.success("Lookalike audience created");
    setDlg(null); refreshAudiences();
  });

  const submitDataset = () => run(async () => {
    if (!form.name) throw new Error("Give the dataset a name");
    await callFn("meta-datasets", { workspaceId: wsId, adAccountId: actId, action: "create", name: form.name });
    toast.success("Dataset created");
    setDlg(null); refreshDatasets();
  });

  const deleteAudience = (a: Audience) => run(async () => {
    if (!confirm(`Delete "${a.name}" on Meta? This cannot be undone.`)) return;
    await callFn("meta-audiences", { workspaceId: wsId, action: "delete", audienceId: a.id, adAccountId: actId });
    toast.success("Audience deleted");
    refreshAudiences();
  });

  const fmt = (n?: number) => (typeof n === "number" ? n.toLocaleString() : "—");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Audiences & Datasets
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build custom audiences, lookalikes and pixel datasets directly on your Meta ad accounts.
          </p>
        </div>
        <div className="w-72">
          <Label className="text-xs">Ad account</Label>
          <Select value={actId} onValueChange={setAdAccountId}>
            <SelectTrigger><SelectValue placeholder="Select an ad account" /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.act_id}>{a.account_name || a.act_id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!actId && (
        <Card className="p-6 rounded-xl text-sm text-muted-foreground">
          Connect and map a Meta ad account first — Settings → Integrations → Account Mapping.
        </Card>
      )}

      {actId && (
        <Tabs defaultValue="audiences">
          <TabsList>
            <TabsTrigger value="audiences"><Users className="h-3.5 w-3.5 mr-1.5" />Audiences</TabsTrigger>
            <TabsTrigger value="datasets"><Database className="h-3.5 w-3.5 mr-1.5" />Datasets</TabsTrigger>
          </TabsList>

          <TabsContent value="audiences" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => openDlg("upload")}><Upload className="h-3.5 w-3.5 mr-1.5" />Upload customer list</Button>
              <Button size="sm" variant="outline" onClick={() => openDlg("leads")}><Sparkles className="h-3.5 w-3.5 mr-1.5" />From Glide Media leads</Button>
              <Button size="sm" variant="outline" onClick={() => openDlg("website")}><Globe className="h-3.5 w-3.5 mr-1.5" />Website (pixel)</Button>
              <Button size="sm" variant="outline" onClick={() => openDlg("lookalike")}><Copy className="h-3.5 w-3.5 mr-1.5" />Lookalike</Button>
              <Button size="sm" variant="ghost" onClick={refreshAudiences}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
            </div>

            {audiencesQ.isError && (
              <Card className="p-4 rounded-xl text-sm text-destructive">{(audiencesQ.error as Error).message}</Card>
            )}

            <Card className="rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">Audience</th>
                    <th className="text-left font-medium px-4 py-2.5">Type</th>
                    <th className="text-right font-medium px-4 py-2.5">Size</th>
                    <th className="text-left font-medium px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {audiencesQ.isLoading && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Loading audiences…</td></tr>
                  )}
                  {!audiencesQ.isLoading && !(audiencesQ.data ?? []).length && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No custom audiences yet.</td></tr>
                  )}
                  {(audiencesQ.data ?? []).map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{a.name}</div>
                        <div className="text-xs text-muted-foreground">{a.id}</div>
                      </td>
                      <td className="px-4 py-2.5"><Badge variant="secondary" className="text-[10px]">{a.subtype ?? "CUSTOM"}</Badge></td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(a.approximate_count_lower_bound)}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.delivery_status?.description ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button size="icon" variant="ghost" onClick={() => deleteAudience(a)} disabled={busy}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </TabsContent>

          <TabsContent value="datasets" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => openDlg("dataset")}><Plus className="h-3.5 w-3.5 mr-1.5" />New dataset</Button>
              <Button size="sm" variant="ghost" onClick={refreshDatasets}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
            </div>

            {datasetsQ.isError && (
              <Card className="p-4 rounded-xl text-sm text-destructive">{(datasetsQ.error as Error).message}</Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(datasetsQ.data ?? []).map((d) => (
                <Card key={d.id} className="p-5 rounded-xl">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Database className="h-5 w-5" />
                  </div>
                  <h2 className="mt-3 text-sm font-semibold">{d.name}</h2>
                  <p className="text-xs text-muted-foreground mt-1">ID {d.id}</p>
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <Activity className="h-3 w-3" />
                    {d.last_fired_time ? `Last fired ${new Date(d.last_fired_time).toLocaleString()}` : "No events received yet"}
                  </p>
                </Card>
              ))}
              {!datasetsQ.isLoading && !(datasetsQ.data ?? []).length && (
                <Card className="p-6 rounded-xl text-sm text-muted-foreground">No datasets on this ad account yet.</Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* ---------- Dialogs ---------- */}
      <Dialog open={dlg === "upload"} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload customer list</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Audience name</Label><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>
            <div><Label className="text-xs">Description</Label><Input value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
            <div>
              <Label className="text-xs">CSV file (email and/or phone column)</Label>
              <Input type="file" accept=".csv,text/csv" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const recs = parseCsv(await file.text());
                setCsvRecords(recs);
                if (!recs.length) toast.error("No email or phone values found in that CSV");
              }} />
              {!!csvRecords.length && <p className="text-xs text-muted-foreground mt-1">{csvRecords.length.toLocaleString()} records ready — hashed with SHA-256 before upload.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button>
            <Button onClick={submitUpload} disabled={busy}>{busy ? "Uploading…" : "Create audience"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === "leads"} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Audience from Glide Media leads</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Audience name</Label><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>
            <div>
              <Label className="text-xs">Client</Label>
              <Select value={form.clientId ?? ""} onValueChange={(v) => set("clientId", v)}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Lookback (days)</Label><Input type="number" value={form.days ?? "180"} onChange={(e) => set("days", e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button>
            <Button onClick={submitLeads} disabled={busy}>{busy ? "Building…" : "Create audience"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === "website"} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Website audience</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Audience name</Label><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>
            <div>
              <Label className="text-xs">Dataset (pixel)</Label>
              <Select value={form.pixelId ?? ""} onValueChange={(v) => set("pixelId", v)}>
                <SelectTrigger><SelectValue placeholder="Select dataset" /></SelectTrigger>
                <SelectContent>
                  {(datasetsQ.data ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Retention (days)</Label><Input type="number" value={form.retentionDays ?? "30"} onChange={(e) => set("retentionDays", e.target.value)} /></div>
            <div><Label className="text-xs">URL contains (optional)</Label><Input placeholder="/quotes" value={form.urlContains ?? ""} onChange={(e) => set("urlContains", e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button>
            <Button onClick={submitWebsite} disabled={busy}>{busy ? "Creating…" : "Create audience"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === "lookalike"} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lookalike audience</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Audience name</Label><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>
            <div>
              <Label className="text-xs">Source audience</Label>
              <Select value={form.originAudienceId ?? ""} onValueChange={(v) => set("originAudienceId", v)}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {(audiencesQ.data ?? []).filter((a) => a.subtype !== "LOOKALIKE").map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Similarity</Label>
              <Select value={form.ratio ?? "0.01"} onValueChange={(v) => set("ratio", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["0.01", "0.02", "0.03", "0.05", "0.1"].map((r) => (
                    <SelectItem key={r} value={r}>{Math.round(Number(r) * 100)}% — {r === "0.01" ? "closest match" : "broader reach"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Country</Label><Input value={form.country ?? "US"} onChange={(e) => set("country", e.target.value.toUpperCase())} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button>
            <Button onClick={submitLookalike} disabled={busy}>{busy ? "Creating…" : "Create lookalike"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === "dataset"} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>New dataset</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Dataset name</Label><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">Creates a Meta pixel / dataset on this ad account for website and Conversions API events.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button>
            <Button onClick={submitDataset} disabled={busy}>{busy ? "Creating…" : "Create dataset"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
