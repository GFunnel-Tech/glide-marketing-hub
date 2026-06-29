import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, RefreshCw, Send, Check, X, Pencil, TrendingUp, TrendingDown, Calendar, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Brief = {
  id: string;
  workspace_id: string;
  client_id: number;
  trigger_kind: string;
  severity: "info" | "warning" | "critical";
  metrics: any;
  seasonal_context: string | null;
  subject: string;
  body_markdown: string;
  recipients: string[];
  status: "draft" | "approved" | "rejected" | "sent" | "failed";
  reviewer_notes: string | null;
  approved_at: string | null;
  sent_at: string | null;
  error: string | null;
  created_at: string;
  clients?: { name: string } | null;
};

const KIND_LABEL: Record<string, string> = {
  cpm_spike: "CPM spike",
  cpl_spike: "CPL spike",
  leads_drop: "Leads drop",
  weekly_digest: "Weekly digest",
  seasonal: "Seasonal pressure",
  manual: "Manual",
};

function KindIcon({ kind }: { kind: string }) {
  if (kind === "leads_drop") return <TrendingDown className="h-4 w-4" />;
  if (kind === "weekly_digest") return <Calendar className="h-4 w-4" />;
  if (kind === "seasonal") return <Sparkles className="h-4 w-4" />;
  return <TrendingUp className="h-4 w-4" />;
}

function severityClass(s: string) {
  if (s === "critical") return "bg-red-50 text-red-700 border-red-200";
  if (s === "warning") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

export default function TrendBriefs() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Brief | null>(null);
  const [tab, setTab] = useState("draft");

  const { data: briefs, isLoading } = useQuery({
    queryKey: ["trend-briefs", workspaceId, tab],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_trend_briefs")
        .select("*, clients!inner(name)")
        .eq("workspace_id", workspaceId!)
        .eq("status", tab)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Brief[];
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("client-trend-briefs-cron", {
        body: { workspaceId, force: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      const count = (d?.results ?? []).reduce((a: number, r: any) => a + (r.drafts?.length ?? 0), 0);
      toast.success(count ? `Generated ${count} draft brief${count > 1 ? "s" : ""}` : "No trends detected right now");
      qc.invalidateQueries({ queryKey: ["trend-briefs"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Generation failed"),
  });

  const updateBrief = useMutation({
    mutationFn: async (b: Partial<Brief> & { id: string }) => {
      const { error } = await supabase.from("client_trend_briefs").update(b).eq("id", b.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trend-briefs"] });
      setEditing(null);
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("client_trend_briefs")
        .update({ status: "approved", approved_at: new Date().toISOString(), reviewer_id: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Approved — ready to send"); qc.invalidateQueries({ queryKey: ["trend-briefs"] }); },
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_trend_briefs").update({ status: "rejected" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rejected"); qc.invalidateQueries({ queryKey: ["trend-briefs"] }); },
  });

  const send = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("client-trend-brief-send", { body: { briefId: id } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Send failed");
      return data;
    },
    onSuccess: () => { toast.success("Brief sent"); qc.invalidateQueries({ queryKey: ["trend-briefs"] }); },
    onError: (e: any) => toast.error(e.message ?? "Send failed"),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Client Trend Briefs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-drafted client emails when CPM, CPL or lead trends spike. Review, edit and approve before sending.
          </p>
        </div>
        <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
          {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Scan trends now
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="draft">Drafts</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-3">
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && !briefs?.length && (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              No {tab} briefs. {tab === "draft" && "Click \"Scan trends now\" to generate."}
            </CardContent></Card>
          )}
          {briefs?.map((b) => (
            <Card key={b.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={severityClass(b.severity)}>
                        <KindIcon kind={b.trigger_kind} />
                        <span className="ml-1.5">{KIND_LABEL[b.trigger_kind] ?? b.trigger_kind}</span>
                      </Badge>
                      <span className="font-medium">{b.clients?.name ?? `Client #${b.client_id}`}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <CardTitle className="text-base font-semibold">{b.subject}</CardTitle>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {tab === "draft" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(b)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => reject.mutate(b.id)}><X className="h-4 w-4" /></Button>
                        <Button size="sm" onClick={() => approve.mutate(b.id)}><Check className="h-4 w-4 mr-1" />Approve</Button>
                      </>
                    )}
                    {tab === "approved" && (
                      <Button size="sm" onClick={() => send.mutate(b.id)} disabled={send.isPending}>
                        {send.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                        Send
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {b.metrics?.change_pct && (
                  <div className="flex gap-4 text-xs text-muted-foreground border-b pb-2">
                    <span>CPM Δ <strong className={b.metrics.change_pct.cpm > 0 ? "text-red-600" : "text-green-600"}>{b.metrics.change_pct.cpm > 0 ? "+" : ""}{b.metrics.change_pct.cpm}%</strong></span>
                    <span>CPL Δ <strong className={b.metrics.change_pct.cpl > 0 ? "text-red-600" : "text-green-600"}>{b.metrics.change_pct.cpl > 0 ? "+" : ""}{b.metrics.change_pct.cpl}%</strong></span>
                    <span>Leads Δ <strong className={b.metrics.change_pct.leads < 0 ? "text-red-600" : "text-green-600"}>{b.metrics.change_pct.leads > 0 ? "+" : ""}{b.metrics.change_pct.leads}%</strong></span>
                  </div>
                )}
                <div className="whitespace-pre-wrap text-foreground/90 max-h-48 overflow-y-auto">{b.body_markdown}</div>
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  Recipients: {b.recipients?.length ? b.recipients.join(", ") : <span className="text-amber-600">none configured — add on client profile</span>}
                </div>
                {b.error && <div className="text-xs text-red-600">Error: {b.error}</div>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit brief</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Subject</Label>
                <Input value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
              </div>
              <div>
                <Label>Body (markdown)</Label>
                <Textarea rows={14} value={editing.body_markdown} onChange={(e) => setEditing({ ...editing, body_markdown: e.target.value })} />
              </div>
              <div>
                <Label>Recipients (comma separated)</Label>
                <Input value={editing.recipients?.join(", ") ?? ""} onChange={(e) => setEditing({ ...editing, recipients: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editing && updateBrief.mutate({ id: editing.id, subject: editing.subject, body_markdown: editing.body_markdown, recipients: editing.recipients })}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
