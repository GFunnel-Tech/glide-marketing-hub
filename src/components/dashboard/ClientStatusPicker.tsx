import { useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { StatusBadge, type Status } from "./StatusBadge";
import { ChevronDown } from "lucide-react";

const OPTIONS: { key: Status; label: string; auto?: boolean }[] = [
  { key: "NEW", label: "New" },
  { key: "RELAUNCH", label: "Re-Launch" },
  { key: "PAUSED", label: "Paused" },
  { key: "GREEN", label: "Green", auto: true },
  { key: "YELLOW", label: "Yellow", auto: true },
  { key: "RED", label: "Red", auto: true },
  { key: "LEARNING", label: "Learning", auto: true },
  { key: "SETUP_COMPLETE", label: "Setup Complete", auto: true },
  { key: "LAUNCHING", label: "Launching" },
  { key: "PENDING_APPROVAL", label: "Pending Approval" },
  { key: "PENDING_CANCELLATION", label: "Pending Cancellation" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "BLOCKED", label: "Blocked" },
];

export function ClientStatusPicker({ clientId, status }: { clientId: number | string; status: Status }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (next: Status) => {
      const { error } = await supabase
        .from("clients")
        .update({ status: next as any })
        .eq("id", Number(clientId));
      if (error) throw error;
    },
    onSuccess: (_d, next) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success(`Moved to ${next}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update status"),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button className="inline-flex items-center gap-0.5 hover:opacity-80 transition-opacity" aria-label="Change status">
          <StatusBadge status={status} />
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Move to section
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.key}
            onSelect={() => o.key !== status && m.mutate(o.key)}
            className="text-xs flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2">
              <StatusBadge status={o.key} />
            </span>
            {o.auto && <span className="text-[9px] text-muted-foreground">auto</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
