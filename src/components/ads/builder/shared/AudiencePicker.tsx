import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { AudienceRef } from "../types";
import { X, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Audience = { id: string; name: string; subtype?: string; approximate_count_lower_bound?: number };

function Chips({ items, onRemove, tone }: { items: AudienceRef[]; onRemove: (id: string) => void; tone: "include" | "exclude" }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-1.5">
      {items.map((a) => (
        <span
          key={a.id}
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-1 text-xs",
            tone === "include" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
          )}
        >
          {a.name}
          <button onClick={() => onRemove(a.id)} aria-label={`Remove ${a.name}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

export function AudiencePicker() {
  const { currentWorkspace } = useWorkspace();
  const state = useAdDraftStore((s) => s.state);
  const patch = useAdDraftStore((s) => s.patch);
  const wsId = currentWorkspace?.id;
  const actId = state.adAccountId;

  const { data: audiences = [], isLoading, isError } = useQuery({
    queryKey: ["builder_audiences", wsId, actId],
    enabled: !!wsId && !!actId,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("meta-audiences", {
        body: { workspaceId: wsId, adAccountId: actId, action: "list" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return ((data as any).audiences ?? []) as Audience[];
    },
  });

  const included = state.customAudiences ?? [];
  const excluded = state.excludedAudiences ?? [];

  const add = (key: "customAudiences" | "excludedAudiences", id: string) => {
    const found = audiences.find((a) => a.id === id);
    if (!found) return;
    const current = (key === "customAudiences" ? included : excluded);
    if (current.some((a) => a.id === id)) return;
    patch(key, [...current, { id: found.id, name: found.name }] as AudienceRef[]);
  };

  const remove = (key: "customAudiences" | "excludedAudiences", id: string) => {
    const current = (key === "customAudiences" ? included : excluded);
    patch(key, current.filter((a) => a.id !== id) as AudienceRef[]);
  };

  if (!actId) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" /> Select an ad account to load custom audiences.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-foreground mb-1.5 block">Include custom audiences</label>
        <Chips items={included} onRemove={(id) => remove("customAudiences", id)} tone="include" />
        <Select value="" onValueChange={(v) => add("customAudiences", v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={isLoading ? "Loading audiences…" : isError ? "Couldn't load audiences" : "Add audience"} />
          </SelectTrigger>
          <SelectContent>
            {audiences.map((a) => (
              <SelectItem key={a.id} value={a.id} className="text-xs">
                {a.name}{a.subtype ? ` · ${a.subtype}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs font-medium text-foreground mb-1.5 block">Exclude audiences</label>
        <Chips items={excluded} onRemove={(id) => remove("excludedAudiences", id)} tone="exclude" />
        <Select value="" onValueChange={(v) => add("excludedAudiences", v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Add exclusion" />
          </SelectTrigger>
          <SelectContent>
            {audiences.map((a) => (
              <SelectItem key={a.id} value={a.id} className="text-xs">{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
