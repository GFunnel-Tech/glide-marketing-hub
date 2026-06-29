import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, KeyRound, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Per-sub-account Private Integration Token input. Saves directly to
 * `ghl_locations.location_api_key` for the location currently linked to
 * this client. Edge functions (`meta-lead-reconcile`, `ghl-lead-check`,
 * `ghl-appointments-sync`) prefer this key over the workspace-wide
 * agency key when present.
 */
type Props = { locationId: string | null | undefined };

export function GhlSubaccountTokenInput({ locationId }: Props) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const qc = useQueryClient();
  const [value, setValue] = useState("");

  const { data: row, isLoading } = useQuery({
    queryKey: ["ghl_location_key", wsId, locationId],
    enabled: !!wsId && !!locationId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ghl_locations")
        .select("location_id, name, location_api_key")
        .eq("workspace_id", wsId)
        .eq("location_id", locationId)
        .maybeSingle();
      return data as { location_id: string; name: string | null; location_api_key: string | null } | null;
    },
  });

  useEffect(() => { setValue(""); }, [locationId]);

  const save = useMutation({
    mutationFn: async (token: string | null) => {
      const { error } = await (supabase as any)
        .from("ghl_locations")
        .update({ location_api_key: token })
        .eq("workspace_id", wsId)
        .eq("location_id", locationId);
      if (error) throw error;
    },
    onSuccess: (_d, token) => {
      qc.invalidateQueries({ queryKey: ["ghl_location_key", wsId, locationId] });
      setValue("");
      toast.success(token ? "Sub-account token saved" : "Sub-account token removed");
    },
    onError: (e: any) => toast.error(e?.message ?? String(e)),
  });

  if (!locationId) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        Link a GHL sub-account above first, then paste this client's Private Integration Token here.
      </div>
    );
  }

  const hasToken = !!row?.location_api_key;
  const masked = row?.location_api_key
    ? `${row.location_api_key.slice(0, 6)}…${row.location_api_key.slice(-4)}`
    : null;
  const looksLikePit = value.trim().startsWith("pit-");

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
          Sub-account Private Integration Token
        </div>
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : hasToken ? (
          <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success">
            <CheckCircle2 className="h-3 w-3" /> Saved
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-warning/30 bg-warning/10 text-warning">
            <AlertCircle className="h-3 w-3" /> Using agency key
          </Badge>
        )}
      </div>

      {hasToken && (
        <div className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground">
          <span>{masked}</span>
          <button
            type="button"
            onClick={() => save.mutate(null)}
            className="inline-flex items-center gap-1 text-destructive hover:text-destructive/80"
            disabled={save.isPending}
            title="Remove token"
          >
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          type="password"
          placeholder="pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 text-xs font-mono"
        />
        <Button
          size="sm"
          onClick={() => save.mutate(value.trim())}
          disabled={!value.trim() || !looksLikePit || save.isPending}
        >
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : hasToken ? "Replace" : "Save"}
        </Button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Create one in GHL → Sub-account → <em>Settings → Private Integrations → Create</em>.
        Grant <span className="font-mono">contacts.readonly</span>, <span className="font-mono">contacts.write</span>,
        and <span className="font-mono">calendars.readonly</span> scopes (add{" "}
        <span className="font-mono">opportunities.readonly</span> for pipeline sync).
      </p>
    </div>
  );
}
