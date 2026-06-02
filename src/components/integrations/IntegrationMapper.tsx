import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, Link2, Unlink, CheckCircle2, AlertCircle, Plus, Wand2 } from "lucide-react";

type Client = {
  id: number;
  name: string;
  brand: string | null;
  ghl_location_id: string | null;
  clickup_list_id: string | null;
};
type GhlLoc = { id: string; location_id: string; name: string | null; business_name: string | null };
type MetaAcc = { id: string; act_id: string; account_name: string | null; client_id: number | null; business_name: string | null };

function norm(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function similarity(a: string, b: string) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bg = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const k = s.slice(i, i + 2);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  };
  const A = bg(a), B = bg(b);
  let inter = 0, total = 0;
  for (const [k, v] of A) { total += v; if (B.has(k)) inter += Math.min(v, B.get(k)!); }
  for (const v of B.values()) total += v;
  return total === 0 ? 0 : (2 * inter) / total;
}

export function IntegrationMapper() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const [tab, setTab] = useState<"ghl" | "meta" | "clickup">("ghl");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [ghlLocs, setGhlLocs] = useState<GhlLoc[]>([]);
  const [metaAccs, setMetaAccs] = useState<MetaAcc[]>([]);

  const load = async () => {
    if (!wsId) return;
    setLoading(true);
    const [c, g, m] = await Promise.all([
      (supabase as any).from("clients")
        .select("id,name,brand,ghl_location_id,clickup_list_id")
        .eq("workspace_id", wsId).order("name"),
      (supabase as any).from("ghl_locations")
        .select("id,location_id,name,business_name")
        .eq("workspace_id", wsId).order("name"),
      (supabase as any).from("meta_ad_accounts")
        .select("id,act_id,account_name,client_id,business_name")
        .eq("workspace_id", wsId).order("account_name"),
    ]);
    setClients(c.data || []);
    setGhlLocs(g.data || []);
    setMetaAccs(m.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [wsId]);

  const callFn = async (name: string, body: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    return fetch(
      `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/${name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(body),
      },
    );
  };

  const syncGhl = async () => {
    setSyncing(true);
    try {
      const resp = await callFn("ghl-locations-sync", { workspace_id: wsId, autoLink: true, threshold: 0.9 });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const detail = data?.detail || data?.error || `HTTP ${resp.status}`;
        const hint = data?.hint ? ` — ${data.hint}` : "";
        toast.error(`GHL sync failed: ${detail}${hint}`, { duration: 10000 });
        return;
      }
      toast.success(`Synced ${data?.locations ?? 0} locations · auto-linked ${data?.linked ?? 0} · ${data?.suggested ?? 0} to review`);
      load();
    } finally {
      setSyncing(false);
    }
  };

  const syncMeta = async () => {
    setSyncing(true);
    try {
      const resp = await callFn("meta-accounts-refresh", { workspace_id: wsId, threshold: 0.9 });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast.error(`Meta refresh failed: ${data?.error || resp.status}`, { duration: 8000 });
        return;
      }
      toast.success(`Refreshed ${data?.discovered ?? 0} accounts · auto-linked ${data?.linked ?? 0} · ${data?.suggested ?? 0} to review`);
      load();
    } finally {
      setSyncing(false);
    }
  };

  const linkGhl = async (clientId: number, locationId: string | null) => {
    const { error } = await (supabase as any).from("clients")
      .update({ ghl_location_id: locationId }).eq("id", clientId);
    if (error) toast.error(error.message); else { toast.success(locationId ? "Linked" : "Unlinked"); load(); }
  };

  const linkMeta = async (metaAccId: string, clientId: number | null) => {
    const { error } = await (supabase as any).from("meta_ad_accounts")
      .update({ client_id: clientId }).eq("id", metaAccId);
    if (error) toast.error(error.message); else { toast.success(clientId ? "Linked" : "Unlinked"); load(); }
  };

  const createClientFromMeta = async (acc: MetaAcc): Promise<number | null> => {
    if (!wsId) return null;
    const name = (acc.account_name || acc.act_id || "New Client").trim();
    const { data, error } = await (supabase as any).from("clients")
      .insert({ workspace_id: wsId, name, brand: acc.business_name || name })
      .select("id").single();
    if (error) { toast.error(error.message); return null; }
    const newId = data.id as number;
    const { error: linkErr } = await (supabase as any).from("meta_ad_accounts")
      .update({ client_id: newId }).eq("id", acc.id);
    if (linkErr) { toast.error(linkErr.message); return null; }
    return newId;
  };

  const handleCreateClient = async (acc: MetaAcc) => {
    const id = await createClientFromMeta(acc);
    if (id) { toast.success(`Client created from ${acc.account_name || acc.act_id}`); load(); }
  };

  const createClientsForAllUnmapped = async () => {
    const unmapped = metaAccs.filter(a => !a.client_id);
    if (!unmapped.length) { toast.info("No unmapped ad accounts"); return; }
    if (!confirm(`Create ${unmapped.length} new client${unmapped.length === 1 ? "" : "s"} from unmapped ad accounts?`)) return;
    let created = 0;
    for (const acc of unmapped) {
      const id = await createClientFromMeta(acc);
      if (id) created++;
    }
    toast.success(`Created ${created} client${created === 1 ? "" : "s"}`);
    load();
  };


  const updateClickup = async (clientId: number, listId: string) => {
    const { error } = await (supabase as any).from("clients")
      .update({ clickup_list_id: listId || null }).eq("id", clientId);
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  // Suggested matches for unmapped items
  const ghlRows = useMemo(() => {
    return ghlLocs.map((loc) => {
      const linkedClient = clients.find((c) => c.ghl_location_id === loc.location_id);
      let suggestion: { client: Client; score: number } | null = null;
      if (!linkedClient) {
        const candidates = clients.filter((c) => !c.ghl_location_id);
        let best = { client: null as Client | null, score: 0 };
        for (const c of candidates) {
          const score = Math.max(
            similarity(loc.name || "", c.name),
            similarity(loc.name || "", c.brand || ""),
            similarity(loc.business_name || "", c.name),
          );
          if (score > best.score) best = { client: c, score };
        }
        if (best.client && best.score > 0.5) suggestion = best as any;
      }
      return { loc, linkedClient, suggestion };
    });
  }, [ghlLocs, clients]);

  if (!wsId) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Integration Mapper</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Link GHL locations, Meta ad accounts, and ClickUp lists to clients in one place.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {tab === "ghl" && (
            <Button size="sm" onClick={syncGhl} disabled={syncing}>
              {syncing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Sync from GHL
            </Button>
          )}
          {tab === "meta" && (
            <Button size="sm" onClick={syncMeta} disabled={syncing}>
              {syncing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Refresh + automap
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(["ghl", "meta", "clickup"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "ghl" ? "GHL Locations" : t === "meta" ? "Meta Ad Accounts" : "ClickUp Lists"}
          </button>
        ))}
      </div>

      {tab === "ghl" && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            {ghlLocs.length} locations cached · {clients.filter(c => c.ghl_location_id).length} of {clients.length} clients linked
          </div>
          {ghlRows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No locations cached yet — click "Sync from GHL".</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b border-border">
                  <tr><th className="text-left py-2 px-2">GHL Location</th><th className="text-left py-2 px-2">Client</th><th className="text-left py-2 px-2">Status</th><th className="py-2 px-2"></th></tr>
                </thead>
                <tbody>
                  {ghlRows.map(({ loc, linkedClient, suggestion }) => (
                    <tr key={loc.id} className="border-b border-border/50">
                      <td className="py-2 px-2">
                        <div className="font-medium text-foreground">{loc.name || "Unnamed"}</div>
                        {loc.business_name && <div className="text-muted-foreground">{loc.business_name}</div>}
                      </td>
                      <td className="py-2 px-2">
                        <Select
                          value={linkedClient?.id?.toString() ?? suggestion?.client.id.toString() ?? ""}
                          onValueChange={(v) => linkGhl(parseInt(v), loc.location_id)}
                        >
                          <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Pick client…" /></SelectTrigger>
                          <SelectContent>
                            {clients.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2">
                        {linkedClient ? (
                          <Badge variant="outline" className="text-success border-success/40"><CheckCircle2 className="h-3 w-3 mr-1" />Linked</Badge>
                        ) : suggestion ? (
                          <Badge variant="outline" className="text-warning border-warning/40">Suggested {Math.round(suggestion.score * 100)}%</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground"><AlertCircle className="h-3 w-3 mr-1" />Unmapped</Badge>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {linkedClient && (
                          <Button size="sm" variant="ghost" onClick={() => linkGhl(linkedClient.id, null)}>
                            <Unlink className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "meta" && (() => {
        const bmOptions = Array.from(
          new Set(metaAccs.map(a => a.business_name || "No Business Manager"))
        ).sort();
        return <MetaMapTab metaAccs={metaAccs} clients={clients} bmOptions={bmOptions} linkMeta={linkMeta} onCreateClient={handleCreateClient} onCreateAllUnmapped={createClientsForAllUnmapped} />;
      })()}

      {tab === "clickup" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Per-client ClickUp list (overrides workspace default).</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b border-border">
                <tr><th className="text-left py-2 px-2">Client</th><th className="text-left py-2 px-2">ClickUp List ID</th></tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <ClickupRow key={c.id} client={c} onSave={updateClickup} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ClickupRow({ client, onSave }: { client: Client; onSave: (id: number, v: string) => void }) {
  const [v, setV] = useState(client.clickup_list_id ?? "");
  return (
    <tr className="border-b border-border/50">
      <td className="py-2 px-2 font-medium text-foreground">{client.name}</td>
      <td className="py-2 px-2">
        <div className="flex gap-2">
          <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="(use workspace default)" className="h-8 w-64" />
          <Button size="sm" variant="outline" onClick={() => onSave(client.id, v)}>
            <Link2 className="h-3 w-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function MetaMapTab({
  metaAccs,
  clients,
  bmOptions,
  linkMeta,
  onCreateClient,
  onCreateAllUnmapped,
}: {
  metaAccs: MetaAcc[];
  clients: Client[];
  bmOptions: string[];
  linkMeta: (id: string, clientId: number | null) => void;
  onCreateClient: (acc: MetaAcc) => Promise<void>;
  onCreateAllUnmapped: () => Promise<void>;
}) {
  const [bmFilter, setBmFilter] = useState<string>("__all__");
  const [search, setSearch] = useState("");
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const filtered = metaAccs.filter(a => {
    const bm = a.business_name || "No Business Manager";
    if (bmFilter !== "__all__" && bm !== bmFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (a.account_name || "").toLowerCase().includes(q) ||
      bm.toLowerCase().includes(q) ||
      a.act_id.toLowerCase().includes(q)
    );
  });
  const unmappedCount = metaAccs.filter(a => !a.client_id).length;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground flex-1 min-w-[200px]">
          {filtered.length} of {metaAccs.length} ad accounts · {metaAccs.filter(a => a.client_id).length} linked · {unmappedCount} unmapped
          {" · "}{bmOptions.length} BM{bmOptions.length === 1 ? "" : "s"}
        </div>
        <Select value={bmFilter} onValueChange={setBmFilter}>
          <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="All Business Managers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Business Managers</SelectItem>
            {bmOptions.map(bm => <SelectItem key={bm} value={bm}>{bm}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="h-8 w-48 text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={bulkBusy || unmappedCount === 0}
          onClick={async () => { setBulkBusy(true); try { await onCreateAllUnmapped(); } finally { setBulkBusy(false); } }}
          className="h-8 text-xs"
        >
          {bulkBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
          Create clients for all unmapped ({unmappedCount})
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left py-2 px-2">Meta Ad Account</th>
              <th className="text-left py-2 px-2">Business Manager</th>
              <th className="text-left py-2 px-2">Client</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((acc) => (
              <tr key={acc.id} className="border-b border-border/50">
                <td className="py-2 px-2">
                  <div className="font-medium text-foreground">{acc.account_name || acc.act_id}</div>
                  <div className="text-muted-foreground font-mono">{acc.act_id}</div>
                </td>
                <td className="py-2 px-2 text-muted-foreground">{acc.business_name || "—"}</td>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select
                      value={acc.client_id?.toString() ?? ""}
                      onValueChange={(v) => linkMeta(acc.id, v ? parseInt(v) : null)}
                    >
                      <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Pick client…" /></SelectTrigger>
                      <SelectContent>
                        {clients.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No clients yet</div>
                        )}
                        {clients.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {!acc.client_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={creatingId === acc.id}
                        onClick={async () => { setCreatingId(acc.id); try { await onCreateClient(acc); } finally { setCreatingId(null); } }}
                        className="h-8 text-xs"
                        title="Create a new client from this ad account and link it"
                      >
                        {creatingId === acc.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                        New client
                      </Button>
                    )}
                  </div>
                </td>
                <td className="py-2 px-2 text-right">
                  {acc.client_id && (
                    <Button size="sm" variant="ghost" onClick={() => linkMeta(acc.id, null)}>
                      <Unlink className="h-3 w-3" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No ad accounts match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

}
