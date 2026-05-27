import { useState } from "react";
import { Loader2, Search, FileText, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useQueryClient } from "@tanstack/react-query";

export function QuickActionBar() {
  const [loading, setLoading] = useState<string | null>(null);
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();

  const handleAction = async (key: string, fn: () => Promise<unknown>) => {
    setLoading(key);
    try {
      await fn();
      toast.success(`${key} completed successfully`);
    } catch (e: any) {
      toast.error(`${key} failed`, { description: e?.message ?? "Please try again." });
    } finally {
      setLoading(null);
    }
  };

  const syncAllMetaAccounts = async () => {
    if (!currentWorkspace?.id) throw new Error("No workspace selected");
    const { data, error } = await supabase.functions.invoke("meta-sync", {
      body: { workspaceId: currentWorkspace.id },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  };

  const actions = [
    { key: "Run Portfolio Audit", short: "Run audit", icon: Search, fn: () => api.runAudit("all") },
    { key: "Export Monthly Reports", short: "Export reports", icon: FileText, fn: () => api.exportAllReports() },
    { key: "Sync All Accounts", short: "Sync accounts", icon: RefreshCw, fn: syncAllMetaAccounts },
    { key: "Add New Client", short: "Add client", icon: UserPlus, fn: async () => { window.open("https://forms.clickup.com/9014197198/f/8cmkeye-3094/RKUHI8R4POC323J6DY", "_blank", "noopener,noreferrer"); } },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((a) => (
          <button
            key={a.key}
            disabled={loading !== null}
            onClick={() => handleAction(a.key, a.fn)}
            className="inline-flex items-center gap-2.5 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent active:scale-[0.99] disabled:opacity-50"
          >
            {loading === a.key ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <a.icon className="h-4 w-4 text-primary" />
            )}
            <span className="truncate">{a.short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
