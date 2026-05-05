import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

export function ImpersonationBanner() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    setEmail(localStorage.getItem("impersonation.target_email"));
  }, []);

  if (!email) return null;

  const exit = async () => {
    try {
      const raw = localStorage.getItem("impersonation.original_session");
      if (!raw) {
        await supabase.auth.signOut();
        window.location.href = "/auth";
        return;
      }
      const sess = JSON.parse(raw);
      const { error } = await supabase.auth.setSession({
        access_token: sess.access_token,
        refresh_token: sess.refresh_token,
      });
      if (error) throw error;
      localStorage.removeItem("impersonation.original_session");
      localStorage.removeItem("impersonation.target_email");
      toast.success("Returned to your admin account");
      window.location.href = "/admin";
    } catch (e: any) {
      toast.error(e.message ?? "Failed to exit");
    }
  };

  return (
    <div className="bg-primary text-primary-foreground px-4 py-2 flex items-center justify-between text-sm">
      <span>👁 Impersonating <strong>{email}</strong></span>
      <button onClick={exit} className="flex items-center gap-1.5 px-3 py-1 rounded bg-primary-foreground/10 hover:bg-primary-foreground/20">
        <LogOut className="h-3.5 w-3.5" /> Exit impersonation
      </button>
    </div>
  );
}
