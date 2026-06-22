import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export type BriefSeverity = "info" | "warn" | "critical";
export type BriefPriority = "low" | "normal" | "high";

export interface MorningBriefTask {
  title: string;
  priority: BriefPriority;
  client_id: number | null;
  reason: string;
}

export interface MorningBriefHighlight {
  label: string;
  detail: string;
  severity: BriefSeverity;
}

export interface MorningBrief {
  id: string;
  workspace_id: string;
  user_id: string;
  brief_date: string;
  headline: string | null;
  summary: string;
  highlights: MorningBriefHighlight[];
  suggested_tasks: MorningBriefTask[];
  signals: any;
  model: string | null;
  status: "new" | "applied" | "dismissed";
  applied_task_ids: string[];
  created_at: string;
  applied_at: string | null;
  dismissed_at: string | null;
}

// The brief is keyed on the user's *local* calendar day so "this morning" lines up
// with what they actually see, regardless of server timezone.
function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const db = supabase as any;

export function useMorningBrief() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const qc = useQueryClient();
  const today = localToday();
  const queryKey = ["morning-brief", wsId, today];

  const query = useQuery({
    queryKey,
    enabled: !!wsId,
    queryFn: async (): Promise<MorningBrief | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await db
        .from("morning_briefs")
        .select("*")
        .eq("workspace_id", wsId)
        .eq("user_id", auth.user.id)
        .eq("brief_date", today)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MorningBrief | null;
    },
  });

  const generate = useMutation({
    mutationFn: async (opts: { regenerate?: boolean } = {}): Promise<MorningBrief> => {
      if (!wsId) throw new Error("No workspace");
      const { data, error } = await supabase.functions.invoke("morning-brief", {
        body: { workspaceId: wsId, date: today, regenerate: opts.regenerate ?? false },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return (data as any).brief as MorningBrief;
    },
    onSuccess: (brief) => {
      qc.setQueryData(queryKey, brief);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not generate your brief"),
  });

  // Apply turns the chosen suggested tasks into real tasks (client_notes), due today,
  // then marks the brief applied so it won't pop again.
  const apply = useMutation({
    mutationFn: async (tasks: MorningBriefTask[]) => {
      const brief = query.data;
      if (!brief) throw new Error("No brief loaded");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");

      let createdIds: string[] = [];
      if (tasks.length > 0) {
        const now = new Date();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
        const rows = tasks.map((t) => ({
          workspace_id: brief.workspace_id,
          client_id: t.client_id ?? null,
          user_id: auth.user!.id,
          title: t.title,
          content: t.reason ?? "",
          kind: "task",
          priority: t.priority ?? "normal",
          due_at: endOfToday,
          next_due_at: endOfToday,
        }));
        const { data: inserted, error: insErr } = await db.from("client_notes").insert(rows).select("id");
        if (insErr) throw insErr;
        createdIds = (inserted ?? []).map((r: any) => r.id);
      }

      const { error: updErr } = await db
        .from("morning_briefs")
        .update({ status: "applied", applied_at: new Date().toISOString(), applied_task_ids: createdIds })
        .eq("id", brief.id);
      if (updErr) throw updErr;
      return createdIds.length;
    },
    onSuccess: (count) => {
      toast.success(count > 0 ? `Added ${count} task${count === 1 ? "" : "s"} for today` : "Brief cleared");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not apply your brief"),
  });

  const dismiss = useMutation({
    mutationFn: async () => {
      const brief = query.data;
      if (!brief) return;
      const { error } = await db
        .from("morning_briefs")
        .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
        .eq("id", brief.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e: any) => toast.error(e?.message ?? "Could not dismiss"),
  });

  return { ...query, brief: query.data ?? null, generate, apply, dismiss };
}
