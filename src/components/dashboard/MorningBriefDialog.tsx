import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
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
import { useMorningBrief, type MorningBriefTask } from "@/hooks/useMorningBrief";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Sparkles, AlertTriangle, TriangleAlert, Info, Loader2, RefreshCw, Sun, ListChecks, Flag } from "lucide-react";
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
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          <Sun className="h-3.5 w-3.5 text-warning" />
          Morning Brief
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              Morning Brief
            </DialogTitle>
            <DialogDescription>
              {brief?.headline || "Here's what happened across your portfolio and what to focus on today."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto space-y-5 pr-1">
            {!brief && generate.isPending && (
              <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Building your brief…
              </div>
            )}

            {brief?.summary && (
              <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1.5 [&_ul]:my-1.5 [&_li]:my-0.5">
                <ReactMarkdown>{brief.summary}</ReactMarkdown>
              </div>
            )}

            {highlights.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Key concerns
                </h4>
                <ul className="space-y-2">
                  {highlights.map((h, i) => {
                    const Icon = severityIcon[h.severity] ?? Info;
                    return (
                      <li key={i} className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3">
                        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", severityColor[h.severity])} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{h.label}</p>
                          {h.detail && <p className="text-xs text-muted-foreground mt-0.5">{h.detail}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {tasks.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Suggested tasks ({selectedTasks.length}/{tasks.length})
                  </h4>
                </div>
                <ul className="space-y-2">
                  {tasks.map((t: MorningBriefTask, i: number) => {
                    const name = clientName(brief, t.client_id);
                    return (
                      <li
                        key={i}
                        className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 cursor-pointer hover:border-primary/40"
                        onClick={() => setSelected((s) => ({ ...s, [i]: !s[i] }))}
                      >
                        <Checkbox
                          checked={!!selected[i]}
                          onCheckedChange={(v) => setSelected((s) => ({ ...s, [i]: !!v }))}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{t.title}</span>
                            <span
                              className={cn(
                                "text-[10px] uppercase px-1.5 py-0.5 rounded-md font-semibold",
                                priorityChip[t.priority] ?? priorityChip.normal,
                              )}
                            >
                              {t.priority}
                            </span>
                            {name && (
                              <span className="text-[11px] text-muted-foreground">· {name}</span>
                            )}
                          </div>
                          {t.reason && <p className="text-xs text-muted-foreground mt-0.5">{t.reason}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {brief && highlights.length === 0 && tasks.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing flagged this morning — you're all clear.
              </p>
            )}
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
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
              <Button onClick={handleApply} disabled={apply.isPending || !brief}>
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
