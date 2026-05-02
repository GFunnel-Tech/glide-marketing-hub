// Landing page for the OAuth redirect from Meta.
// Lives at /auth/meta/callback (mapped to https://metahub.gfunnel.com/auth/meta/callback).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CallbackResult {
  accountsDiscovered: number;
  accounts: Array<{ name: string; currency: string; business_name: string | null }>;
  metaUserName: string | null;
  grantedScopes: string[];
  declinedScopes: string[];
  tokenExpiresAt: string | null;
  syncStartsAt: string | null;
}

const REQUIRED_SCOPES = ["ads_read", "read_insights"];
const RECOMMENDED_SCOPES = ["ads_management", "business_management", "leads_retrieval"];

export default function MetaCallback() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<CallbackResult | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const errorParam = params.get("error_description") || params.get("error");

    if (errorParam) {
      setStatus("error");
      setErrorMsg(errorParam);
      return;
    }
    if (!code || !state) {
      setStatus("error");
      setErrorMsg("Missing code or state from Meta.");
      return;
    }

    supabase.functions
      .invoke("meta-oauth-callback", { body: { code, state } })
      .then(({ data, error }) => {
        if (error || data?.error) {
          setStatus("error");
          setErrorMsg(error?.message || data?.error || "Connection failed");
          return;
        }
        setStatus("success");
        setResult(data as CallbackResult);
      });
  }, []);

  if (status === "loading") {
    return (
      <Shell>
        <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
        <h1 className="text-lg font-semibold text-foreground">Connecting Meta...</h1>
        <p className="text-sm text-muted-foreground">Exchanging tokens and discovering ad accounts.</p>
      </Shell>
    );
  }

  if (status === "error") {
    return (
      <Shell>
        <XCircle className="h-10 w-10 text-destructive mx-auto" />
        <h1 className="text-lg font-semibold text-foreground">Connection Failed</h1>
        <p className="text-sm text-muted-foreground">{errorMsg}</p>
        <Button variant="outline" size="sm" onClick={() => window.close()}>Close</Button>
      </Shell>
    );
  }

  // Success
  const r = result!;
  const missingRequired = REQUIRED_SCOPES.filter(s => !r.grantedScopes.includes(s));
  const missingRecommended = RECOMMENDED_SCOPES.filter(s => !r.grantedScopes.includes(s));
  const fullyVerified = missingRequired.length === 0;
  const syncIn = r.syncStartsAt ? Math.max(0, Math.round((new Date(r.syncStartsAt).getTime() - Date.now()) / 1000)) : null;

  return (
    <Shell wide>
      <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Meta connected successfully</h1>
        {r.metaUserName && (
          <p className="text-sm text-muted-foreground">Authorized as <span className="text-foreground font-medium">{r.metaUserName}</span></p>
        )}
      </div>

      {/* Discovery summary */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-left space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">
            {r.accountsDiscovered} ad {r.accountsDiscovered === 1 ? "account" : "accounts"} discovered
          </p>
        </div>
        {r.accounts.length > 0 && (
          <ul className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto pl-6 list-disc">
            {r.accounts.map((a, i) => (
              <li key={i}>
                <span className="text-foreground">{a.name}</span>
                {a.business_name && <span> · {a.business_name}</span>}
                {a.currency && <span> · {a.currency}</span>}
              </li>
            ))}
            {r.accountsDiscovered > r.accounts.length && (
              <li className="list-none italic">+ {r.accountsDiscovered - r.accounts.length} more</li>
            )}
          </ul>
        )}
      </div>

      {/* Verification status */}
      <div className="rounded-lg border border-border p-4 text-left space-y-2">
        <div className="flex items-center gap-2">
          {fullyVerified ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-warning" />
          )}
          <p className="text-sm font-semibold text-foreground">
            {fullyVerified ? "Verified — all required permissions granted" : "Partial verification"}
          </p>
        </div>
        {missingRequired.length > 0 && (
          <p className="text-xs text-destructive">
            Missing required: {missingRequired.join(", ")}. Reconnect and approve these to enable syncing.
          </p>
        )}
        {missingRecommended.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Missing recommended: {missingRecommended.join(", ")} — some features may be limited.
          </p>
        )}
        {r.grantedScopes.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Granted: {r.grantedScopes.join(", ")}
          </p>
        )}
      </div>

      {/* Sync schedule */}
      <div className="rounded-lg border border-border p-4 text-left flex items-start gap-3">
        <Clock className="h-4 w-4 text-primary mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Sync starts shortly</p>
          <p className="text-xs text-muted-foreground">
            Initial sync will begin in ~{syncIn ?? 60}s, then run automatically every hour.
            Performance data and leads will appear on your dashboard once the first sync completes.
          </p>
        </div>
      </div>

      <div className="flex gap-2 justify-center pt-2">
        <Button size="sm" onClick={() => window.close()}>Done</Button>
        <Button size="sm" variant="outline" onClick={() => { window.location.href = "/settings/integrations"; }}>
          Manage connection
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className={`${wide ? "max-w-lg" : "max-w-md"} w-full rounded-lg border border-border bg-card p-8 text-center space-y-4`}>
        {children}
      </div>
    </div>
  );
}
