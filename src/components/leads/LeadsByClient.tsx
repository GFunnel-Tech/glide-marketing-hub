import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Inbox, Mail, Phone, RefreshCw, Loader2, Sparkles } from "lucide-react";
import { useMetaLeads, type MetaLead } from "@/hooks/useMetaLeads";
import { useClients } from "@/hooks/useDatabase";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLeadScoreIndex, useComputeLeadScores, type LeadGrade } from "@/hooks/useLeadScores";
import { LeadGradeBadge } from "./LeadGradeBadge";

interface Props {
  /** When set, only this client's group is shown and is auto-expanded. */
  clientId?: number;
  /** Compact mode: smaller padding, fewer rows per group. */
  compact?: boolean;
  /** Hide the sync/header chrome. */
  hideHeader?: boolean;
}

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

export function LeadsByClient({ clientId, compact, hideHeader }: Props) {
  const { data: leads = [], isLoading } = useMetaLeads(clientId);
  const { data: clients = [] } = useClients();
  const { currentWorkspace } = useWorkspace();
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [gradeFilter, setGradeFilter] = useState<LeadGrade | "ALL">("ALL");
  const { index: scoreIndex } = useLeadScoreIndex(clientId);
  const scoreMutation = useComputeLeadScores();

  const grouped = useMemo(() => {
    const map = new Map<string, { clientId: number | null; clientName: string; leads: MetaLead[] }>();
    for (const l of leads) {
      const key = String(l.client_id ?? "unmapped");
      const c = clients.find((x) => x.id === l.client_id);
      if (!map.has(key)) {
        map.set(key, {
          clientId: l.client_id,
          clientName: c?.name ?? (l.client_id ? `Client #${l.client_id}` : "Unmapped accounts"),
          leads: [],
        });
      }
      map.get(key)!.leads.push(l);
    }
    return Array.from(map.values()).sort((a, b) => b.leads.length - a.leads.length);
  }, [leads, clients]);

  const toggle = (k: string) =>
    setExpanded((e) => ({ ...e, [k]: !(k in e ? e[k] : !!clientId) }));

  const syncNow = async () => {
    if (!currentWorkspace) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-leads-sync", {
        body: { workspaceId: currentWorkspace.id },
      });
      if (error) throw error;
      toast.success(`Synced ${data?.leadsSynced ?? 0} leads`);
      qc.invalidateQueries({ queryKey: ["meta_leads"] });
      // Auto-score newly synced leads
      scoreMutation.mutate(undefined, {
        onSuccess: (r) => r.scored && toast.success(`Scored ${r.scored} leads`),
      });
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const scoreNow = () => {
    scoreMutation.mutate(undefined, {
      onSuccess: (r) => toast.success(`Scored ${r.scored} of ${r.attempted} leads`),
      onError: (e: any) => toast.error(e.message || "Scoring failed"),
    });
  };

  const filteredLeads = useMemo(() => {
    if (gradeFilter === "ALL") return leads;
    return leads.filter((l) => scoreIndex.get(`meta:${l.lead_id}`)?.grade === gradeFilter);
  }, [leads, gradeFilter, scoreIndex]);

  const limit = compact ? 5 : 50;

  return (
    <div className="rounded-lg border border-border bg-card">
      {!hideHeader && (
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Leads from Meta</h3>
            <p className="text-xs text-muted-foreground">
              {leads.length} lead{leads.length === 1 ? "" : "s"} · grouped by client · newest first
            </p>
          </div>
          <button
            onClick={syncNow}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Sync leads
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading leads…</div>
      ) : grouped.length === 0 ? (
        <div className="p-8 text-center space-y-2">
          <Inbox className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            No individual leads yet. Click <span className="font-medium">Sync leads</span> to pull them from Meta.
          </p>
          <p className="text-xs text-muted-foreground">
            (If your token doesn't include <code>leads_retrieval</code>, only aggregated counts will appear.)
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {grouped.map((g) => {
            const key = String(g.clientId ?? "unmapped");
            const isOpen = key in expanded ? expanded[key] : !!clientId;
            const visible = g.leads.slice(0, isOpen ? limit : 0);
            return (
              <div key={key}>
                <button
                  onClick={() => toggle(key)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    {g.clientId ? (
                      <Link
                        to={`/client/${g.clientId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm font-medium text-foreground hover:text-primary"
                      >
                        {g.clientName}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-muted-foreground italic">{g.clientName}</span>
                    )}
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {g.leads.length}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4">
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-xs text-muted-foreground">
                          <tr>
                            <th className="text-left font-medium px-3 py-2">Date</th>
                            <th className="text-left font-medium px-3 py-2">Name</th>
                            <th className="text-left font-medium px-3 py-2">Contact</th>
                            <th className="text-left font-medium px-3 py-2">Form</th>
                            {!compact && <th className="text-left font-medium px-3 py-2">Campaign</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((l) => (
                            <tr key={l.id} className="border-t border-border hover:bg-accent/30">
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(l.created_time)}</td>
                              <td className="px-3 py-2 font-medium text-foreground">{l.full_name || "—"}</td>
                              <td className="px-3 py-2 text-muted-foreground">
                                <div className="flex flex-col gap-0.5">
                                  {l.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{l.email}</span>}
                                  {l.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{l.phone}</span>}
                                  {!l.email && !l.phone && "—"}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{l.form_name || "—"}</td>
                              {!compact && <td className="px-3 py-2 text-muted-foreground">{l.campaign_name || "—"}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {g.leads.length > limit && (
                        <div className={cn("px-3 py-2 text-xs text-muted-foreground bg-muted/20")}>
                          Showing {limit} of {g.leads.length} leads
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
