import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, Inbox, Loader2 } from "lucide-react";

type Suggestion = {
  id: string;
  source: "meta" | "ghl";
  source_ref: string;
  source_name: string | null;
  source_business_name: string | null;
  client_id: number;
  score: number;
  status: string;
  clients?: { name: string | null } | null;
};

export function MatchReviewQueue() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!wsId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("account_match_suggestions")
      .select("id, source, source_ref, source_name, source_business_name, client_id, score, status, clients(name)")
      .eq("workspace_id", wsId)
      .eq("status", "pending")
      .order("score", { ascending: false });
    if (error) toast.error(error.message);
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [wsId]);

  const approve = async (s: Suggestion) => {
    setBusyId(s.id);
    try {
      if (s.source === "meta") {
        const { error } = await (supabase as any)
          .from("meta_ad_accounts")
          .update({ client_id: s.client_id })
          .eq("id", s.source_ref);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("clients")
          .update({ ghl_location_id: s.source_ref })
          .eq("id", s.client_id);
        if (error) throw error;
      }
      await (supabase as any)
        .from("account_match_suggestions")
        .update({ status: "approved", resolved_at: new Date().toISOString() })
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

  if (!wsId) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Inbox className="h-4 w-4" /> Mapping review queue
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Medium-confidence matches (60–89%) found by the hourly autosync. Approve or skip each one.
          </p>
        </div>
        <Badge variant="outline">{items.length} pending</Badge>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          Nothing to review. Strong matches are auto-linked; weak ones are ignored.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2 px-2">Source</th>
                <th className="text-left py-2 px-2">Account</th>
                <th className="text-left py-2 px-2">Suggested client</th>
                <th className="text-left py-2 px-2">Score</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="border-b border-border/50">
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
                  <td className="py-2 px-2 font-medium text-foreground">
                    {s.clients?.name ?? `#${s.client_id}`}
                  </td>
                  <td className="py-2 px-2">
                    <Badge variant="outline" className="text-warning border-warning/40">
                      {Math.round(s.score * 100)}%
                    </Badge>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === s.id}
                        onClick={() => approve(s)}
                      >
                        {busyId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === s.id}
                        onClick={() => reject(s)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
