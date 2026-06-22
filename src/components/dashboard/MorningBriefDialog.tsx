import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useMorningBrief, type MorningBriefTask } from "@/hooks/useMorningBrief";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Sparkles, AlertTriangle, TriangleAlert, Info, Loader2, RefreshCw, Sun, ListChecks, Flag, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const severityIcon = {
  critical: AlertTriangle,
  warn: TriangleAlert,
  info: Info,
};

// Pretty per-severity styling: tinted icon chip + matching left rail on the card.
const severityStyles: Record<"critical" | "warn" | "info", { chip: string; rail: string }> = {
  critical: {
    chip: "bg-destructive/10 text-destructive",
    rail: "before:bg-destructive/70",
  },
  warn: {
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rail: "before:bg-amber-500/70",
  },
  info: {
    chip: "bg-primary/10 text-primary",
    rail: "before:bg-primary/70",
  },
};

const priorityChip: Record<string, string> = {
  high: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
  normal: "bg-primary/10 text-primary ring-1 ring-primary/20",
  low: "bg-muted text-muted-foreground ring-1 ring-border",
};

function clientName(brief: any, clientId: number | null): string | null {
  if (clientId == null) return null;
  const c = (brief?.signals?.clients ?? []).find((x: any) => Number(x.id) === Number(clientId));
  return c?.name ?? `Client #${clientId}`;
}

/**
 * The morning brief surfaces once per day. On first load of the day (when no brief
 * row exists yet) it generates one and opens automatically. After the user applies
 * or dismisses it, the row's status flips and it no longer auto-opens — but it can
 * be reopened any time via the dashboard's "Morning Brief" button.
 */
