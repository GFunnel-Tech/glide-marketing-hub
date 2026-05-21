import { useState } from "react";
import { Loader2, Search, FileText, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

export function QuickActionBar() {
  const [loading, setLoading] = useState<string | null>(null);
  const navigate = useNavigate();
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
    { key: "Run Portfolio Audit", icon: Search, className: "bg-purple text-purple-foreground hover:bg-purple/90", fn: () => api.runAudit("all") },
    { key: "Export Monthly Reports", icon: FileText, className: "bg-primary text-primary-foreground hover:bg-primary/90", fn: () => api.exportAllReports() },
    { key: "Sync All Accounts", icon: RefreshCw, className: "bg-success text-success-foreground hover:bg-success/90", fn: syncAllMetaAccounts },
    { key: "Add New Client", icon: UserPlus, className: "bg-primary text-primary-foreground hover:bg-primary/90", fn: async () => { window.open("https://forms.clickup.com/9014197198/f/8cmkeye-3094/RKUHI8R4POC323J6DY", "_blank", "noopener,noreferrer"); } },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {actions.map((a) => (
        <button
          key={a.key}
          disabled={loading !== null}
          onClick={() => handleAction(a.key, a.fn)}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.98] disabled:opacity-50 ${a.className}`}
        >
          {loading === a.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <a.icon className="h-4 w-4" />}
          {a.key}
        </button>
      ))}
    </div>
  );
}
