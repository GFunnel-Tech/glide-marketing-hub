import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ImpersonationBanner() {
  const [email, setEmail] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const read = () => setEmail(localStorage.getItem("impersonation.target_email"));
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);

  if (!email) return null;

  const exit = async () => {
    setExiting(true);
    try {
      // Log the end of the impersonation session BEFORE we swap the session back
      // (so the edge function can resolve the impersonated identity from the JWT).
      try { await supabase.functions.invoke("admin-impersonate", { body: { action: "end" } }); } catch {}

      const raw = localStorage.getItem("impersonation.original_session");
      if (!raw) {
        await supabase.auth.signOut();
        localStorage.removeItem("impersonation.target_email");
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
      toast.error(e.message ?? "Failed to exit impersonation");
      setExiting(false);
    }
  };

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 w-full bg-amber-500 text-amber-950 border-b-2 border-amber-600 shadow-md"
    >
      <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-amber-900 opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-900" />
          </span>
          <Eye className="h-4 w-4 shrink-0" />
          <span className="truncate">
            <strong className="font-semibold">Impersonation active</strong>
            <span className="hidden sm:inline"> — you are viewing as </span>
            <span className="sm:hidden"> · </span>
            <span className="font-mono font-semibold">{email}</span>
          </span>
        </div>
        <button
          onClick={exit}
          disabled={exiting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-950 text-amber-50 hover:bg-amber-900 font-semibold text-xs shrink-0 disabled:opacity-60"
        >
          {exiting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
          Exit impersonation
        </button>
      </div>
    </div>
  );
}
