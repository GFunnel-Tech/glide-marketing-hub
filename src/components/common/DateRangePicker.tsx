import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import type { DateRange as RDPRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  PRESET_LABELS,
  useDateRange,
  type DateRangePreset,
} from "@/hooks/useDateRange";

const PRESETS: DateRangePreset[] = [
  "today",
  "7d",
  "14d",
  "30d",
  "90d",
  "mtd",
  "last_month",
];

interface Props {
  className?: string;
  align?: "start" | "center" | "end";
}

export function DateRangePicker({ className, align = "end" }: Props) {
  const { preset, from, to, setPreset, setCustom } = useDateRange();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RDPRange | undefined>({ from, to });

  const label =
    preset === "custom"
      ? `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`
      : PRESET_LABELS[preset];

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setDraft({ from, to });
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-9 gap-2 font-medium", className)}
        >
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="tabular-nums">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0 flex" sideOffset={6}>
        <div className="flex flex-col p-2 border-r border-border min-w-[160px]">
          {PRESETS.map((p) => (
            <Button
              key={p}
              variant={preset === p ? "secondary" : "ghost"}
              size="sm"
              className="justify-start font-normal"
              onClick={() => {
                setPreset(p);
                setOpen(false);
              }}
            >
              {PRESET_LABELS[p]}
            </Button>
          ))}
          <Separator className="my-2" />
          <p className="px-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Custom
          </p>
        </div>
        <div className="flex flex-col">
          <Calendar
            mode="range"
            numberOfMonths={2}
            defaultMonth={from}
            selected={draft}
            onSelect={setDraft}
            className={cn("p-3 pointer-events-auto")}
          />
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {draft?.from ? format(draft.from, "MMM d, yyyy") : "Start"} →{" "}
              {draft?.to ? format(draft.to, "MMM d, yyyy") : "End"}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!draft?.from || !draft?.to}
                onClick={() => {
                  if (draft?.from && draft?.to) {
                    setCustom(draft.from, draft.to);
                    setOpen(false);
                  }
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
