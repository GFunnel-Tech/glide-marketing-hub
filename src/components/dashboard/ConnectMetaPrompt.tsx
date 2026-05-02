import { useState } from "react";
import { Link } from "react-router-dom";
import { Facebook, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export function ConnectMetaPrompt() {
  const { currentWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-oauth-start", {
        body: { workspaceId: currentWorkspace.id },
      });
      if (error) throw error;
      window.open(data.url, "_blank", "width=600,height=700");
      toast.info("Complete sign-in in the popup, then refresh.");
    } catch (e: any) {
      toast.error(e.message || "Failed to start OAuth");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center space-y-5">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Facebook className="h-7 w-7 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Connect a Meta account to get started</h2>
          <p className="text-sm text-muted-foreground">
            Link your Meta Business Manager to pull in ad accounts, campaigns and performance data automatically.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={connect} disabled={loading} size="lg" className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Facebook className="h-4 w-4 mr-2" />}
            Connect with Meta
          </Button>
          <Link
            to="/settings"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
          >
            Or use a manual access token <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
