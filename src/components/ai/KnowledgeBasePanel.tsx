import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Plus, Trash2, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface KnowledgeBasePanelProps {
  workspaceId: string;
  /** When set, new notes default to this client and the list is scoped to it + global notes. */
  clientId?: number | null;
  clientName?: string;
}

/**
 * Lightweight knowledge base the AI agent can search. Entries can be global to
 * the workspace or attached to a single client (SOPs, playbooks, account notes).
 */
export function KnowledgeBasePanel({ workspaceId, clientId, clientName }: KnowledgeBasePanelProps) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [scopeToClient, setScopeToClient] = useState(!!clientId);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["ai-kb", workspaceId, clientId ?? null],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data, error } = await supabase
        .from("ai_knowledge_base" as any)
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      let rows = (data ?? []) as any[];
      if (clientId) rows = rows.filter((r) => r.client_id == null || r.client_id === clientId);
      return rows;
    },
    enabled: !!workspaceId,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("ai_knowledge_base" as any).insert({
        workspace_id: workspaceId,
        client_id: scopeToClient && clientId ? clientId : null,
        title: title.trim(),
        content: content.trim(),
        created_by: auth?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved to knowledge base");
      setTitle("");
      setContent("");
      setAdding(false);
      qc.invalidateQueries({ queryKey: ["ai-kb"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_knowledge_base" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-kb"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" /> Knowledge Base
        </h3>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          {adding ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {adding ? "Cancel" : "Add"}
        </button>
      </div>

      {adding && (
        <div className="space-y-2 mb-3 rounded-md border border-border bg-background p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. Cold lead follow-up SOP)"
            className="w-full rounded border border-border bg-accent px-2 py-1.5 text-xs"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What should the agent know? Playbooks, targets, do's and don'ts…"
            rows={4}
            className="w-full resize-none rounded border border-border bg-accent px-2 py-1.5 text-xs"
          />
          {clientId && (
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={scopeToClient} onChange={(e) => setScopeToClient(e.target.checked)} />
              Only for {clientName ?? "this client"} (otherwise visible to the whole workspace)
            </label>
          )}
          <button
            onClick={() => create.mutate()}
            disabled={!title.trim() || !content.trim() || create.isPending}
            className="w-full rounded bg-primary px-2 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {create.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Save entry
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No entries yet. Add SOPs, targets, or account notes the agent should use.
        </p>
      ) : (
        <div className="space-y-2 max-h-[280px] overflow-auto">
          {entries.map((e: any) => (
            <div key={e.id} className="rounded-md border border-border bg-background p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">{e.title}</p>
                <button
                  onClick={() => remove.mutate(e.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">{e.content}</p>
              {e.client_id == null && (
                <span className="mt-1 inline-block text-[10px] text-muted-foreground/70 uppercase tracking-wide">
                  Workspace-wide
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
