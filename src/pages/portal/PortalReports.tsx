import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePortalClient } from "@/hooks/usePortalClient";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, Eye, Copy, CalendarClock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PortalReports() {
  const { clientId } = usePortalClient();
  const qc = useQueryClient();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const reports = useQuery({
    queryKey: ["portal-reports", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_reports")
        .select("id, period_start, period_end, status, share_token, commentary, generated_at, trigger_type")
        .eq("client_id", clientId!)
        .order("generated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const schedules = useQuery({
    queryKey: ["portal-report-schedules", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_report_schedules")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const generateNow = useMutation({
    mutationFn: async () => {
      const end = new Date();
      const start = new Date(end);
      start.setDate(end.getDate() - 7);
      const { data, error } = await supabase.functions.invoke("report-generate", {
        body: {
          clientId,
          periodStart: start.toISOString().slice(0, 10),
          periodEnd: end.toISOString().slice(0, 10),
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Report generated");
      qc.invalidateQueries({ queryKey: ["portal-reports", clientId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to generate"),
  });

  const deleteSchedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_report_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Schedule removed");
      qc.invalidateQueries({ queryKey: ["portal-report-schedules", clientId] });
    },
  });

  function copyLink(token: string) {
    const url = `${window.location.origin}/r/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            View performance reports and schedule automatic delivery.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setEditing(null); setScheduleOpen(true); }}>
            <CalendarClock className="h-4 w-4 mr-1.5" /> Schedules
          </Button>
          <Button onClick={() => generateNow.mutate()} disabled={generateNow.isPending}>
            Generate now
          </Button>
        </div>
      </div>

      {/* Schedules summary */}
      {(schedules.data?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-sm font-semibold">Active schedules</h2>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setScheduleOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> New
            </Button>
          </div>
          <div className="divide-y divide-border">
            {schedules.data!.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium capitalize">
                    {s.cadence}
                    {s.cadence === "weekly" && s.day_of_week != null && ` · ${DOW[s.day_of_week]}`}
                    {s.cadence === "monthly" && s.day_of_month && ` · day ${s.day_of_month}`}
                    {" · "}{String(s.send_hour ?? 9).padStart(2, "0")}:00 UTC
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(s.recipients ?? []).length > 0
                      ? `To: ${(s.recipients ?? []).join(", ")}`
                      : "No recipients — reports will be viewable via link"}
                    {s.next_run_at && ` · Next: ${new Date(s.next_run_at).toLocaleString()}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(s); setScheduleOpen(true); }}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteSchedule.mutate(s.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reports list */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold">Generated reports</h2>
        </div>
        {reports.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : (reports.data?.length ?? 0) === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No reports yet. Click "Generate now" to create one.
          </div>
        ) : (
          reports.data!.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {r.period_start} → {r.period_end}
                  <span className="ml-2 text-xs text-muted-foreground capitalize">· {r.trigger_type}</span>
                </p>
                {r.commentary && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xl">{r.commentary}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  Generated {formatDistanceToNow(new Date(r.generated_at), { addSuffix: true })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold uppercase",
                    r.status === "ready"
                      ? "bg-success/10 text-success"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  {r.status}
                </span>
                {r.share_token && (
                  <>
                    <Button asChild size="sm" variant="outline">
                      <a href={`/r/${r.share_token}`} target="_blank" rel="noreferrer">
                        <Eye className="h-4 w-4 mr-1.5" /> View
                      </a>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => copyLink(r.share_token)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        clientId={clientId}
        initial={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["portal-report-schedules", clientId] })}
      />
    </div>
  );
}

function ScheduleDialog({
  open,
  onOpenChange,
  clientId,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: number | null;
  initial: any;
  onSaved: () => void;
}) {
  const [cadence, setCadence] = useState<string>(initial?.cadence ?? "weekly");
  const [dow, setDow] = useState<number>(initial?.day_of_week ?? 1);
  const [dom, setDom] = useState<number>(initial?.day_of_month ?? 1);
  const [hour, setHour] = useState<number>(initial?.send_hour ?? 9);
  const [recipients, setRecipients] = useState<string>(
    Array.isArray(initial?.recipients) ? initial.recipients.join(", ") : "",
  );
  const [active, setActive] = useState<boolean>(initial?.active ?? true);
  const saving = useState(false);

  // reset when initial changes
  useState(() => {
    if (initial) {
      setCadence(initial.cadence);
      setDow(initial.day_of_week ?? 1);
      setDom(initial.day_of_month ?? 1);
      setHour(initial.send_hour ?? 9);
      setRecipients(Array.isArray(initial.recipients) ? initial.recipients.join(", ") : "");
      setActive(initial.active ?? true);
    }
  });

  async function save() {
    if (!clientId) return;
    const recips = recipients
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // compute next_run_at (server also recomputes after each run)
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(hour, 0, 0, 0);
    if (cadence === "daily") {
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    } else if (cadence === "weekly") {
      const delta = ((dow - next.getUTCDay() + 7) % 7) || 7;
      next.setUTCDate(next.getUTCDate() + delta);
    } else if (cadence === "monthly") {
      next.setUTCDate(dom);
      if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1);
    }

    const { data: client } = await supabase
      .from("clients")
      .select("workspace_id")
      .eq("id", clientId)
      .maybeSingle();

    const payload = {
      client_id: clientId,
      workspace_id: (client as any)?.workspace_id ?? null,
      cadence,
      day_of_week: cadence === "weekly" ? dow : null,
      day_of_month: cadence === "monthly" ? dom : null,
      send_hour: hour,
      recipients: recips,
      active,
      next_run_at: next.toISOString(),
    };

    const { error } = initial?.id
      ? await supabase.from("client_report_schedules").update(payload).eq("id", initial.id)
      : await supabase.from("client_report_schedules").insert(payload);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Schedule saved");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit schedule" : "New report schedule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cadence</Label>
            <Select value={cadence} onValueChange={setCadence}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly (default)</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {cadence === "weekly" && (
            <div className="space-y-1.5">
              <Label>Day of week</Label>
              <Select value={String(dow)} onValueChange={(v) => setDow(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOW.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {cadence === "monthly" && (
            <div className="space-y-1.5">
              <Label>Day of month</Label>
              <Input type="number" min={1} max={28} value={dom} onChange={(e) => setDom(Number(e.target.value))} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Send hour (UTC)</Label>
            <Input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} />
          </div>

          <div className="space-y-1.5">
            <Label>Recipients (comma-separated emails)</Label>
            <Input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="you@company.com, team@company.com" />
            <p className="text-xs text-muted-foreground">Reports are always accessible via the share link. Emails are optional.</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
