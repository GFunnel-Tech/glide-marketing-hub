import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Users2, RotateCcw } from "lucide-react";

// Task categories the morning brief + crons fan tasks out under. Keep this in
// sync with POSITION_KEYWORDS in the edge functions and useMorningBrief.
const CATEGORIES: { key: string; label: string; description: string }[] = [
  { key: "creative",           label: "Creative",            description: "Ad creatives, hooks, copy, video edits, creative fatigue fixes." },
  { key: "media_buying",       label: "Media Buying",        description: "Bid/budget changes, audience tweaks, CPL/CPM/leads breaches." },
  { key: "account_management", label: "Account Management",  description: "Internal account ops, QBRs, status updates." },
  { key: "client_outreach",    label: "Client Outreach",     description: "Dark-account check-ins, status calls, retention emails." },
  { key: "reporting",          label: "Reporting",           description: "Weekly/monthly client reports, analytics digs." },
  { key: "tech",               label: "Tech / Integration",  description: "Tracking pixels, webhooks, GHL/Meta integration issues." },
  { key: "general",            label: "General",             description: "Anything else the AI couldn't categorize." },
];

type Member = { user_id: string; role: string; display_name: string | null; email: string | null; position: string | null };
type Rule = { category: string; assigned_user_id: string };

export function TaskRoutingPanel() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const qc = useQueryClient();

  const { data: members = [] } = useQuery({
    queryKey: ["task-routing-members", wsId],
    enabled: !!wsId,
    queryFn: async (): Promise<Member[]> => {
      const { data: wm, error } = await supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", wsId!);
      if (error) throw error;
      const ids = (wm ?? []).map((m: any) => m.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, email, position")
        .in("id", ids);
      const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return (wm ?? []).map((m: any) => {
        const p = byId.get(m.user_id) ?? {};
        return {
          user_id: m.user_id,
          role: m.role,
          display_name: (p as any).display_name ?? null,
          email: (p as any).email ?? null,
          position: (p as any).position ?? null,
        };
      });
    },
  });

  const { data: rules = [] } = useQuery({
    queryKey: ["task-routing-rules", wsId],
    enabled: !!wsId,
    queryFn: async (): Promise<Rule[]> => {
      const { data, error } = await supabase
        .from("task_routing_rules")
        .select("category, assigned_user_id")
        .eq("workspace_id", wsId!);
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });

  const ruleByCat = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rules) m.set(r.category, r.assigned_user_id);
    return m;
  }, [rules]);

  const labelFor = (m: Member) =>
    m.display_name || m.email || m.user_id.slice(0, 8);

  const setRule = async (category: string, userId: string | null) => {
    if (!wsId) return;
    try {
      if (!userId) {
        const { error } = await supabase
          .from("task_routing_rules")
          .delete()
          .eq("workspace_id", wsId)
          .eq("category", category);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("task_routing_rules")
          .upsert(
            { workspace_id: wsId, category, assigned_user_id: userId },
            { onConflict: "workspace_id,category" },
          );
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["task-routing-rules", wsId] });
      toast.success("Routing updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update routing");
    }
  };

  if (!wsId) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Select a workspace to manage task routing.
      </div>
    );
  }

  const canManage = currentWorkspace?.role === "owner" || currentWorkspace?.role === "admin";
  if (!canManage) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Only workspace owners or admins can edit task routing. Tasks routed to your position will
        appear in your <span className="font-medium text-foreground">Today's Tasks</span> automatically.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Users2 className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">Task routing</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Pick which teammate gets auto-assigned for each task category coming from the morning
            brief, KPI-breach cron, and dark-account outreach cron. When unset, we fall back to
            matching against each member's <span className="font-medium text-foreground">position</span>{" "}
            (and finally the workspace owner).
          </p>
        </div>
      </div>

      <div className="divide-y divide-border">
        {CATEGORIES.map((cat) => {
          const current = ruleByCat.get(cat.key) ?? "";
          return (
            <div key={cat.key} className="grid grid-cols-[1fr_minmax(220px,260px)_auto] gap-4 items-center py-3">
              <div>
                <Label className="text-sm font-medium text-foreground">{cat.label}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
              </div>
              <Select
                value={current || "__auto__"}
                onValueChange={(v) => setRule(cat.key, v === "__auto__" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Auto (position match)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto (position match)</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {labelFor(m)}
                      {m.position ? ` · ${m.position}` : ""}
                      {m.role === "owner" ? " · owner" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRule(cat.key, null)}
                disabled={!current}
                title="Reset to auto"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Overrides take effect on the next morning brief, the daily dark-accounts cron (13:00 UTC),
        and the KPI-breach cron (13:30 UTC).
      </p>
    </div>
  );
}
