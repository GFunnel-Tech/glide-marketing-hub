import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, MoveRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Client } from "@/hooks/useDatabase";
import {
  usePipelineStages, useSetPipelineStage, daysInStage, type PipelineStage,
} from "@/hooks/usePipelines";

const COLOR_BAR: Record<string, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  accent: "bg-accent",
  muted: "bg-muted-foreground/40",
};

interface Props {
  pipelineId: string;
  prospects: Client[];
}

/**
 * A stage-per-column board over one pipeline. Cards show days-in-stage because
 * a fourteen-day playbook is only a playbook if the calendar is visible.
 */
export function PipelineBoard({ pipelineId, prospects }: Props) {
  const { data: stages = [], isLoading } = usePipelineStages(pipelineId);
  const setStage = useSetPipelineStage();
  const [movingId, setMovingId] = useState<number | null>(null);

  const byStage = useMemo(() => {
    const map = new Map<string, Client[]>();
    for (const s of stages) map.set(s.id, []);
    const unplaced: Client[] = [];
    for (const p of prospects) {
      const key = (p as any).pipelineStageId as string | null;
      if (key && map.has(key)) map.get(key)!.push(p);
      else unplaced.push(p);
    }
    return { map, unplaced };
  }, [stages, prospects]);

  const move = async (p: Client, stage: PipelineStage) => {
    setMovingId(p.id);
    try {
      await setStage.mutateAsync({ clientId: p.id, stage });
      const note = stage.is_won
        ? " — now a client"
        : stage.is_lost
          ? " — marked closed lost"
          : "";
      toast.success(`${p.brand} moved to ${stage.label}${note}`);
    } catch (e: any) {
      toast.error(e?.message || "Could not move the prospect");
    } finally {
      setMovingId(null);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8">Loading stages&hellip;</p>;
  }

  if (stages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">This pipeline has no stages yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Seed the default pipelines from the header above to load the D3 and CTV stage sets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {byStage.unplaced.length > 0 && (
        <div className="rounded-lg border border-dashed p-4">
          <p className="text-sm font-medium mb-2">
            Not yet in this pipeline
            <span className="text-muted-foreground font-normal"> · {byStage.unplaced.length}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {byStage.unplaced.map((p) => (
              <ProspectCard
                key={p.id}
                prospect={p}
                stages={stages}
                onMove={move}
                busy={movingId === p.id}
                compact
              />
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {stages.map((stage) => {
            const items = byStage.map.get(stage.id) ?? [];
            return (
              <section key={stage.id} className="w-64 flex-none">
                <div className="rounded-t-lg border border-b-0 bg-muted/30 px-3 py-2">
                  <div className={cn("h-1 w-8 rounded-full mb-2", COLOR_BAR[stage.color] ?? COLOR_BAR.muted)} />
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-medium leading-tight">{stage.label}</h3>
                    <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
                  </div>
                  {stage.day_label && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{stage.day_label}</p>
                  )}
                  {stage.exit_criteria.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-[11px] text-muted-foreground underline underline-offset-2 mt-1"
                        >
                          {stage.exit_criteria.length} exit criteria
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <ul className="list-disc pl-4 space-y-1 text-xs">
                          {stage.exit_criteria.map((c) => <li key={c}>{c}</li>)}
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>

                <div className="rounded-b-lg border bg-background p-2 space-y-2 min-h-[7rem]">
                  {items.length === 0 && (
                    <p className="text-xs text-muted-foreground px-1 py-3">Empty</p>
                  )}
                  {items.map((p) => (
                    <ProspectCard
                      key={p.id}
                      prospect={p}
                      stages={stages}
                      onMove={move}
                      busy={movingId === p.id}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProspectCard({
  prospect, stages, onMove, busy, compact,
}: {
  prospect: Client;
  stages: PipelineStage[];
  onMove: (p: Client, s: PipelineStage) => void;
  busy: boolean;
  compact?: boolean;
}) {
  const days = daysInStage((prospect as any).stageEnteredAt ?? null);
  return (
    <div className={cn("rounded-md border bg-card p-2.5", compact && "w-56", busy && "opacity-60")}>
      <p className="text-sm font-medium leading-tight">{prospect.brand}</p>
      {prospect.decisionMaker && (
        <p className="text-xs text-muted-foreground mt-0.5">{prospect.decisionMaker}</p>
      )}
      <div className="flex items-center justify-between gap-2 mt-2">
        {days !== null ? (
          <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
            <Clock className="h-3 w-3" />
            {days === 0 ? "today" : `${days}d`}
          </Badge>
        ) : <span />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-1.5" disabled={busy}>
              <MoveRight className="h-3.5 w-3.5" />
              <span className="sr-only">Move {prospect.brand} to another stage</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            {stages.map((s) => (
              <DropdownMenuItem
                key={s.id}
                disabled={s.id === (prospect as any).pipelineStageId}
                onClick={() => onMove(prospect, s)}
              >
                {s.label}
                {s.day_label && (
                  <span className="ml-2 text-xs text-muted-foreground">{s.day_label}</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
