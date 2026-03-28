import { useState } from "react";
import { Loader2, Search, FileText, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useNavigate } from "react-router-dom";

export function QuickActionBar() {
  const [loading, setLoading] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleAction = async (key: string, fn: () => Promise<unknown>) => {
    setLoading(key);
    try {
      await fn();
      toast.success(`${key} completed successfully`);
    } catch {
      toast.error(`${key} failed — check n8n webhook`);
    } finally {
      setLoading(null);
    }
  };

  const actions = [
    { key: "Run Portfolio Audit", icon: Search, className: "bg-purple text-purple-foreground hover:bg-purple/90", fn: () => api.runAudit("all") },
    { key: "Export Monthly Reports", icon: FileText, className: "bg-primary text-primary-foreground hover:bg-primary/90", fn: () => api.exportAllReports() },
    { key: "Sync All Accounts", icon: RefreshCw, className: "bg-success text-success-foreground hover:bg-success/90", fn: () => api.syncAllAccounts() },
    { key: "Add New Client", icon: UserPlus, className: "bg-primary text-primary-foreground hover:bg-primary/90", fn: async () => navigate("/onboarding") },
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
