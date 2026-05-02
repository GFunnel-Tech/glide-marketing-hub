// Landing page for the OAuth redirect from Meta.
// Lives at /auth/meta/callback (mapped to https://metahub.gfunnel.com/auth/meta/callback).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function MetaCallback() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Connecting your Meta account...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const errorParam = params.get("error_description") || params.get("error");

    if (errorParam) {
      setStatus("error");
      setMessage(errorParam);
      return;
    }
    if (!code || !state) {
      setStatus("error");
      setMessage("Missing code or state from Meta.");
      return;
    }

    supabase.functions
      .invoke("meta-oauth-callback", { body: { code, state } })
      .then(({ data, error }) => {
        if (error || data?.error) {
          setStatus("error");
          setMessage(error?.message || data?.error || "Connection failed");
          return;
        }
        setStatus("success");
        setMessage(`Connected! Discovered ${data.accountsDiscovered} ad accounts. You can close this window.`);
        setTimeout(() => window.close(), 2500);
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full rounded-lg border border-border bg-card p-8 text-center space-y-4">
        {status === "loading" && <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />}
        {status === "success" && <CheckCircle2 className="h-10 w-10 text-success mx-auto" />}
        {status === "error" && <XCircle className="h-10 w-10 text-destructive mx-auto" />}
        <h1 className="text-lg font-semibold text-foreground">
          {status === "loading" ? "Connecting Meta..." : status === "success" ? "Success" : "Connection Failed"}
        </h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
