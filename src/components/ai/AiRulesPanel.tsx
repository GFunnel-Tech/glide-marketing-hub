import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Sparkles, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface AiRule {
  id: string;
  workspace_id: string;
  client_id: number;
  prompt: string;
  parsed_spec: any;
  enabled: boolean;
  last_parsed_at: string | null;
  parse_error: string | null;
}

export function AiRulesPanel({ clientId, workspaceId }: { clientId: number; workspaceId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [parsing, setParsing] = useState(false);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["client_ai_rules", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_ai_rules")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiRule[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["client_ai_rules", clientId] });

  const addRule = useMutation({
    mutationFn: async (prompt: string) => {
      setParsing(true);
      const { data: inserted, error: insErr } = await (supabase as any)
        .from("client_ai_rules")
        .insert({ workspace_id: workspaceId, client_id: clientId, prompt, enabled: true })
        .select("id")
        .single();
      if (insErr) throw insErr;

      const { data, error } = await (supabase as any).functions.invoke("ai-rule-parse", {
        body: { prompt, clientId, ruleId: inserted.id },
      });
      if (error || data?.error) {
        await (supabase as any)
          .from("client_ai_rules")
          .update({ parse_error: data?.error || error?.message || "Parse failed" })
          .eq("id", inserted.id);
        throw new Error(data?.error || error?.message || "Parse failed");
      }
      return inserted.id;
    },
    onSuccess: () => {
      setDraft("");
      toast.success("Rule added");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
    onSettled: () => setParsing(false),
  });

  const reparse = useMutation({
    mutationFn: async (rule: AiRule) => {
      const { data, error } = await (supabase as any).functions.invoke("ai-rule-parse", {
        body: { prompt: rule.prompt, clientId, ruleId: rule.id },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
    },
    onSuccess: () => { toast.success("Re-parsed"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleEnabled = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await (supabase as any).from("client_ai_rules").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("client_ai_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
  });

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          AI Rules (plain English)
        </h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          Describe what the AI should do. It will be parsed into a structured rule you can review.
        </p>
      </div>

      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
          placeholder='e.g. "If CPL is over $80 for 3 days, pause the worst ad and notify me"'
          rows={3}
          className="text-xs"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => draft.trim() && addRule.mutate(draft.trim())}
            disabled={!draft.trim() || parsing}
          >
            {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            Add rule
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />}
        {!isLoading && rules.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-4">No AI rules yet.</p>
        )}
        {rules.map((r) => (
          <div key={r.id} className="rounded-md border border-border bg-background p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-foreground flex-1">{r.prompt}</p>
              <Switch
                checked={r.enabled}
                onCheckedChange={(v) => toggleEnabled.mutate({ id: r.id, enabled: v })}
              />
            </div>

            {r.parse_error ? (
              <div className="flex items-start gap-1.5 text-[10px] text-destructive">
                <AlertCircle className="h-3 w-3 mt-0.5" /> {r.parse_error}
              </div>
            ) : r.parsed_spec ? (
              <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 mt-0.5 text-emerald-500" />
                <span className="flex-1">
                  <Badge variant="outline" className="mr-1 text-[10px]">{r.parsed_spec.action}</Badge>
                  {r.parsed_spec.explanation || JSON.stringify(r.parsed_spec.conditions)}
                </span>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground">Not yet parsed.</p>
            )}

            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => reparse.mutate(r)} disabled={reparse.isPending}>
                Re-parse
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-destructive" onClick={() => del.mutate(r.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
