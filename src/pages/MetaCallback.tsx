// Landing page for the OAuth redirect from Meta.
// Lives at /auth/meta/callback (mapped to https://metahub.gfunnel.com/auth/meta/callback).
// Flow: exchange tokens → show ad-account picker → user confirms → sync begins.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

interface DiscoveredAccount {
  id: string;
  act_id: string;
  account_name: string | null;
  business_name: string | null;
  currency: string | null;
  account_status: number | null;
  is_active: boolean;
}

interface CallbackResult {
  connectionId: string;
  workspaceId: string;
  accountsDiscovered: number;
  accounts: DiscoveredAccount[];
  metaUserName: string | null;
  grantedScopes: string[];
  declinedScopes: string[];
  tokenExpiresAt: string | null;
  isReconnect: boolean;
}

const REQUIRED_SCOPES = ["ads_read", "read_insights"];
const RECOMMENDED_SCOPES = ["ads_management", "business_management", "leads_retrieval"];

type Phase = "loading" | "select" | "confirming" | "done" | "error";

export default function MetaCallback() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<CallbackResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmStats, setConfirmStats] = useState<{ activated: number; syncStartsAt: string | null } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const errorParam = params.get("error_description") || params.get("error");

    if (errorParam) {
      setPhase("error");
      setErrorMsg(errorParam);
      return;
    }
    if (!code || !state) {
      setPhase("error");
      setErrorMsg("Missing code or state from Meta.");
      return;
    }

    supabase.functions
      .invoke("meta-oauth-callback", { body: { code, state } })
      .then(({ data, error }) => {
        if (error) {
          setPhase("error");
          setErrorMsg(error.message || "Connection failed");
          return;
        }
        if (data?.error === "permissions_declined") {
          setPhase("error");
          setErrorMsg(
            data.message ||
              "You didn't grant the permissions needed to read ad accounts. Click 'Edit access' on Facebook's consent screen and make sure ads_read, ads_management, and business_management stay checked.",
          );
          return;
        }
        if (data?.error) {
          setPhase("error");
          setErrorMsg(data.message || data.error || "Connection failed");
          return;
        }
        const r = data as CallbackResult;
        setResult(r);
        // Default selection: existing actives on reconnect, otherwise all.
        const initial = new Set<string>(
          r.isReconnect
            ? r.accounts.filter(a => a.is_active).map(a => a.act_id)
            : r.accounts.map(a => a.act_id),
        );
        setSelected(initial);
        setPhase("select");
      });
  }, []);

  const toggle = (actId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(actId)) next.delete(actId);
      else next.add(actId);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(result?.accounts.map(a => a.act_id) ?? []));
  const selectNone = () => setSelected(new Set());

  const confirmSelection = async () => {
    if (!result) return;
    setPhase("confirming");
    const { data, error } = await supabase.functions.invoke("meta-confirm-accounts", {
      body: { connectionId: result.connectionId, selectedActIds: Array.from(selected) },
    });
    if (error || data?.error) {
      setPhase("error");
      setErrorMsg(error?.message || data?.error || "Failed to save selection");
      return;
    }
    setConfirmStats({ activated: data.activated, syncStartsAt: data.syncStartsAt });
    setPhase("done");
  };

  if (phase === "loading") {
    return (
      <Shell>
        <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
        <h1 className="text-lg font-semibold text-foreground">Connecting Meta...</h1>
        <p className="text-sm text-muted-foreground">Exchanging tokens and discovering ad accounts.</p>
      </Shell>
    );
  }

  if (phase === "error") {
    return (
      <Shell>
        <XCircle className="h-10 w-10 text-destructive mx-auto" />
        <h1 className="text-lg font-semibold text-foreground">Connection Failed</h1>
        <p className="text-sm text-muted-foreground">{errorMsg}</p>
        <Button variant="outline" size="sm" onClick={() => window.close()}>Close</Button>
      </Shell>
    );
  }

  if (!result) return null;

  if (phase === "select" || phase === "confirming") {
    return <SelectionView
      result={result}
      selected={selected}
      toggle={toggle}
      selectAll={selectAll}
      selectNone={selectNone}
      onConfirm={confirmSelection}
      submitting={phase === "confirming"}
    />;
  }

  // done
  const r = result;
  const missingRequired = REQUIRED_SCOPES.filter(s => !r.grantedScopes.includes(s));
  const missingRecommended = RECOMMENDED_SCOPES.filter(s => !r.grantedScopes.includes(s));
  const fullyVerified = missingRequired.length === 0;
  const syncIn = confirmStats?.syncStartsAt
    ? Math.max(0, Math.round((new Date(confirmStats.syncStartsAt).getTime() - Date.now()) / 1000))
    : 60;

  return (
    <Shell wide>
      <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Meta connected successfully</h1>
        {r.metaUserName && (
          <p className="text-sm text-muted-foreground">Authorized as <span className="text-foreground font-medium">{r.metaUserName}</span></p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4 text-left space-y-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">
            {confirmStats?.activated ?? 0} of {r.accountsDiscovered} ad accounts will sync
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          You can change this anytime in Settings → Integrations.
        </p>
      </div>

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
            Missing required: {missingRequired.join(", ")}.
          </p>
        )}
        {missingRecommended.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Missing recommended: {missingRecommended.join(", ")}.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border p-4 text-left flex items-start gap-3">
        <Clock className="h-4 w-4 text-primary mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Sync starts shortly</p>
          <p className="text-xs text-muted-foreground">
            Initial sync will begin in ~{syncIn}s for the {confirmStats?.activated ?? 0} selected account
            {confirmStats?.activated === 1 ? "" : "s"}, then run hourly.
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

function SelectionView({
  result, selected, toggle, selectAll, selectNone, onConfirm, submitting,
}: {
  result: CallbackResult;
  selected: Set<string>;
  toggle: (id: string) => void;
  selectAll: () => void;
  selectNone: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, DiscoveredAccount[]>();
    for (const a of result.accounts) {
      const k = a.business_name || "Personal / Unassigned";
      const arr = map.get(k) ?? [];
      arr.push(a);
      map.set(k, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [result.accounts]);

  const total = result.accounts.length;
  const selectedCount = selected.size;

  return (
    <Shell wide>
      <Building2 className="h-10 w-10 text-primary mx-auto" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Choose ad accounts to sync</h1>
        <p className="text-sm text-muted-foreground">
          {result.isReconnect
            ? "Re-confirm which accounts should keep syncing. Your current selection is pre-checked."
            : `We discovered ${total} ad account${total === 1 ? "" : "s"}. Pick which ones to sync — only selected accounts will pull insights and leads.`}
        </p>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{selectedCount} of {total} selected</span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={selectAll} disabled={submitting}>Select all</Button>
          <Button size="sm" variant="ghost" onClick={selectNone} disabled={submitting}>Select none</Button>
        </div>
      </div>

      <div className="rounded-lg border border-border max-h-[360px] overflow-y-auto text-left divide-y divide-border">
        {total === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No ad accounts were discovered for this Meta user.
          </div>
        )}
        {grouped.map(([group, accounts]) => (
          <div key={group} className="p-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
            <ul className="space-y-1">
              {accounts.map(a => {
                const checked = selected.has(a.act_id);
                const disabled = a.account_status === 2 || a.account_status === 3; // disabled / unsettled
                return (
                  <li
                    key={a.act_id}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 transition cursor-pointer"
                    onClick={() => !submitting && !disabled && toggle(a.act_id)}
                  >
                    <Checkbox checked={checked} disabled={submitting || disabled} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{a.account_name || a.act_id}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {a.act_id}{a.currency ? ` · ${a.currency}` : ""}
                      </p>
                    </div>
                    {disabled && <Badge variant="outline" className="text-[10px]">Disabled</Badge>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" size="sm" onClick={() => window.close()} disabled={submitting}>Cancel</Button>
        <Button size="sm" onClick={onConfirm} disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {selectedCount === 0 ? "Skip & finish" : `Sync ${selectedCount} account${selectedCount === 1 ? "" : "s"}`}
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className={`${wide ? "max-w-xl" : "max-w-md"} w-full rounded-lg border border-border bg-card p-8 text-center space-y-4`}>
        {children}
      </div>
    </div>
  );
}
