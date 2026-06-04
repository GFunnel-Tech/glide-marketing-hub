import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Link2Off, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type GhlLoc = { location_id: string; name: string | null; business_name: string | null };

type Props = {
  clientId: number;
  currentLocationId?: string | null;
  variant?: "chip" | "panel";
  className?: string;
};

export function GhlLocationLink({ clientId, currentLocationId, variant = "chip", className }: Props) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: locations = [] } = useQuery({
    queryKey: ["ghl_locations", wsId],
    enabled: !!wsId,
    queryFn: async (): Promise<GhlLoc[]> => {
      const { data } = await (supabase as any)
        .from("ghl_locations")
        .select("location_id, name, business_name")
        .eq("workspace_id", wsId)
        .order("name");
      return data || [];
    },
  });

  const { data: suggestion } = useQuery({
    queryKey: ["ghl_suggestion", wsId, clientId],
    enabled: !!wsId && !currentLocationId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("account_match_suggestions")
        .select("source_ref, source_name, score")
        .eq("workspace_id", wsId)
        .eq("source", "ghl")
        .eq("client_id", clientId)
        .eq("status", "pending")
        .order("score", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const setLink = useMutation({
    mutationFn: async (locId: string | null) => {
      const { error } = await (supabase as any)
        .from("clients")
        .update({ ghl_location_id: locId })
        .eq("id", clientId);
      if (error) throw error;
      if (locId && suggestion?.source_ref === locId) {
        await (supabase as any)
          .from("account_match_suggestions")
          .update({ status: "approved", resolved_at: new Date().toISOString() })
          .eq("workspace_id", wsId)
          .eq("source", "ghl")
          .eq("source_ref", locId)
          .eq("client_id", clientId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["ghl_suggestion"] });
      qc.invalidateQueries({ queryKey: ["account_match_suggestions"] });
      toast.success("GHL sub-account updated");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? String(e)),
  });

  const current = locations.find((l) => l.location_id === currentLocationId);
  const isLinked = !!currentLocationId;
  const pending = setLink.isPending;

  const trigger = variant === "chip" ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
        isLinked
          ? "border-success/30 bg-success/10 text-success hover:bg-success/15"
          : suggestion
            ? "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15"
            : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
        className,
      )}
      title={isLinked ? `GHL: ${current?.name ?? currentLocationId}` : suggestion ? `Suggested: ${suggestion.source_name}` : "Link GHL sub-account"}
    >
      {isLinked ? <Link2 className="h-2.5 w-2.5" /> : suggestion ? <Sparkles className="h-2.5 w-2.5" /> : <Link2Off className="h-2.5 w-2.5" />}
      <span className="max-w-[110px] truncate">
        {isLinked ? (current?.name ?? "GHL linked") : suggestion ? "Suggested" : "Link GHL"}
      </span>
    </button>
  ) : (
    <Button variant="outline" size="sm" onClick={() => setOpen(true)} className={className}>
      {isLinked ? <Link2 className="h-3.5 w-3.5 mr-1.5" /> : <Link2Off className="h-3.5 w-3.5 mr-1.5" />}
      {isLinked ? (current?.name ?? "GHL linked") : "Link GHL sub-account"}
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-border px-3 py-2">
          <div className="text-xs font-semibold text-foreground">GHL sub-account</div>
          {isLinked && current && (
            <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
              Linked to <span className="text-foreground">{current.name}</span>
            </div>
          )}
          {!isLinked && suggestion && (
            <button
              onClick={() => setLink.mutate(suggestion.source_ref)}
              disabled={pending}
              className="mt-1.5 w-full rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-left text-[11px] text-warning hover:bg-warning/15 disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1 font-medium">
                <Sparkles className="h-3 w-3" /> Auto-match: {suggestion.source_name}
              </span>
              <span className="ml-1 opacity-70">({Math.round(Number(suggestion.score) * 100)}%)</span>
            </button>
          )}
        </div>
        <Command>
          <CommandInput placeholder="Search sub-accounts..." className="h-9" />
          <CommandList>
            <CommandEmpty>
              {locations.length === 0 ? "No GHL locations synced yet." : "No matches."}
            </CommandEmpty>
            <CommandGroup>
              {locations.map((l) => (
                <CommandItem
                  key={l.location_id}
                  value={`${l.name ?? ""} ${l.business_name ?? ""} ${l.location_id}`}
                  onSelect={() => setLink.mutate(l.location_id)}
                  className="text-xs"
                >
                  <div className="flex flex-1 flex-col min-w-0">
                    <span className="font-medium truncate">{l.name ?? l.location_id}</span>
                    {l.business_name && <span className="text-muted-foreground truncate">{l.business_name}</span>}
                  </div>
                  {l.location_id === currentLocationId && <Check className="h-3.5 w-3.5 text-success" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {isLinked && (
          <div className="border-t border-border p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => setLink.mutate(null)}
              disabled={pending}
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Unlink"}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
