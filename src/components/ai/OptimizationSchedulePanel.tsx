import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, CalendarClock, Play } from "lucide-react";
import { toast } from "sonner";

type Cadence = "daily" | "weekly";

interface ScheduleForm {
  active: boolean;
  cadence: Cadence;
  day_of_week: number; // 0-6
  run_hour: number; // 0-23
  timezone: string;
  prompt_override: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const defaults = (): ScheduleForm => ({
  active: true,
  cadence: "daily",
  day_of_week: 1,
  run_hour: 9,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  prompt_override: "",
});

export function OptimizationSchedulePanel({
  clientId,
  workspaceId,
}: {
  clientId: number;
  workspaceId: string;
}) {
  const qc = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ["client-optimization-schedule", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_optimization_schedules" as any)
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data as any;
    },
  });

  const { data: lastRuns = [] } = useQuery({
    queryKey: ["optimization-run-log", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("optimization_run_log" as any)
        .select("id,status,summary,triggered_at,error")
        .eq("client_id", clientId)
        .order("triggered_at", { ascending: false })
        .limit(3);
      return (data as any[]) ?? [];
    },
    refetchInterval: 30000,
  });

  const [form, setForm] = useState<ScheduleForm>(defaults());

  useEffect(() => {
    if (existing) {
      setForm({
        active: !!existing.active,
        cadence: (existing.cadence as Cadence) ?? "daily",
        day_of_week: existing.day_of_week ?? 1,
        run_hour: existing.run_hour ?? 9,
        timezone: existing.timezone ?? defaults().timezone,
        prompt_override: existing.prompt_override ?? "",
      });
    }
  }, [existing, clientId]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) throw new Error("Not signed in");
      const payload: any = {
        client_id: clientId,
        workspace_id: workspaceId,
        created_by: u.user.id,
        active: form.active,
        cadence: form.cadence,
        day_of_week: form.cadence === "weekly" ? form.day_of_week : null,
        run_hour: form.run_hour,
        timezone: form.timezone,
        prompt_override: form.prompt_override.trim() || null,
      };
      // If first save, let next_run_at default to now(); otherwise leave it alone.
      const { error } = await supabase
        .from("client_optimization_schedules" as any)
        .upsert(payload, { onConflict: "client_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Schedule saved");
      qc.invalidateQueries({ queryKey: ["client-optimization-schedule", clientId] });
    },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });

  const runNow = useMutation({
    mutationFn: async () => {
      if (!existing?.id) throw new Error("Save the schedule first");
      // Force due by setting next_run_at to now
      const { error } = await supabase
        .from("client_optimization_schedules" as any)
        .update({ next_run_at: new Date().toISOString(), active: true })
        .eq("id", existing.id);
      if (error) throw error;
      const { data, error: e2 } = await supabase.functions.invoke("ai-optimization-cron", { body: {} });
      if (e2) throw e2;
      return data;
    },
    onSuccess: () => {
      toast.success("Run kicked off");
      qc.invalidateQueries({ queryKey: ["optimization-run-log", clientId] });
      qc.invalidateQueries({ queryKey: ["client-optimization-schedule", clientId] });
      qc.invalidateQueries({ queryKey: ["ai-pending"] });
    },
    onError: (e: any) => toast.error(e.message || "Run failed"),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const update = <K extends keyof ScheduleForm>(k: K, v: ScheduleForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            Recurring Optimization
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1">
            Have the agent review &amp; optimize on a schedule.
          </p>
        </div>
        <Switch
          checked={form.active}
          onCheckedChange={(v) => update("active", v)}
          aria-label="Enable schedule"
        />
      </div>

      <div className={`space-y-3 ${form.active ? "" : "opacity-50 pointer-events-none"}`}>
        <div>
          <label className="text-[11px] font-medium text-foreground block mb-1">Cadence</label>
          <div className="flex gap-2">
            {(["daily", "weekly"] as Cadence[]).map((c) => (
              <button
                key={c}
                onClick={() => update("cadence", c)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs capitalize ${
                  form.cadence === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:bg-accent"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {form.cadence === "weekly" && (
          <div>
            <label className="text-[11px] font-medium text-foreground block mb-1">Day of week</label>
            <div className="flex gap-1">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  onClick={() => update("day_of_week", i)}
                  className={`flex-1 rounded-md border px-1 py-1.5 text-[11px] ${
                    form.day_of_week === i
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-accent"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-medium text-foreground block mb-1">Run at hour</label>
            <select
              value={form.run_hour}
              onChange={(e) => update("run_hour", parseInt(e.target.value, 10))}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-foreground block mb-1">Timezone</label>
            <input
              value={form.timezone}
              onChange={(e) => update("timezone", e.target.value)}
              placeholder="UTC"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-medium text-foreground block mb-1">
            Custom prompt <span className="text-muted-foreground">(optional)</span>
          </label>
          <textarea
            value={form.prompt_override}
            onChange={(e) => update("prompt_override", e.target.value)}
            rows={2}
            placeholder="e.g. Pause any ad with CPL > $80 and CTR < 1%"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs resize-none"
          />
        </div>
      </div>

      {existing?.next_run_at && form.active && (
        <p className="text-[10px] text-muted-foreground">
          Next run: {new Date(existing.next_run_at).toLocaleString()}
          {existing.last_run_at && ` · Last: ${new Date(existing.last_run_at).toLocaleString()} (${existing.last_status ?? "—"})`}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="flex-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save schedule
        </button>
        <button
          onClick={() => runNow.mutate()}
          disabled={runNow.isPending || !existing?.id}
          title={existing?.id ? "Run now" : "Save first"}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 flex items-center gap-1.5"
        >
          {runNow.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Run now
        </button>
      </div>

      {lastRuns.length > 0 && (
        <div className="border-t border-border pt-3 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Recent runs</p>
          {lastRuns.map((r) => (
            <div key={r.id} className="text-[11px] flex items-start gap-1.5">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full mt-1.5 ${
                  r.status === "ok" ? "bg-success" : r.status === "error" ? "bg-destructive" : "bg-warning"
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-foreground truncate">{r.summary || r.error || "(no summary)"}</p>
                <p className="text-muted-foreground">{new Date(r.triggered_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
