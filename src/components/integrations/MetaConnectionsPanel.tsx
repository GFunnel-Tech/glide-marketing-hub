import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useClients } from "@/hooks/useDatabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, RefreshCw, Trash2, Link2, Facebook, Info, RotateCw, AlertTriangle, KeyRound, X, CheckCircle2, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { MetaTokenGuide } from "./MetaTokenGuide";
import { MetaTroubleshootWizard } from "./MetaTroubleshootWizard";
import { MetaScopesLiveBanner } from "./MetaScopesBanner";
import { MetaAppRolePanel } from "./MetaAppRolePanel";
import { LifeBuoy } from "lucide-react";

// Meta user/system-user access tokens are opaque strings.
// They are typically 100–500 chars of URL-safe base64-ish characters.
// We validate shape only — the server still verifies the token with Graph API.
const META_TOKEN_REGEX = /^[A-Za-z0-9_\-|.]+$/;
const metaTokenSchema = z
  .string()
  .trim()
  .min(1, { message: "Access token is required." })
  .min(50, { message: "This doesn't look like a Meta token — it's too short (expected 50+ characters)." })
  .max(2000, { message: "Access token is too long (max 2000 characters)." })
  .refine(v => !/\s/.test(v), { message: "Token must not contain spaces or line breaks." })
  .refine(v => !/^bearer\s+/i.test(v), { message: "Remove the \"Bearer \" prefix — paste only the token itself." })
  .refine(v => !/^["'].*["']$/.test(v), { message: "Remove the surrounding quotes — paste only the token itself." })
  .refine(v => META_TOKEN_REGEX.test(v), {
    message: "Token contains invalid characters. Copy it directly from Meta's Graph API Explorer or Business Settings.",
  });

type ValidationResult = { ok: true; value: string } | { ok: false; error: string };
function validateMetaToken(raw: string): ValidationResult {
  const result = metaTokenSchema.safeParse(raw);
  if (result.success) return { ok: true as const, value: result.data };
  return { ok: false as const, error: result.error.issues[0]?.message ?? "Invalid token." };
}

// Non-blocking heuristic warnings for common paste mistakes.
// These do NOT prevent Verify/Connect — they just flag likely problems early.
function getTokenWarnings(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  const warnings: string[] = [];
  if (/access_token=/i.test(t) || /^https?:\/\//i.test(t)) {
    warnings.push("This looks like a full URL or query string. Paste only the token value (the part after access_token=).");
  }
  if (/^eyJ[A-Za-z0-9_-]+\./.test(t)) {
    warnings.push("This looks like a JWT (Google/Supabase token), not a Meta token. Meta tokens start with \"EAA\".");
  }
  if (/^\d+\|[A-Za-z0-9_\-]+$/.test(t)) {
    warnings.push("This looks like an App Access Token (APP_ID|APP_SECRET). Use a User or System User token instead — app tokens cannot read ad accounts.");
  }
  if (!/^EAA/.test(t) && !/^\d+\|/.test(t)) {
    warnings.push("Meta access tokens normally start with \"EAA\". Double-check you copied the right value.");
  }
  if (/^EAA/.test(t) && t.length < 100) {
    warnings.push("Token is unusually short. Short-lived tokens from the Graph API Explorer expire in ~1 hour — extend it or use a System User token.");
  }
  if (/\.\.\.|•|…|\*{3,}/.test(t)) {
    warnings.push("Token contains placeholder characters (…, •, or ***). Make sure you copied the full token, not a masked preview.");
  }
  return warnings;
}

// Map raw Meta/Graph error messages into a friendly diagnosis with likely causes + fixes.
const REQUIRED_SCOPES = ["ads_read", "ads_management", "business_management", "read_insights", "leads_retrieval"];
function diagnoseTokenError(rawError: string, grantedScopes?: string[]): {
  title: string;
  summary: string;
  causes: string[];
  fixes: { label: string; href?: string }[];
  missingScopes?: string[];
} {
  const e = (rawError || "").toLowerCase();
  const missing = grantedScopes
    ? REQUIRED_SCOPES.filter(s => !grantedScopes.includes(s))
    : undefined;

  if (/expired|session has expired|code 463|error validating access token/.test(e)) {
    return {
      title: "Token has expired",
      summary: "Meta says this token is no longer valid.",
      causes: [
        "Short-lived Graph API Explorer tokens expire after ~1 hour.",
        "User changed their Facebook password or logged out everywhere.",
        "Token was revoked from Settings → Business Integrations.",
      ],
      fixes: [
        { label: "Use a System User token (never expires)", href: "https://business.facebook.com/settings/system-users" },
        { label: "Or extend the user token to 60 days via the Access Token Debugger", href: "https://developers.facebook.com/tools/debug/accesstoken/" },
      ],
    };
  }
  if (/application does not have permission|app access token/.test(e)) {
    return {
      title: "Wrong token type",
      summary: "This appears to be an App Access Token. App tokens cannot read ad accounts.",
      causes: ["Token was generated as APP_ID|APP_SECRET instead of a User or System User token."],
      fixes: [{ label: "Generate a System User token in Business Settings", href: "https://business.facebook.com/settings/system-users" }],
    };
  }
  if (/permission|scope|insufficient|#200|#10\b/.test(e)) {
    return {
      title: "Missing permissions",
      summary: "The token is valid but doesn't have the scopes we need to read ad data.",
      causes: [
        missing && missing.length
          ? `Missing scopes: ${missing.join(", ")}.`
          : "One or more required scopes were not granted when the token was created.",
        "If using a System User token, the System User may not be assigned to the ad accounts.",
      ],
      fixes: [
        { label: "Re-generate the token with ads_read, read_insights, ads_management, business_management, leads_retrieval", href: "https://business.facebook.com/settings/system-users" },
        { label: "Assign the System User to your ad accounts (Business Settings → Ad Accounts → Add People)", href: "https://business.facebook.com/settings/ad-accounts" },
      ],
      missingScopes: missing,
    };
  }
  if (/rate limit|too many calls|#17|#4\b/.test(e)) {
    return {
      title: "Rate limited by Meta",
      summary: "Meta is throttling requests for this token.",
      causes: ["Too many calls in a short window from this user/app."],
      fixes: [{ label: "Wait a few minutes and try Verify again" }],
    };
  }
  if (/malformed|invalid oauth access token|cannot parse|invalid format/.test(e)) {
    return {
      title: "Token is malformed",
      summary: "Meta couldn't parse this string as an access token.",
      causes: [
        "The token was truncated, contains a masked preview (•••), or includes extra characters.",
        "You may have pasted a URL instead of just the token value.",
      ],
      fixes: [{ label: "Re-copy the full token from Business Settings or the Graph API Explorer", href: "https://developers.facebook.com/tools/explorer/" }],
    };
  }
  if (/checkpoint|two.?factor|2fa|review the information/.test(e)) {
    return {
      title: "Account is in checkpoint",
      summary: "Meta has flagged the underlying Facebook account and requires action.",
      causes: ["Suspicious activity, unverified login, or 2FA challenge pending."],
      fixes: [
        { label: "Log in to Facebook on the web and clear any prompts", href: "https://www.facebook.com/" },
        { label: "Then re-generate the token" },
      ],
    };
  }
  return {
    title: "Verification failed",
    summary: rawError || "Meta rejected the token.",
    causes: [
      "Token may be invalid, expired, or for a different app.",
      "The user/system user may lack access to any ad accounts.",
    ],
    fixes: [
      { label: "Open the step-by-step token guide above and re-generate" },
      { label: "Test the token in the Access Token Debugger", href: "https://developers.facebook.com/tools/debug/accesstoken/" },
    ],
  };
}

interface MetaConnection {
  id: string;
  meta_user_name: string | null;
  connection_type: string;
  status: string;
  token_expires_at: string | null;
  created_at: string;
  last_error: string | null;
  scopes: string[] | null;
}

interface SyncLogEntry {
  id: string;
  connection_id: string | null;
  status: string;
  trigger: string;
  rows_synced: number | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

interface MetaAdAccount {
  id: string;
  connection_id: string;
  client_id: number | null;
  act_id: string;
  account_name: string | null;
  business_name: string | null;
  currency: string | null;
  last_synced_at: string | null;
}

export function MetaConnectionsPanel() {
  const { currentWorkspace, loading: workspaceLoading, refresh: refreshWorkspaces } = useWorkspace();
  const [retryingWorkspace, setRetryingWorkspace] = useState(false);
  const { data: clients = [] } = useClients();
  const [connections, setConnections] = useState<MetaConnection[]>([]);
  const [accounts, setAccounts] = useState<MetaAdAccount[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [autoOpenGuide, setAutoOpenGuide] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const manualSectionRef = useRef<HTMLDivElement | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [manualToken, setManualToken] = useState("");
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [manualReconnectId, setManualReconnectId] = useState<string | null>(null);
  const [manualReconnectToken, setManualReconnectToken] = useState("");
  const [manualTokenError, setManualTokenError] = useState<string | null>(null);
  const [manualReconnectError, setManualReconnectError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<
    | { ok: true; metaUserName: string | null; adAccountCount: number; grantedScopes: string[] }
    | { ok: false; error: string }
    | null
  >(null);

  // Deep-link: ?manual=1 opens the manual flow with the guide expanded and scrolls to it.
  useEffect(() => {
    if (searchParams.get("manual") === "1") {
      setShowManual(true);
      setAutoOpenGuide(true);
      // Clear the param so it doesn't re-trigger
      const next = new URLSearchParams(searchParams);
      next.delete("manual");
      setSearchParams(next, { replace: true });
      // Scroll after the panel expands
      setTimeout(() => {
        manualSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerifyToken = async () => {
    const validated = validateMetaToken(manualToken);
    if (validated.ok === false) {
      setManualTokenError(validated.error);
      setVerifyResult({ ok: false, error: validated.error });
      return;
    }
    setManualTokenError(null);
    setVerifyResult(null);
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-verify-token", {
        body: { accessToken: validated.value },
      });
      if (error) throw error;
      if (data?.ok) {
        setVerifyResult({
          ok: true,
          metaUserName: data.metaUserName,
          adAccountCount: data.adAccountCount,
          grantedScopes: data.grantedScopes ?? [],
        });
        toast.success(`Token verified — ${data.adAccountCount} ad account${data.adAccountCount === 1 ? "" : "s"} accessible`);
      } else {
        const msg = data?.error || "Token verification failed.";
        setVerifyResult({ ok: false, error: msg });
        toast.error(msg);
      }
    } catch (e: any) {
      const msg = e?.message || "Verification request failed.";
      setVerifyResult({ ok: false, error: msg });
      toast.error(msg);
    } finally {
      setVerifying(false);
    }
  };

  const refresh = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    const [c, a, l] = await Promise.all([
      (supabase as any).from("meta_connections").select("*").eq("workspace_id", currentWorkspace.id).order("created_at", { ascending: false }),
      (supabase as any).from("meta_ad_accounts").select("*").eq("workspace_id", currentWorkspace.id).order("account_name"),
      (supabase as any).from("meta_sync_log").select("*").eq("workspace_id", currentWorkspace.id).order("started_at", { ascending: false }).limit(200),
    ]);
    setConnections(c.data ?? []);
    setAccounts(a.data ?? []);
    setSyncLogs(l.data ?? []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [currentWorkspace?.id]);

  const startOAuthForWorkspace = async (workspaceId: string, forceConsent = false) => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-oauth-start", {
        body: { workspaceId, forceConsent },
      });
      if (error) throw error;
      window.open(data.url, "_blank", "width=600,height=700");
      toast.info(
        forceConsent
          ? "Fresh consent screen opened — re-approve every scope, then refresh this page."
          : "Complete sign-in in the popup, then refresh this page.",
      );
    } catch (e: any) {
      toast.error(e.message || "Failed to start OAuth");
    } finally {
      setConnecting(false);
    }
  };

  const [resettingFailed, setResettingFailed] = useState(false);
  const failedConnections = connections.filter(c => c.status !== "active");

  const handleResetFailedAndReconnect = async () => {
    if (!currentWorkspace) {
      toast.error("Workspace not loaded");
      return;
    }
    if (!failedConnections.length) {
      // Nothing to clean — just force a fresh consent.
      await startOAuthForWorkspace(currentWorkspace.id, true);
      return;
    }
    const ok = window.confirm(
      `Delete ${failedConnections.length} failed Meta connection${failedConnections.length === 1 ? "" : "s"} and open a fresh consent screen?`,
    );
    if (!ok) return;

    setResettingFailed(true);
    try {
      const ids = failedConnections.map(c => c.id);
      const { error } = await (supabase as any)
        .from("meta_connections")
        .delete()
        .in("id", ids);
      if (error) throw error;
      toast.success(`Removed ${ids.length} failed connection${ids.length === 1 ? "" : "s"}.`);
      // Refresh local state immediately so the banner clears.
      setConnections(prev => prev.filter(c => !ids.includes(c.id)));
      await startOAuthForWorkspace(currentWorkspace.id, true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to reset connections");
    } finally {
      setResettingFailed(false);
    }
  };

  const handleOAuthConnect = async () => {
    if (workspaceLoading) {
      toast.info("Loading your workspace — please wait a moment and try again.");
      return;
    }
    if (!currentWorkspace) {
      toast.error("No workspace available", {
        description:
          "We couldn't load your workspace. Try the Retry button to reload it, or refresh the page.",
      });
      return;
    }
    await startOAuthForWorkspace(currentWorkspace.id);
  };


  const handleRetryWorkspaceAndConnect = async () => {
    setRetryingWorkspace(true);
    try {
      await refreshWorkspaces();
      // Re-read latest workspace from localStorage / freshly loaded list via context.
      // The context state updates async; poll briefly for currentWorkspace to populate.
      const stored = localStorage.getItem("emm-current-workspace");
      let ws: { id: string } | null = currentWorkspace;
      for (let i = 0; i < 20 && !ws; i++) {
        await new Promise(r => setTimeout(r, 100));
        // currentWorkspace from closure won't update mid-call; rely on a re-render.
        // Best-effort: query workspace_members directly to grab a workspace id.
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) break;
        const { data } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1);
        const wsId = stored || data?.[0]?.workspace_id;
        if (wsId) { ws = { id: wsId }; break; }
      }
      if (!ws) {
        toast.error("Still couldn't load a workspace", {
          description: "Your account may not be a member of any workspace. Contact your admin or sign out and back in.",
        });
        return;
      }
      await startOAuthForWorkspace(ws.id);
    } catch (e: any) {
      toast.error(e?.message || "Retry failed");
    } finally {
      setRetryingWorkspace(false);
    }
  };

  const handleManualConnect = async () => {
    if (!currentWorkspace) return;
    const validated = validateMetaToken(manualToken);
    if (validated.ok === false) {
      setManualTokenError(validated.error);
      toast.error(validated.error);
      return;
    }
    setManualTokenError(null);
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-connect-manual", {
        body: { workspaceId: currentWorkspace.id, accessToken: validated.value },
      });
      if (error) throw error;
      // Edge function returns { error } in the body for validation failures (no HTTP error)
      if (data?.error) throw new Error(data.error);
      if (!data?.ok || !data?.connectionId) throw new Error("Connection was not saved. Please try again.");
      toast.success(`Connected — ${data.accountsDiscovered} ad account${data.accountsDiscovered === 1 ? "" : "s"} discovered`);
      setManualToken("");
      setShowManual(false);
      setVerifyResult(null);
      await refresh();
    } catch (e: any) {
      const msg = e?.message || "Failed to connect";
      setManualTokenError(/token|auth|permission|invalid/i.test(msg) ? msg : null);
      toast.error(msg);
    } finally {
      setConnecting(false);
    }
  };

  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const handleDisconnect = async (id: string) => {
    const conn = connections.find(c => c.id === id);
    const label = conn?.connection_type === "manual" ? "manually connected Meta account" : "Meta account";
    if (!confirm(`Disconnect this ${label}? Linked ad accounts and their mappings will be removed. Synced historical insights will be retained.`)) return;
    setDisconnectingId(id);
    try {
      // Remove dependent ad accounts first (no FK cascade defined)
      await (supabase as any).from("meta_ad_accounts").delete().eq("connection_id", id);
      const { error } = await (supabase as any).from("meta_connections").delete().eq("id", id);
      if (error) throw error;
      toast.success("Meta account disconnected");
      // Reset any open manual-reconnect UI for this connection
      if (manualReconnectId === id) {
        setManualReconnectId(null);
        setManualReconnectToken("");
        setManualReconnectError(null);
      }
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to disconnect");
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleReconnectOAuth = async (id: string) => {
    if (!currentWorkspace) return;
    setReconnectingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("meta-oauth-start", {
        body: { workspaceId: currentWorkspace.id, reconnectId: id },
      });
      if (error) throw error;
      window.open(data.url, "_blank", "width=600,height=700");
      toast.info("Re-authorize in the popup, then refresh this page.");
    } catch (e: any) {
      toast.error(e.message || "Failed to start reconnect");
    } finally {
      setReconnectingId(null);
    }
  };

  const handleManualReconnect = async (id: string) => {
    if (!currentWorkspace) return;
    const validated = validateMetaToken(manualReconnectToken);
    if (validated.ok === false) {
      setManualReconnectError(validated.error);
      toast.error(validated.error);
      return;
    }
    setManualReconnectError(null);
    setReconnectingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("meta-connect-manual", {
        body: {
          workspaceId: currentWorkspace.id,
          accessToken: validated.value,
          reconnectId: id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.ok) throw new Error("Token refresh did not persist. Please try again.");
      toast.success(`Token refreshed — ${data.accountsDiscovered} ad account${data.accountsDiscovered === 1 ? "" : "s"} available`);
      setManualReconnectId(null);
      setManualReconnectToken("");
      await refresh();
    } catch (e: any) {
      const msg = e?.message || "Failed to refresh token";
      setManualReconnectError(/token|auth|permission|invalid/i.test(msg) ? msg : null);
      toast.error(msg);
    } finally {
      setReconnectingId(null);
    }
  };

  const syncInfoFor = (connectionId: string) => {
    const forConn = syncLogs.filter(l => l.connection_id === connectionId);
    const lastSuccess = forConn.find(l => l.status === "success");
    const lastError = forConn.find(l => l.status === "error" || l.status === "failed");
    const lastAny = forConn[0];
    return { lastSuccess, lastError, lastAny };
  };

  type ConnTestResult = {
    ok: boolean;
    summary: string;
    metaUserName?: string | null;
    adAccountCount?: number;
    grantedScopes?: string[];
    missingRequired?: string[];
    missingRecommended?: string[];
    adAccountError?: string | null;
    checkedAt?: string;
    error?: string;
  };
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ConnTestResult>>({});

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("meta-test-connection", {
        body: { connectionId: id },
      });
      if (error) throw error;
      const result: ConnTestResult = {
        ok: !!data?.ok,
        summary: data?.summary || data?.error || (data?.ok ? "Connection healthy" : "Test failed"),
        metaUserName: data?.metaUserName ?? null,
        adAccountCount: data?.adAccountCount ?? 0,
        grantedScopes: data?.grantedScopes ?? [],
        missingRequired: data?.missingRequired ?? [],
        missingRecommended: data?.missingRecommended ?? [],
        adAccountError: data?.adAccountError ?? null,
        checkedAt: data?.checkedAt ?? new Date().toISOString(),
        error: data?.error,
      };
      setTestResults(prev => ({ ...prev, [id]: result }));
      if (result.ok) toast.success(result.summary);
      else toast.error(result.summary);
      // Refresh to pick up status/last_error changes
      refresh();
    } catch (e: any) {
      const msg = e?.message || "Test failed";
      setTestResults(prev => ({ ...prev, [id]: { ok: false, summary: msg, error: msg } }));
      toast.error(msg);
    } finally {
      setTestingId(null);
    }
  };

  const tokenState = (c: MetaConnection): { label: string; tone: "ok" | "warn" | "bad" } => {
    if (c.status !== "active") return { label: "needs reconnect", tone: "bad" };
    if (!c.token_expires_at) return { label: "no expiry", tone: "ok" };
    const ms = new Date(c.token_expires_at).getTime() - Date.now();
    const days = Math.floor(ms / 86_400_000);
    if (days < 0) return { label: "expired", tone: "bad" };
    if (days < 7) return { label: `expires in ${days}d`, tone: "warn" };
    return { label: `expires in ${days}d`, tone: "ok" };
  };

  const handleSync = async () => {
    if (!currentWorkspace) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-sync", {
        body: { workspaceId: currentWorkspace.id },
      });
      if (error) throw error;
      toast.success(`Synced ${data.rowsSynced} rows`);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleMap = async (adAccountId: string, clientId: number | null) => {
    const { error } = await supabase.functions.invoke("meta-map-account", {
      body: { adAccountId, clientId },
    });
    if (error) toast.error(error.message);
    else { toast.success("Updated mapping"); refresh(); }
  };

  const [creatingClientFor, setCreatingClientFor] = useState<string | null>(null);
  const [createDialogAccount, setCreateDialogAccount] = useState<MetaAdAccount | null>(null);
  const [newClientName, setNewClientName] = useState("");
  const [newClientBrand, setNewClientBrand] = useState("");
  const [newClientStatus, setNewClientStatus] = useState<"GREEN" | "YELLOW" | "RED">("GREEN");
  const [newClientBmType, setNewClientBmType] = useState<"Agency BM" | "Own BM">("Agency BM");

  const openCreateClientDialog = (a: MetaAdAccount) => {
    const suggested = a.business_name || a.account_name || a.act_id;
    setCreateDialogAccount(a);
    setNewClientName(suggested);
    setNewClientBrand(a.business_name || suggested);
    setNewClientStatus("GREEN");
    setNewClientBmType("Agency BM");
  };

  const handleCreateClientSubmit = async () => {
    if (!currentWorkspace || !createDialogAccount) return;
    const name = newClientName.trim();
    if (!name) {
      toast.error("Client name is required");
      return;
    }
    const a = createDialogAccount;
    setCreatingClientFor(a.id);
    try {
      const { data: created, error: insErr } = await (supabase as any)
        .from("clients")
        .insert({
          workspace_id: currentWorkspace.id,
          name,
          brand: newClientBrand.trim() || name,
          status: newClientStatus,
          bm_type: newClientBmType,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      const { error: mapErr } = await supabase.functions.invoke("meta-map-account", {
        body: { adAccountId: a.id, clientId: created.id },
      });
      if (mapErr) throw mapErr;
      toast.success(`Created "${name}" and linked this ad account`);
      supabase.functions.invoke("meta-sync", { body: { workspaceId: currentWorkspace.id } }).catch(() => {});
      setCreateDialogAccount(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create client");
    } finally {
      setCreatingClientFor(null);
    }
  };

  return (
    <div className="space-y-6">
      <MetaAppRolePanel />
      <div className="rounded-lg border border-border bg-card p-5">

        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Facebook className="h-4 w-4 text-primary" /> Meta Ads Connections
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Connect Meta Business Manager accounts. Performance data syncs hourly and rolls up to mapped clients.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowWizard(true)} title="Step-by-step troubleshooter">
              <LifeBuoy className="h-3 w-3" />
              <span className="ml-1">Troubleshoot</span>
            </Button>
            <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing || !connections.length}>
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              <span className="ml-1">Sync now</span>
            </Button>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" onClick={handleOAuthConnect} disabled={connecting || workspaceLoading || !currentWorkspace}>
                    {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    <span className="ml-1">Connect with Meta</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-semibold mb-1">What gets connected</p>
                  <ul className="text-xs space-y-0.5 list-disc pl-4">
                    <li>Ad accounts in your Business Manager</li>
                    <li>Campaigns, ad sets & ads</li>
                    <li>Performance metrics (spend, impressions, clicks, conversions)</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {!workspaceLoading && !currentWorkspace && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="space-y-2 flex-1">
              <p className="font-semibold">Workspace not loaded</p>
              <p className="text-destructive/90">
                We couldn't load your workspace context, so connecting a Meta account is disabled. Click Retry to reload your workspace and try connecting again. If the issue persists, your account may not be a member of any workspace.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetryWorkspaceAndConnect}
                disabled={retryingWorkspace || connecting}
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                {retryingWorkspace || connecting
                  ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  : <RotateCw className="h-3 w-3 mr-1.5" />}
                Retry & connect
              </Button>
            </div>
          </div>
        )}

        {connections.length > 0 && (
          <div className="mb-4">
            <MetaScopesLiveBanner connections={connections} />
          </div>
        )}

        {connections.length === 0 && !loading && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-4">

            <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Facebook className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">No Meta accounts connected yet</p>
              <p className="text-xs text-muted-foreground">
                Connect your Meta Business Manager to {currentWorkspace?.name ?? "this workspace"} to start syncing ad data.
              </p>
            </div>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="lg" onClick={handleOAuthConnect} disabled={connecting || workspaceLoading || !currentWorkspace} className="mx-auto">
                    {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Facebook className="h-4 w-4 mr-2" />}
                    Connect with Meta
                    <Info className="h-3.5 w-3.5 ml-2 opacity-70" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-semibold mb-1">What gets connected</p>
                  <ul className="text-xs space-y-0.5 list-disc pl-4">
                    <li>Ad accounts in your Business Manager</li>
                    <li>Campaigns, ad sets & ads</li>
                    <li>Performance metrics (spend, impressions, clicks, conversions)</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              onClick={() => setShowManual(true)}
              className="block mx-auto text-xs text-primary hover:underline"
            >
              Connect with a manual access token instead
            </button>
          </div>
        )}

        <div className="space-y-2">
          {connections.map(c => {
            const ts = tokenState(c);
            const needsAction = ts.tone !== "ok";
            const isReconnecting = reconnectingId === c.id;
            const { lastSuccess, lastError, lastAny } = syncInfoFor(c.id);
            const showError = lastError && (!lastSuccess || new Date(lastError.started_at) > new Date(lastSuccess.started_at));
            return (
              <div key={c.id} className="rounded border border-border bg-accent/30 px-3 py-2 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn(
                      "h-2 w-2 rounded-full shrink-0",
                      ts.tone === "ok" ? "bg-success" : ts.tone === "warn" ? "bg-warning" : "bg-destructive",
                    )} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.meta_user_name || "Unknown user"}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                        <span>{c.connection_type === "oauth" ? "OAuth" : "Manual token"}</span>
                        <span>·</span>
                        <span className={cn(
                          ts.tone === "warn" && "text-warning",
                          ts.tone === "bad" && "text-destructive",
                        )}>
                          {needsAction && <AlertTriangle className="h-3 w-3 inline mr-0.5" />}
                          {ts.label}
                        </span>
                        {c.token_expires_at && (
                          <>
                            <span>·</span>
                            <span>{new Date(c.token_expires_at).toLocaleDateString()}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTestConnection(c.id)}
                      disabled={testingId === c.id}
                      title="Ping Meta and check that this token still has the required scopes"
                    >
                      {testingId === c.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Link2 className="h-3 w-3" />}
                      <span className="ml-1">Test</span>
                    </Button>
                    {c.connection_type === "oauth" ? (
                      <Button
                        size="sm"
                        variant={needsAction ? "default" : "outline"}
                        onClick={() => handleReconnectOAuth(c.id)}
                        disabled={isReconnecting}
                      >
                        {isReconnecting
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <RotateCw className="h-3 w-3" />}
                        <span className="ml-1">Reconnect</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant={needsAction ? "default" : "outline"}
                        onClick={() => {
                          setManualReconnectId(manualReconnectId === c.id ? null : c.id);
                          setManualReconnectToken("");
                        }}
                        disabled={isReconnecting}
                      >
                        <KeyRound className="h-3 w-3" />
                        <span className="ml-1">Refresh token</span>
                      </Button>
                    )}
                    {c.connection_type === "manual" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDisconnect(c.id)}
                        disabled={disconnectingId === c.id || isReconnecting}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                        title="Disconnect this manually connected Meta account"
                      >
                        {disconnectingId === c.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Trash2 className="h-3 w-3" />}
                        <span className="ml-1">Disconnect</span>
                      </Button>
                    ) : (
                      <button
                        onClick={() => handleDisconnect(c.id)}
                        disabled={disconnectingId === c.id}
                        className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-50"
                        title="Disconnect"
                      >
                        {disconnectingId === c.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>

                {testResults[c.id] && (() => {
                  const r = testResults[c.id];
                  const tone = r.ok
                    ? "border-success/40 bg-success/10"
                    : "border-destructive/40 bg-destructive/10";
                  return (
                    <div className={cn("rounded-md border p-2 text-xs space-y-1.5", tone)}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-1.5 min-w-0">
                          {r.ok
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                            : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
                          <div className="min-w-0">
                            <p className={cn("font-medium", r.ok ? "text-success" : "text-destructive")}>
                              {r.ok ? "Connection healthy" : "Connection issue"}
                            </p>
                            <p className="text-muted-foreground break-words">{r.summary}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setTestResults(prev => { const n = { ...prev }; delete n[c.id]; return n; })}
                          className="text-muted-foreground hover:text-foreground p-0.5"
                          title="Dismiss"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      {r.missingRequired && r.missingRequired.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {r.missingRequired.map(s => (
                            <span key={s} className="rounded bg-destructive/20 px-1.5 py-0.5 font-mono text-[10px] text-destructive">
                              missing required: {s}
                            </span>
                          ))}
                        </div>
                      )}
                      {r.missingRecommended && r.missingRecommended.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {r.missingRecommended.map(s => (
                            <span key={s} className="rounded bg-warning/20 px-1.5 py-0.5 font-mono text-[10px] text-warning">
                              missing optional: {s}
                            </span>
                          ))}
                        </div>
                      )}
                      {r.grantedScopes && r.grantedScopes.length > 0 && (
                        <details className="text-[11px] text-muted-foreground">
                          <summary className="cursor-pointer hover:text-foreground">
                            {r.grantedScopes.length} granted scope{r.grantedScopes.length === 1 ? "" : "s"}
                            {typeof r.adAccountCount === "number" && <> · {r.adAccountCount} ad account{r.adAccountCount === 1 ? "" : "s"}</>}
                          </summary>
                          <p className="mt-1 font-mono break-words">{r.grantedScopes.join(", ")}</p>
                        </details>
                      )}
                      {r.checkedAt && (
                        <p className="text-[10px] text-muted-foreground">Checked {new Date(r.checkedAt).toLocaleTimeString()}</p>
                      )}
                    </div>
                  );
                })()}

                {manualReconnectId === c.id && (() => {
                  const reconnectValid = manualReconnectToken.trim().length === 0
                    ? null
                    : validateMetaToken(manualReconnectToken);
                  const reconnectInvalid = reconnectValid?.ok === false;
                  const reconnectInlineError = manualReconnectError ?? (reconnectInvalid ? reconnectValid!.error : null);
                  return (
                    <div className="pl-5 space-y-1">
                      <div className="flex gap-2">
                        <Input
                          value={manualReconnectToken}
                          onChange={e => { setManualReconnectToken(e.target.value); setManualReconnectError(null); }}
                          onBlur={() => {
                            if (manualReconnectToken.trim() && reconnectInvalid) {
                              setManualReconnectError(reconnectValid!.error);
                            }
                          }}
                          placeholder="Paste new Meta access token"
                          aria-invalid={!!reconnectInlineError}
                          aria-describedby={reconnectInlineError ? `reconnect-err-${c.id}` : undefined}
                          className={cn("text-xs", reconnectInlineError && "border-destructive focus-visible:ring-destructive")}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleManualReconnect(c.id)}
                          disabled={isReconnecting || !manualReconnectToken.trim() || reconnectInvalid}
                        >
                          {isReconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Update"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setManualReconnectId(null); setManualReconnectToken(""); setManualReconnectError(null); }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      {reconnectInlineError && (
                        <p id={`reconnect-err-${c.id}`} className="text-xs text-destructive flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{reconnectInlineError}</span>
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div className="pl-5 space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                    <span>Last successful sync:</span>
                    {lastSuccess ? (
                      <span className="text-foreground">
                        {new Date(lastSuccess.started_at).toLocaleString()}
                        {typeof lastSuccess.rows_synced === "number" && (
                          <span className="text-muted-foreground"> · {lastSuccess.rows_synced} rows</span>
                        )}
                        <span className="text-muted-foreground"> · {lastSuccess.trigger}</span>
                      </span>
                    ) : (
                      <span className="italic">never</span>
                    )}
                  </div>
                  {(showError || c.last_error) && (
                    <div className="flex items-start gap-1.5 text-destructive">
                      <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="font-medium">Last error</span>
                        {showError && (
                          <span className="text-muted-foreground"> · {new Date(lastError!.started_at).toLocaleString()}</span>
                        )}
                        <span className="text-foreground">: </span>
                        <span className="break-words">
                          {showError ? lastError!.error_message ?? "Unknown error" : c.last_error}
                        </span>
                      </div>
                    </div>
                  )}
                  {!lastSuccess && !showError && !c.last_error && lastAny && (
                    <p className="text-muted-foreground italic">
                      Sync {lastAny.status} · {new Date(lastAny.started_at).toLocaleString()}
                    </p>
                  )}
                </div>
                {needsAction && (
                  <p className="text-xs text-muted-foreground pl-5">
                    {ts.tone === "bad"
                      ? "This connection is no longer syncing. Reconnect to restore data flow."
                      : "Token expires soon. Reconnect now to avoid sync interruptions."}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-border">
          <button onClick={() => setShowManual(s => !s)} className="text-xs text-primary hover:underline">
            {showManual ? "Hide" : "Use a manual access token instead"}
          </button>
          {showManual && (() => {
            const liveValid = manualToken.trim().length === 0 ? null : validateMetaToken(manualToken);
            const liveInvalid = liveValid?.ok === false;
            const inlineError = manualTokenError ?? (liveInvalid ? liveValid!.error : null);
            const isEmpty = manualToken.trim().length === 0;
            const warnings = !inlineError && !isEmpty ? getTokenWarnings(manualToken) : [];
            const busy = connecting || verifying;
            return (
              <div ref={manualSectionRef} className="mt-3 space-y-3 rounded-md border border-border bg-muted/30 p-3 scroll-mt-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-primary" />
                    Connect with a manual access token
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Use this when OAuth isn't available — for example, a system-user token from Business Settings.
                  </p>
                </div>

                <MetaTokenGuide defaultOpen={autoOpenGuide} />

                <div className="flex gap-2">
                  <Input
                    value={manualToken}
                    onChange={e => { setManualToken(e.target.value); setManualTokenError(null); setVerifyResult(null); }}
                    onBlur={() => {
                      if (manualToken.trim() && liveInvalid) setManualTokenError(liveValid!.error);
                    }}
                    placeholder="EAAG... (paste your Meta access token)"
                    disabled={busy}
                    aria-invalid={!!inlineError}
                    aria-describedby={inlineError ? "manual-token-err" : "manual-token-help"}
                    className={cn("text-xs font-mono", inlineError && "border-destructive focus-visible:ring-destructive")}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleVerifyToken}
                    disabled={busy || isEmpty || liveInvalid}
                    title="Test the token against Meta without saving it"
                  >
                    {verifying ? (
                      <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Verifying…</>
                    ) : "Verify"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleManualConnect}
                    disabled={busy || isEmpty || liveInvalid}
                    aria-busy={connecting}
                  >
                    {connecting ? (
                      <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Connecting…</>
                    ) : "Connect"}
                  </Button>
                </div>

                {inlineError ? (
                  <p id="manual-token-err" className="text-xs text-destructive flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{inlineError}</span>
                  </p>
                ) : isEmpty ? (
                  <p id="manual-token-help" className="text-[11px] text-muted-foreground italic">
                    Paste a token above, then click <span className="text-foreground">Verify</span> to test it or <span className="text-foreground">Connect</span> to save it to this workspace.
                  </p>
                ) : warnings.length > 0 ? (
                  <div id="manual-token-help" className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-foreground space-y-1">
                    <p className="font-medium text-warning flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" /> Heads up before you verify
                    </p>
                    <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                      {warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                    <p className="text-[11px] text-muted-foreground italic">You can still click Verify — Meta will tell us for sure.</p>
                  </div>
                ) : (
                  <p id="manual-token-help" className="text-[11px] text-muted-foreground">
                    Token looks well-formed. Click <span className="text-foreground">Verify</span> to confirm permissions before connecting.
                  </p>
                )}

                {connecting && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground rounded border border-border bg-background/60 px-2 py-1.5">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    <span>Saving connection and discovering ad accounts…</span>
                  </div>
                )}
                {verifying && !connecting && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground rounded border border-border bg-background/60 px-2 py-1.5">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    <span>Checking token with Meta…</span>
                  </div>
                )}

                {verifyResult && verifyResult.ok === true && (
                  <div className="rounded-md border border-success/40 bg-success/10 p-2 text-xs text-foreground flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-medium text-success">Token verified</p>
                      <p className="text-muted-foreground">
                        {verifyResult.metaUserName ? <>Authorized as <span className="text-foreground font-medium">{verifyResult.metaUserName}</span> · </> : null}
                        {verifyResult.adAccountCount} ad account{verifyResult.adAccountCount === 1 ? "" : "s"} accessible
                      </p>
                      {verifyResult.grantedScopes.length > 0 && (
                        <p className="text-muted-foreground">Scopes: <span className="font-mono">{verifyResult.grantedScopes.join(", ")}</span></p>
                      )}
                    </div>
                  </div>
                )}
                {verifyResult && verifyResult.ok === false && (() => {
                  const dx = diagnoseTokenError(verifyResult.error);
                  return (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs space-y-2">
                      <div className="flex items-start gap-2">
                        <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-destructive">{dx.title}</p>
                          <p className="text-muted-foreground">{dx.summary}</p>
                        </div>
                      </div>
                      {dx.missingScopes && dx.missingScopes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {dx.missingScopes.map(s => (
                            <span key={s} className="rounded bg-destructive/20 px-1.5 py-0.5 font-mono text-[10px] text-destructive">
                              missing: {s}
                            </span>
                          ))}
                        </div>
                      )}
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Likely causes</p>
                        <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                          {dx.causes.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">How to fix</p>
                        <ul className="space-y-1">
                          {dx.fixes.map((f, i) => (
                            <li key={i} className="text-foreground">
                              {f.href ? (
                                <a href={f.href} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                                  → {f.label}
                                </a>
                              ) : (
                                <span>→ {f.label}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <details className="text-[11px] text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground">Raw error from Meta</summary>
                        <p className="mt-1 break-words font-mono bg-background/60 p-1.5 rounded">{verifyResult.error}</p>
                      </details>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </div>
      </div>

      {accounts.length > 0 && (
        <AdAccountsByBm
          accounts={accounts}
          clients={clients}
          onMap={handleMap}
          onCreateClient={openCreateClientDialog}
          creatingClientFor={creatingClientFor}
        />
      )}

      <Dialog open={!!createDialogAccount} onOpenChange={(open) => !open && setCreateDialogAccount(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create client from ad account</DialogTitle>
            <DialogDescription>
              {createDialogAccount && (
                <>
                  Linking <span className="font-mono">{createDialogAccount.act_id}</span>
                  {createDialogAccount.account_name ? ` (${createDialogAccount.account_name})` : ""}.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-client-name">Client name</Label>
              <Input
                id="new-client-name"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Acme Co."
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-client-brand">Brand</Label>
              <Input
                id="new-client-brand"
                value={newClientBrand}
                onChange={(e) => setNewClientBrand(e.target.value)}
                placeholder="Brand name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={newClientStatus} onValueChange={(v) => setNewClientStatus(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GREEN">Green</SelectItem>
                    <SelectItem value="YELLOW">Yellow</SelectItem>
                    <SelectItem value="RED">Red</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>BM type</Label>
                <Select value={newClientBmType} onValueChange={(v) => setNewClientBmType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Agency BM">Agency BM</SelectItem>
                    <SelectItem value="Own BM">Own BM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogAccount(null)}
              disabled={!!creatingClientFor}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateClientSubmit}
              disabled={!!creatingClientFor || !newClientName.trim()}
            >
              {creatingClientFor ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Create & link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MetaTroubleshootWizard open={showWizard} onOpenChange={setShowWizard} />
    </div>
  );
}

function AdAccountsByBm({
  accounts,
  clients,
  onMap,
  onCreateClient,
  creatingClientFor,
}: {
  accounts: MetaAdAccount[];
  clients: { id: number; name: string }[];
  onMap: (id: string, clientId: number | null) => void;
  onCreateClient: (a: MetaAdAccount) => void;
  creatingClientFor: string | null;
}) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = accounts.filter(a => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (a.account_name || "").toLowerCase().includes(q) ||
      (a.business_name || "").toLowerCase().includes(q) ||
      a.act_id.toLowerCase().includes(q)
    );
  });

  const groups = new Map<string, { name: string; key: string; rows: MetaAdAccount[] }>();
  for (const a of filtered) {
    const key = a.business_name || "__no_bm__";
    const name = a.business_name || "No Business Manager";
    if (!groups.has(key)) groups.set(key, { key, name, rows: [] });
    groups.get(key)!.rows.push(a);
  }
  const groupList = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  const unmappedCount = accounts.filter(a => !a.client_id).length;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Ad Accounts ({accounts.length})
            <span className="text-xs font-normal text-muted-foreground">· {groupList.length} Business Manager{groupList.length === 1 ? "" : "s"}</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Grouped by Business Manager. Map each ad account to a client.</p>
        </div>
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search BM, account, or act_id…"
          className="h-8 text-xs w-64"
        />
      </div>
      {unmappedCount > 0 && (
        <div className="px-5 py-2.5 bg-warning/10 border-b border-warning/30 flex items-start gap-2 text-xs">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-foreground">{unmappedCount} ad account{unmappedCount === 1 ? "" : "s"} unmapped.</span>
            <span className="text-muted-foreground"> Insights are syncing, but will not appear on client dashboards until each account is linked.</span>
          </div>
        </div>
      )}
      {groupList.length === 0 ? (
        <p className="px-5 py-6 text-xs text-muted-foreground text-center">No ad accounts match "{search}".</p>
      ) : (
        <div className="divide-y divide-border">
          {groupList.map(g => {
            const isCollapsed = !!collapsed[g.key];
            const groupUnmapped = g.rows.filter(a => !a.client_id).length;
            return (
              <div key={g.key}>
                <button
                  onClick={() => setCollapsed(c => ({ ...c, [g.key]: !isCollapsed }))}
                  className="w-full flex items-center gap-2 px-5 py-2 bg-accent/40 hover:bg-accent/60 transition-colors text-left"
                >
                  {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  <Facebook className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground truncate">{g.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {g.rows.length} account{g.rows.length === 1 ? "" : "s"}
                    {groupUnmapped > 0 && <> · <span className="text-warning">{groupUnmapped} unmapped</span></>}
                  </span>
                </button>
                {!isCollapsed && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-background/40">
                        {["Account", "Currency", "Client", "Last Sync"].map(h => (
                          <th key={h} className="px-4 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map(a => (
                        <tr key={a.id} className="border-b border-border/40 last:border-0 hover:bg-accent/20">
                          <td className="px-4 py-2">
                            <div className="font-medium text-foreground text-xs">{a.account_name || a.act_id}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{a.act_id}</div>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground text-xs">{a.currency || "—"}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <select
                                value={a.client_id ?? ""}
                                onChange={e => onMap(a.id, e.target.value ? Number(e.target.value) : null)}
                                className="rounded border border-border bg-background px-2 py-1 text-xs"
                              >
                                <option value="">— Unmapped —</option>
                                {clients.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                              {!a.client_id && (
                                <button
                                  onClick={() => onCreateClient(a)}
                                  disabled={creatingClientFor === a.id}
                                  className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-60"
                                  title="Create a new client from this ad account and link it"
                                >
                                  {creatingClientFor === a.id
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Plus className="h-3 w-3" />}
                                  New client
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-[11px] text-muted-foreground">
                            {a.last_synced_at ? new Date(a.last_synced_at).toLocaleString() : "Never"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
