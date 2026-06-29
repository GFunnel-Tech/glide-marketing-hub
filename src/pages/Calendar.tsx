import { useMemo, useState } from "react";
import {
  addDays, addMonths, addWeeks, endOfDay, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek, subMonths, subWeeks,
} from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Briefcase, CheckSquare, Users, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCalendarEvents, CalendarEvent, CalendarSource } from "@/hooks/useCalendarEvents";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useQueryClient } from "@tanstack/react-query";

type View = "month" | "week" | "day";

const SOURCE_STYLES: Record<CalendarSource, { label: string; dot: string; chip: string; icon: any }> = {
  sales: { label: "Sales", dot: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", icon: Briefcase },
  client: { label: "Client", dot: "bg-violet-500", chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30", icon: Users },
  internal: { label: "Internal", dot: "bg-blue-500", chip: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30", icon: CheckSquare },
  google: { label: "Google Calendar", dot: "bg-amber-500", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30", icon: CalendarIcon },
};

export default function CalendarPage() {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [sources, setSources] = useState<Record<CalendarSource, boolean>>({
    sales: true, client: true, internal: true, google: true,
  });
  const [syncing, setSyncing] = useState(false);
  const { currentWorkspace } = useWorkspace();
  const qc = useQueryClient();

  async function syncGhl() {
    if (!currentWorkspace) return;
    setSyncing(true);
    const toastId = toast.loading("Syncing GHL appointments…");
    try {
      const { data, error } = await supabase.functions.invoke("ghl-appointments-sync", {
        body: { workspaceId: currentWorkspace.id, daysBack: 30, daysForward: 90 },
      });
      if (error) throw error;
      const r = data as any;
      toast.success(
        `Synced ${r?.events_upserted ?? 0} appointment${(r?.events_upserted ?? 0) === 1 ? "" : "s"} across ${r?.clients_processed ?? 0} clients`,
        { id: toastId },
      );
      await qc.invalidateQueries({ queryKey: ["calendar-events"] });
    } catch (e: any) {
      console.error("[calendar] ghl sync failed", e);
      toast.error(e?.message ?? "GHL sync failed", { id: toastId });
    } finally {
      setSyncing(false);
    }
  }

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === "month") {
      const monthStart = startOfMonth(cursor);
      const monthEnd = endOfMonth(cursor);
      return { rangeStart: startOfWeek(monthStart), rangeEnd: endOfWeek(monthEnd) };
    }
    if (view === "week") {
      return { rangeStart: startOfWeek(cursor), rangeEnd: endOfWeek(cursor) };
    }
    return { rangeStart: startOfDay(cursor), rangeEnd: endOfDay(cursor) };
  }, [view, cursor]);

  const { data: events = [], isLoading } = useCalendarEvents(rangeStart, rangeEnd);

  const visibleEvents = useMemo(
    () => events.filter((e) => sources[e.source]),
    [events, sources]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of visibleEvents) {
      const key = format(new Date(e.start), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [visibleEvents]);

  const navigate = (dir: -1 | 1) => {
    if (view === "month") setCursor((c) => (dir === 1 ? addMonths(c, 1) : subMonths(c, 1)));
    else if (view === "week") setCursor((c) => (dir === 1 ? addWeeks(c, 1) : subWeeks(c, 1)));
    else setCursor((c) => addDays(c, dir));
  };

  const headerLabel =
    view === "month" ? format(cursor, "MMMM yyyy") :
    view === "week"  ? `${format(rangeStart, "MMM d")} – ${format(rangeEnd, "MMM d, yyyy")}` :
                       format(cursor, "EEEE, MMM d, yyyy");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600">
            <CalendarIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
            <p className="text-sm text-muted-foreground">Sales, client appointments, and internal tasks.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={syncGhl} disabled={syncing} className="gap-2">
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync GHL"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[12rem] text-center text-sm font-medium">{headerLabel}</div>
          <Button variant="ghost" size="icon" onClick={() => navigate(1)} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="day">Day</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(SOURCE_STYLES) as CalendarSource[]).map((s) => {
          const conf = SOURCE_STYLES[s];
          const Icon = conf.icon;
          return (
            <Toggle
              key={s}
              pressed={sources[s]}
              onPressedChange={(p) => setSources((prev) => ({ ...prev, [s]: p }))}
              size="sm"
              className="gap-2 data-[state=on]:bg-muted"
            >
              <span className={cn("h-2 w-2 rounded-full", conf.dot)} />
              <Icon className="h-3.5 w-3.5" />
              {conf.label}
            </Toggle>
          );
        })}
        <div className="ml-auto text-xs text-muted-foreground">
          {isLoading ? "Loading…" : `${visibleEvents.length} event${visibleEvents.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {!sources.google ? null : (
        <Card className="border-dashed bg-amber-500/5 p-3 text-xs text-muted-foreground">
          Google Calendar isn’t connected yet. Link it in Settings → Integrations to pull personal events.
        </Card>
      )}

      <Card className="overflow-hidden">
        {view === "month" && <MonthView cursor={cursor} rangeStart={rangeStart} rangeEnd={rangeEnd} eventsByDay={eventsByDay} onPick={(d) => { setCursor(d); setView("day"); }} />}
        {view === "week" && <WeekView rangeStart={rangeStart} eventsByDay={eventsByDay} onPick={(d) => { setCursor(d); setView("day"); }} />}
        {view === "day" && <DayView day={cursor} events={visibleEvents.filter((e) => isSameDay(new Date(e.start), cursor))} />}
      </Card>
    </div>
  );
}

function EventChip({ e, compact }: { e: CalendarEvent; compact?: boolean }) {
  const conf = SOURCE_STYLES[e.source];
  return (
    <div className={cn("truncate rounded-md border px-1.5 py-0.5 text-[11px] leading-tight", conf.chip)}>
      {!compact && <span className="mr-1 font-medium">{format(new Date(e.start), "h:mma").toLowerCase()}</span>}
      {e.title}
    </div>
  );
}

function MonthView({
  cursor, rangeStart, rangeEnd, eventsByDay, onPick,
}: {
  cursor: Date; rangeStart: Date; rangeEnd: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  onPick: (d: Date) => void;
}) {
  const days: Date[] = [];
  for (let d = rangeStart; d <= rangeEnd; d = addDays(d, 1)) days.push(d);
  const weekdayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  return (
    <div>
      <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
        {weekdayNames.map((w) => (
          <div key={w} className="px-2 py-2 text-center">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const dayEvents = eventsByDay.get(key) ?? [];
          const inMonth = isSameMonth(d, cursor);
          const today = isSameDay(d, new Date());
          return (
            <button
              key={key}
              onClick={() => onPick(d)}
              className={cn(
                "min-h-[110px] border-b border-r p-1.5 text-left transition-colors hover:bg-muted/40",
                !inMonth && "bg-muted/20 text-muted-foreground/60",
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                  today && "bg-blue-500 text-white font-semibold"
                )}>
                  {format(d, "d")}
                </span>
                {dayEvents.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 3}</span>
                )}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <EventChip key={e.id} e={e} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  rangeStart, eventsByDay, onPick,
}: {
  rangeStart: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  onPick: (d: Date) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i));
  return (
    <div className="grid grid-cols-7">
      {days.map((d) => {
        const key = format(d, "yyyy-MM-dd");
        const list = eventsByDay.get(key) ?? [];
        const today = isSameDay(d, new Date());
        return (
          <div key={key} className="min-h-[420px] border-r last:border-r-0">
            <button onClick={() => onPick(d)} className="flex w-full items-center justify-between border-b px-3 py-2 text-left hover:bg-muted/40">
              <span className="text-xs uppercase text-muted-foreground">{format(d, "EEE")}</span>
              <span className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium",
                today && "bg-blue-500 text-white"
              )}>{format(d, "d")}</span>
            </button>
            <div className="space-y-1 p-2">
              {list.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-muted-foreground">—</div>
              ) : list.map((e) => <EventChip key={e.id} e={e} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ day, events }: { day: Date; events: CalendarEvent[] }) {
  const sorted = [...events].sort((a, b) => +new Date(a.start) - +new Date(b.start));
  return (
    <div className="divide-y">
      <div className="px-4 py-3 text-sm font-medium">{format(day, "EEEE, MMMM d")}</div>
      {sorted.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          Nothing scheduled.
        </div>
      ) : (
        sorted.map((e) => {
          const conf = SOURCE_STYLES[e.source];
          return (
            <div key={e.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40">
              <div className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
                {format(new Date(e.start), "h:mm a")}
              </div>
              <div className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", conf.dot)} />
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium">{e.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className={cn("text-[10px]", conf.chip)}>{conf.label}</Badge>
                  {e.status && <span className="capitalize">{e.status}</span>}
                  {e.end && <span>· ends {format(new Date(e.end), "h:mm a")}</span>}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
