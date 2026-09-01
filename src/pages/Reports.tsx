import { useMemo, useState } from "react";
import { useVisibleClients } from "@/hooks/useVisibleClients";
import {
  useReportSchedules,
  useGeneratedReports,
  useSaveSchedule,
  useToggleSchedule,
  useDeleteSchedule,
  useGenerateReport,
  useDeliverReport,
  type ReportSchedule,
} from "@/hooks/useClientReports";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Download,
  Send,
  Loader2,
  CheckCircle,
  Clock,
  Plus,
  Trash2,
  Pencil,
  CalendarClock,
  FileText,
  Link as LinkIcon,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const statusStyles: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  ready: "bg-warning/15 text-warning",
  delivered: "bg-success/15 text-success",
};

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

interface DraftSchedule {
  id?: string;
  client_id: string;
  cadence: string;
  day_of_week: number;
  day_of_month: number;
  send_hour: number;
  recipients: string;
  active: boolean;
}

const emptyDraft: DraftSchedule = {
  client_id: "",
  cadence: "weekly",
  day_of_week: 1,
  day_of_month: 1,
  send_hour: 9,
  recipients: "",
  active: true,
};

export default function Reports() {
  const clients = useVisibleClients();
  const { data: schedules = [], isLoading: loadingSchedules } = useReportSchedules();
  const { data: reports = [], isLoading: loadingReports } = useGeneratedReports();
  const saveSchedule = useSaveSchedule();
  const toggleSchedule = useToggleSchedule();
  const deleteSchedule = useDeleteSchedule();
  const generate = useGenerateReport();
  const deliver = useDeliverReport();

  const [draft, setDraft] = useState<DraftSchedule | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [oneOff, setOneOff] = useState<{
    client_id: string;
    periodStart: string;
    periodEnd: string;
    recipients: string;
    send: boolean;
  } | null>(null);


  const clientName = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of clients as any[]) map.set(Number(c.id), c.brand || c.name || `Client #${c.id}`);
    return (id: number) => map.get(Number(id)) ?? `Client #${id}`;
  }, [clients]);

  const stats = useMemo(
    () => ({
      active: schedules.filter((s) => s.active).length,
      delivered: reports.filter((r) => r.status === "delivered").length,
      failed: reports.filter((r) => !!r.error_message).length,
    }),
    [schedules, reports],
  );

  const openNew = () => setDraft({ ...emptyDraft });

  const openOneOff = () => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 30);
    setOneOff({
      client_id: "",
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
      recipients: "",
      send: false,
    });
  };

  const runOneOff = async () => {
    if (!oneOff?.client_id) return toast.error("Pick a client");
    const recipients = oneOff.recipients
      .split(/[,\s]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));
    if (oneOff.send && recipients.length === 0) return toast.error("Add at least one recipient email");
    setBusyId("one-off");
    try {
      const res = await generate.mutateAsync({
        clientId: Number(oneOff.client_id),
        periodStart: oneOff.periodStart,
        periodEnd: oneOff.periodEnd,
        recipients,
        send: oneOff.send,
      });
      if (res?.delivery && res.delivery.ok === false) {
        toast.warning(`Report created, but email failed: ${res.delivery.error}`);
      } else {
        toast.success(oneOff.send ? "Report generated and emailed" : "Report generated");
      }
      setOneOff(null);
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed");
    } finally {
      setBusyId(null);
    }
  };
  const openEdit = (s: ReportSchedule) =>
    setDraft({
      id: s.id,
      client_id: String(s.client_id),
      cadence: s.cadence,
      day_of_week: s.day_of_week ?? 1,
      day_of_month: s.day_of_month ?? 1,
      send_hour: s.send_hour ?? 9,
      recipients: (s.recipients ?? []).join(", "),
      active: s.active,
    });

  const handleSave = async () => {
    if (!draft?.client_id) return toast.error("Pick a client");
    const recipients = draft.recipients
      .split(/[,\s]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));
    try {
      await saveSchedule.mutateAsync({
        id: draft.id,
        client_id: Number(draft.client_id),
        cadence: draft.cadence,
        day_of_week: draft.day_of_week,
        day_of_month: draft.day_of_month,
        send_hour: draft.send_hour,
        recipients,
        active: draft.active,
      });
      toast.success(draft.id ? "Schedule updated" : "Schedule created");
      setDraft(null);
    } catch (e: any) {
      toast.error(e.message ?? "Could not save schedule");
    }
  };

  const runNow = async (s: ReportSchedule) => {
    setBusyId(s.id);
    try {
      const res = await generate.mutateAsync({
        clientId: s.client_id,
        recipients: s.recipients,
        send: (s.recipients ?? []).length > 0,
      });
      if (res?.delivery && res.delivery.ok === false) {
        toast.warning(`Report created, but email failed: ${res.delivery.error}`);
      } else {
        toast.success("Report generated");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed");
    } finally {
      setBusyId(null);
    }
  };

  const resend = async (reportId: string) => {
    setBusyId(reportId);
    try {
      await deliver.mutateAsync({ reportId });
      toast.success("Report emailed");
    } catch (e: any) {
      toast.error(e.message ?? "Delivery failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Automated Reports</h1>
          <p className="text-sm text-muted-foreground">
            Scheduled PDF performance reports, generated and emailed to your clients.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={openOneOff} className="gap-1.5">
            <FileText className="h-4 w-4" /> Generate report
          </Button>
          <Button onClick={openNew} className="gap-1.5">
            <Plus className="h-4 w-4" /> New schedule
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Active Schedules", value: stats.active, icon: CalendarClock, tint: "bg-primary/10 text-primary" },
          { label: "Reports Delivered", value: stats.delivered, icon: CheckCircle, tint: "bg-success/10 text-success" },
          { label: "Needs Attention", value: stats.failed, icon: AlertTriangle, tint: "bg-destructive/10 text-destructive" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-5">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", s.tint)}>
              <s.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Schedules */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Schedules</h2>
        </div>
        {loadingSchedules ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : schedules.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No schedules yet. Create one to send reports automatically.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/40">
                {["Client", "Cadence", "Recipients", "Next run", "Last run", "Active", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-3 font-medium text-foreground">{clientName(s.client_id)}</td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">
                    {s.cadence}
                    {s.cadence === "weekly" && s.day_of_week != null ? ` · ${DAYS[s.day_of_week]}` : ""}
                    {s.cadence === "monthly" && s.day_of_month != null ? ` · day ${s.day_of_month}` : ""}
                    {` · ${String(s.send_hour ?? 9).padStart(2, "0")}:00 UTC`}
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-muted-foreground">
                    {(s.recipients ?? []).join(", ") || "— none —"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(s.next_run_at)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(s.last_run_at)}</td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={s.active}
                      onCheckedChange={(active) => toggleSchedule.mutate({ id: s.id, active })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => runNow(s)} disabled={busyId === s.id}>
                        {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run now"}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Delete this schedule?")) deleteSchedule.mutate(s.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Generated reports */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Generated reports</h2>
        </div>
        {loadingReports ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : reports.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No reports generated yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/40">
                {["Client", "Period", "Status", "Generated", "Sent", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-3 font-medium text-foreground">{clientName(r.client_id)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {fmtDate(r.period_start)} – {fmtDate(r.period_end)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        statusStyles[r.status] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {r.status === "delivered" ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {r.status}
                    </span>
                    {r.error_message && (
                      <p className="mt-1 max-w-[240px] text-xs text-destructive">{r.error_message}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(r.generated_at)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(r.sent_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {r.pdf_url && (
                        <a
                          href={r.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-xs hover:bg-accent/70"
                        >
                          <Download className="h-3 w-3" /> PDF
                        </a>
                      )}
                      {r.share_token && (
                        <a
                          href={`/r/${r.share_token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-xs hover:bg-accent/70"
                        >
                          <LinkIcon className="h-3 w-3" /> Share
                        </a>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => resend(r.id)} disabled={busyId === r.id}>
                        {busyId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Send className="mr-1 h-3 w-3" />
                            {r.sent_at ? "Resend" : "Send"}
                          </>
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit schedule" : "New report schedule"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select
                  value={draft.client_id}
                  onValueChange={(v) => setDraft({ ...draft, client_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {(clients as any[]).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.brand || c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Cadence</Label>
                  <Select value={draft.cadence} onValueChange={(v) => setDraft({ ...draft, cadence: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Send hour (UTC)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={draft.send_hour}
                    onChange={(e) => setDraft({ ...draft, send_hour: Number(e.target.value) })}
                  />
                </div>
              </div>

              {draft.cadence === "weekly" && (
                <div className="space-y-1.5">
                  <Label>Day of week</Label>
                  <Select
                    value={String(draft.day_of_week)}
                    onValueChange={(v) => setDraft({ ...draft, day_of_week: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d, i) => (
                        <SelectItem key={d} value={String(i)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {draft.cadence === "monthly" && (
                <div className="space-y-1.5">
                  <Label>Day of month</Label>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    value={draft.day_of_month}
                    onChange={(e) => setDraft({ ...draft, day_of_month: Number(e.target.value) })}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Recipients</Label>
                <Input
                  placeholder="client@example.com, owner@example.com"
                  value={draft.recipients}
                  onChange={(e) => setDraft({ ...draft, recipients: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated. Leave empty to generate the PDF without emailing.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-sm">Active</span>
                <Switch checked={draft.active} onCheckedChange={(active) => setDraft({ ...draft, active })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveSchedule.isPending}>
              {saveSchedule.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