export function MorningBriefDialog() {
  const { currentWorkspace } = useWorkspace();
  const { brief, isLoading, generate, apply, dismiss } = useMorningBrief();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const autoTriedRef = useRef<string | null>(null);

  // Generate-on-first-load and auto-open for a brand new brief.
  useEffect(() => {
    if (!currentWorkspace?.id || isLoading) return;
    const wsKey = currentWorkspace.id;
    if (!brief) {
      // Only attempt generation once per workspace per mount to avoid loops.
      if (autoTriedRef.current === wsKey || generate.isPending) return;
      autoTriedRef.current = wsKey;
      generate.mutate(
        {},
        {
          onSuccess: (b) => {
            if (b?.status === "new") setOpen(true);
          },
        },
      );
      return;
    }
    if (brief.status === "new") setOpen(true);
  }, [currentWorkspace?.id, isLoading, brief, generate]);

  // Default every suggested task to checked when the brief loads.
  useEffect(() => {
    if (!brief) return;
    const next: Record<number, boolean> = {};
    (brief.suggested_tasks ?? []).forEach((_, i) => (next[i] = true));
    setSelected(next);
  }, [brief?.id, brief?.suggested_tasks]);

  const tasks = brief?.suggested_tasks ?? [];
  const highlights = brief?.highlights ?? [];
  const selectedTasks = useMemo(
    () => tasks.filter((_, i) => selected[i]),
    [tasks, selected],
  );

  const handleApply = () => {
    apply.mutate(selectedTasks, { onSuccess: () => setOpen(false) });
  };
  const handleDismiss = () => {
    dismiss.mutate();
    setOpen(false);
  };

  const showReopen = !!brief; // once we have any brief for today, allow reopening

  return (
    <>
      {showReopen && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 transition-transform group-hover:scale-110">
            <Sun className="h-3 w-3" />
          </span>
          Morning Brief
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-hidden flex flex-col p-0 gap-0">
          {/* Gradient header bar — sets a warm, premium tone for the brief. */}
          <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/8 via-card to-amber-500/8 px-6 pt-6 pb-5">
            <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" aria-hidden />
            <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" aria-hidden />
            <DialogHeader className="relative">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/20">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-semibold tracking-tight">Morning Brief</DialogTitle>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                </div>
              </div>
              {brief?.headline ? (
                <DialogDescription className="mt-3 text-sm leading-relaxed text-foreground/80">
                  {brief.headline}
                </DialogDescription>
              ) : (
                <DialogDescription className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Here's what happened across your portfolio and what to focus on today.
                </DialogDescription>
              )}
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-auto px-6 py-5 space-y-6">
            {!brief && generate.isPending && (
              <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </span>
                Building your brief…
              </div>
            )}

            {brief?.summary && (
              <section>
                <SectionLabel icon={<Info className="h-3 w-3" />} tint="primary">Overview</SectionLabel>
                <div className="rounded-xl border border-border bg-card p-4 prose prose-sm dark:prose-invert max-w-none [&_p]:my-1.5 [&_ul]:my-1.5 [&_li]:my-0.5 [&_strong]:text-foreground [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-3 [&_h1]:mb-1.5 [&_h2]:mb-1.5 [&_h3]:mb-1.5">
                  <ReactMarkdown>{brief.summary}</ReactMarkdown>
                </div>
              </section>
            )}

            {highlights.length > 0 && (
              <section>
                <SectionLabel icon={<Flag className="h-3 w-3" />} tint="amber">
                  Key concerns
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                    {highlights.length}
                  </span>
                </SectionLabel>
                <ul className="space-y-2">
                  {highlights.map((h, i) => {
                    const Icon = severityIcon[h.severity] ?? Info;
                    const s = severityStyles[h.severity] ?? severityStyles.info;
                    return (
                      <li
                        key={i}
                        className={cn(
                          "relative flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 pl-4 transition-shadow hover:shadow-sm",
                          "before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-full",
                          s.rail,
                        )}
                      >
                        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", s.chip)}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 pt-0.5">
                          <p className="text-sm font-semibold text-foreground leading-snug">{h.label}</p>
                          {h.detail && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{h.detail}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {tasks.length > 0 && (
              <section>
                <div className="mb-2 flex items-end justify-between">
                  <SectionLabel icon={<ListChecks className="h-3 w-3" />} tint="emerald" className="mb-0">
                    Suggested tasks
                  </SectionLabel>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {selectedTasks.length} of {tasks.length} selected
                  </span>
                </div>
                <ul className="space-y-2">
                  {tasks.map((t: MorningBriefTask, i: number) => {
                    const name = clientName(brief, t.client_id);
                    const checked = !!selected[i];
                    return (
                      <li
                        key={i}
                        className={cn(
                          "group flex items-start gap-3 rounded-xl border bg-card p-3.5 cursor-pointer transition-all",
                          checked
                            ? "border-primary/40 bg-primary/[0.03] shadow-sm"
                            : "border-border hover:border-primary/30 hover:bg-accent/30",
                        )}
                        onClick={() => setSelected((s) => ({ ...s, [i]: !s[i] }))}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => setSelected((s) => ({ ...s, [i]: !!v }))}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-foreground leading-snug">{t.title}</span>
                            <span
                              className={cn(
                                "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md font-semibold",
                                priorityChip[t.priority] ?? priorityChip.normal,
                              )}
                            >
                              {t.priority}
                            </span>
                            {name && (
                              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                                <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                                {name}
                              </span>
                            )}
                          </div>
                          {t.reason && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t.reason}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {brief && highlights.length === 0 && tasks.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Sun className="h-6 w-6" />
                </span>
                <p className="text-sm font-medium text-foreground">Nothing flagged this morning</p>
                <p className="text-xs text-muted-foreground">You're all clear — go ship something great.</p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2 border-t border-border bg-muted/30 px-6 py-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => generate.mutate({ regenerate: true })}
                disabled={generate.isPending}
              >
                {generate.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Regenerate
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleDismiss} disabled={apply.isPending || dismiss.isPending}>
                Dismiss
              </Button>
              <Button
                onClick={handleApply}
                disabled={apply.isPending || !brief}
                className="shadow-sm shadow-primary/20"
              >
                {apply.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {selectedTasks.length > 0 ? `Apply · add ${selectedTasks.length} task${selectedTasks.length === 1 ? "" : "s"}` : "Apply"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Small section label with a tinted icon chip — keeps the body scannable.
function SectionLabel({
  icon,
  tint,
  children,
  className,
}: {
  icon: React.ReactNode;
  tint: "primary" | "amber" | "emerald";
  children: React.ReactNode;
  className?: string;
}) {
  const tints: Record<typeof tint, string> = {
    primary: "bg-primary/10 text-primary",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  };
  return (
    <h4 className={cn("flex items-center gap-2 mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground", className)}>
      <span className={cn("flex h-5 w-5 items-center justify-center rounded-md", tints[tint])}>{icon}</span>
      {children}
    </h4>
  );
}
