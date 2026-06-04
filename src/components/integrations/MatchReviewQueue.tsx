import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Check, X, Inbox, Loader2, Plus, Archive, AlertTriangle, CheckCircle2 } from "lucide-react";

type Suggestion = {
  id: string;
  source: "meta" | "ghl";
  source_ref: string;
  source_name: string | null;
  source_business_name: string | null;
  client_id: number;
  score: number;
  status: string;
  resolved_at: string | null;
  clients?: { name: string | null } | null;
};

type ClientLite = { id: number; name: string | null; brand: string | null; ghl_location_id?: string | null };
type GhlLoc = { location_id: string; name: string | null; business_name: string | null };

const CREATE_NEW = "__create_new__";
const NONE = "__none__";
const ARCHIVE_DAYS = 30;

type TabKey = "active" | "pending" | "errors" | "archived";

export function MatchReviewQueue() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const [items, setItems] = useState<Suggestion[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [ghlLocations, setGhlLocations] = useState<GhlLoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("pending");
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [ghlSelections, setGhlSelections] = useState<Record<string, string>>({});
  const [newNames, setNewNames] = useState<Record<string, string>>({});

  const load = async () => {
    if (!wsId) return;
    setLoading(true);
    const [{ data: sData, error: sErr }, { data: cData, error: cErr }, { data: gData }] = await Promise.all([
      (supabase as any)
        .from("account_match_suggestions")
        .select("id, source, source_ref, source_name, source_business_name, client_id, score, status, resolved_at, clients(name)")
        .eq("workspace_id", wsId)
        .order("score", { ascending: false }),
      (supabase as any)
        .from("clients")
        .select("id, name, brand, ghl_location_id")
        .eq("workspace_id", wsId)
        .order("name", { ascending: true }),
      (supabase as any)
        .from("ghl_locations")
        .select("location_id, name, business_name")
        .eq("workspace_id", wsId)
        .order("name", { ascending: true }),
    ]);
    if (sErr) toast.error(sErr.message);
    if (cErr) toast.error(cErr.message);
    setItems(sData || []);
    setClients(cData || []);
    setGhlLocations(gData || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [wsId]);

  const buckets = useMemo(() => {
    const cutoff = Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
    const isArchived = (s: Suggestion) =>
      s.resolved_at && new Date(s.resolved_at).getTime() < cutoff;
    const active: Suggestion[] = [];
    const pending: Suggestion[] = [];
    const errors: Suggestion[] = [];
    const archived: Suggestion[] = [];
    for (const s of items) {
      if (isArchived(s)) { archived.push(s); continue; }
      if (s.status === "pending") pending.push(s);
      else if (s.status === "approved") active.push(s);
      else if (s.status === "rejected" || s.status === "failed") errors.push(s);
      else archived.push(s);
    }
    return { active, pending, errors, archived };
  }, [items]);

  const visible = buckets[tab];

  const resolveClientId = async (s: Suggestion): Promise<number | null> => {
    const sel = selections[s.id] ?? String(s.client_id);
    if (sel === CREATE_NEW) {
      const name = (newNames[s.id] || s.source_name || s.source_business_name || "").trim();
      if (!name) { toast.error("Enter a client name"); return null; }
      const { data, error } = await (supabase as any)
        .from("clients")
        .insert({ workspace_id: wsId, name, brand: name })
        .select("id")
        .single();
      if (error) { toast.error(error.message); return null; }
      return data.id as number;
    }
    return Number(sel);
  };

  const approve = async (s: Suggestion) => {
    setBusyId(s.id);
    try {
      const clientId = await resolveClientId(s);
      if (clientId == null) return;
      if (s.source === "meta") {
        const { error } = await (supabase as any)
          .from("meta_ad_accounts")
          .update({ client_id: clientId })
          .eq("id", s.source_ref);
        if (error) throw error;
        // Optionally link a GHL sub at the same time
        const ghlSel = ghlSelections[s.id];
        if (ghlSel && ghlSel !== NONE) {
          const { error: gErr } = await (supabase as any)
            .from("clients")
            .update({ ghl_location_id: ghlSel })
            .eq("id", clientId);
          if (gErr) throw gErr;
        }
      } else {
        const ghlRef = ghlSelections[s.id] && ghlSelections[s.id] !== NONE
          ? ghlSelections[s.id]
          : s.source_ref;
        const { error } = await (supabase as any)
          .from("clients")
          .update({ ghl_location_id: ghlRef })
          .eq("id", clientId);
        if (error) throw error;
      }
      await (supabase as any)
        .from("account_match_suggestions")
        .update({ status: "approved", client_id: clientId, resolved_at: new Date().toISOString() })
        .eq("id", s.id);
      toast.success("Linked");
      load();
    } catch (e: any) {
      toast.error(e.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (s: Suggestion) => {
    setBusyId(s.id);
    try {
      await (supabase as any)
        .from("account_match_suggestions")
        .update({ status: "rejected", resolved_at: new Date().toISOString() })
        .eq("id", s.id);
      load();
    } finally {
      setBusyId(null);
    }
  };

  const reopen = async (s: Suggestion) => {
    setBusyId(s.id);
    try {
      await (supabase as any)
        .from("account_match_suggestions")
        .update({ status: "pending", resolved_at: null })
        .eq("id", s.id);
      load();
    } finally {
      setBusyId(null);
    }
  };

  if (!wsId) return null;

  const tabMeta: { key: TabKey; label: string; icon: any; count: number }[] = [
    { key: "active",   label: "Active",   icon: CheckCircle2,  count: buckets.active.length },
    { key: "pending",  label: "Pending",  icon: Inbox,         count: buckets.pending.length },
    { key: "errors",   label: "Errors",   icon: AlertTriangle, count: buckets.errors.length },
    { key: "archived", label: "Archived", icon: Archive,       count: buckets.archived.length },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Inbox className="h-4 w-4" /> Mapping review queue
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Match Meta ad accounts and GHL sub-accounts to clients. Pick the suggested client, choose another, or create a new one.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="grid grid-cols-4 w-full">
          {tabMeta.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.key} value={t.key} className="gap-2">
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                  {t.count}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {tabMeta.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-4">
            {loading ? (
              <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
            ) : visible.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                {t.key === "pending" && "Nothing to review. Strong matches are auto-linked; weak ones are ignored."}
                {t.key === "active" && "No linked accounts yet."}
                {t.key === "errors" && "No rejected or failed mappings."}
                {t.key === "archived" && "Nothing archived."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left py-2 px-2">Source</th>
                      <th className="text-left py-2 px-2">Account</th>
                      <th className="text-left py-2 px-2 min-w-[220px]">Client</th>
                      <th className="text-left py-2 px-2 min-w-[200px]">GHL sub-account</th>
                      <th className="text-left py-2 px-2">Score</th>
                      <th className="py-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((s) => {
                      const sel = selections[s.id] ?? String(s.client_id);
                      const isPending = s.status === "pending";
                      return (
                        <tr key={s.id} className="border-b border-border/50 align-top">
                          <td className="py-2 px-2">
                            <Badge variant="outline" className={s.source === "meta" ? "text-primary border-primary/40" : "text-success border-success/40"}>
                              {s.source === "meta" ? "Meta" : "GHL"}
                            </Badge>
                          </td>
                          <td className="py-2 px-2">
                            <div className="font-medium text-foreground">{s.source_name || s.source_ref}</div>
                            {s.source_business_name && (
                              <div className="text-muted-foreground">{s.source_business_name}</div>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            {isPending ? (
                              <div className="space-y-1.5">
                                <Select
                                  value={sel}
                                  onValueChange={(v) => setSelections((p) => ({ ...p, [s.id]: v }))}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Select client" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {clients.map((c) => (
                                      <SelectItem key={c.id} value={String(c.id)} className="text-xs">
                                        {c.name ?? `#${c.id}`}
                                        {c.id === s.client_id ? "  · suggested" : ""}
                                      </SelectItem>
                                    ))}
                                    <SelectItem value={CREATE_NEW} className="text-xs">
                                      <span className="inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Create new client…</span>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                {sel === CREATE_NEW && (
                                  <Input
                                    autoFocus
                                    placeholder="New client name"
                                    className="h-8 text-xs"
                                    value={newNames[s.id] ?? (s.source_name || s.source_business_name || "")}
                                    onChange={(e) => setNewNames((p) => ({ ...p, [s.id]: e.target.value }))}
                                  />
                                )}
                              </div>
                            ) : (
                              <div className="font-medium text-foreground py-1">
                                {s.clients?.name ?? `#${s.client_id}`}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            {(() => {
                              const selectedClientId =
                                sel === CREATE_NEW ? null : Number(sel);
                              const selectedClient = clients.find((c) => c.id === selectedClientId);
                              const defaultGhl =
                                s.source === "ghl"
                                  ? s.source_ref
                                  : selectedClient?.ghl_location_id || NONE;
                              const ghlVal = ghlSelections[s.id] ?? defaultGhl;
                              if (!isPending) {
                                const linked = ghlLocations.find((l) => l.location_id === ghlVal);
                                return (
                                  <div className="text-foreground py-1">
                                    {linked?.name ?? (ghlVal && ghlVal !== NONE ? ghlVal : <span className="text-muted-foreground">—</span>)}
                                  </div>
                                );
                              }
                              return (
                                <Select
                                  value={ghlVal}
                                  onValueChange={(v) => setGhlSelections((p) => ({ ...p, [s.id]: v }))}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Select GHL sub-account" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={NONE} className="text-xs text-muted-foreground">
                                      None
                                    </SelectItem>
                                    {ghlLocations.map((l) => (
                                      <SelectItem key={l.location_id} value={l.location_id} className="text-xs">
                                        {l.name ?? l.location_id}
                                        {s.source === "ghl" && l.location_id === s.source_ref ? "  · suggested" : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              );
                            })()}
                          </td>
                          <td className="py-2 px-2">
                            <Badge variant="outline" className="text-warning border-warning/40">
                              {Math.round(s.score * 100)}%
                            </Badge>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <div className="flex justify-end gap-1">
                              {isPending ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busyId === s.id}
                                    onClick={() => approve(s)}
                                  >
                                    {busyId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                                    Link
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busyId === s.id}
                                    onClick={() => reject(s)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busyId === s.id}
                                  onClick={() => reopen(s)}
                                >
                                  Reopen
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
