import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Building2,
  Link2,
  Unlink,
} from "lucide-react";

type Stats = {
  locations: number;
  clientsLinked: number;
  clientsTotal: number;
};

function decodeJwt(token: string): { companyId?: string; type?: string } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return {};
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return {
      companyId: payload.company_id ?? payload.companyId,
      type: payload.user_type ?? payload.type,
    };
  } catch {
    return {};
  }
}

export function GhlAgencyConnectionPanel() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [savedCompanyId, setSavedCompanyId] = useState("");
  const [stats, setStats] = useState<Stats>({ locations: 0, clientsLinked: 0, clientsTotal: 0 });
  const [threshold, setThreshold] = useState(0.9);

  const meta = useMemo(() => decodeJwt(token || savedToken), [token, savedToken]);
  const effectiveCompanyId = companyId || savedCompanyId || meta.companyId || "";
  const isAgencyToken = !!effectiveCompanyId;

  const load = async () => {
    if (!wsId) return;
    setLoading(true);
    const [cfg, locs, clients] = await Promise.all([
      (supabase as any)
        .from("integration_configs")
        .select("ghl_api_key, ghl_company_id")
        .eq("workspace_id", wsId)
        .maybeSingle(),
      (supabase as any)
        .from("ghl_locations")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId),
      (supabase as any)
        .from("clients")
        .select("id, ghl_location_id")
        .eq("workspace_id", wsId),
    ]);
    setSavedToken(cfg?.data?.ghl_api_key ?? "");
    setToken(cfg?.data?.ghl_api_key ?? "");
    setSavedCompanyId(cfg?.data?.ghl_company_id ?? "");
    setCompanyId(cfg?.data?.ghl_company_id ?? "");
    const all = (clients?.data ?? []) as Array<{ ghl_location_id: string | null }>;
    setStats({
      locations: locs?.count ?? 0,
      clientsLinked: all.filter((c) => c.ghl_location_id).length,
      clientsTotal: all.length,
    });
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [wsId]);

  const save = async () => {
    if (!wsId) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("integration_configs")
      .upsert(
        {
          workspace_id: wsId,
          ghl_api_key: token || null,
          ghl_company_id: companyId.trim() || null,
        },
        { onConflict: "workspace_id" },
      );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSavedToken(token);
    setSavedCompanyId(companyId.trim());
    toast.success("Agency connection saved");
  };

  const syncAll = async () => {
    if (!wsId) return;
    setSyncing(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const resp = await fetch(
        `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/ghl-locations-sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ workspace_id: wsId, autoLink: true, threshold }),
        },
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const detail = data?.detail || data?.error || `HTTP ${resp.status}`;
        const hint = data?.hint ? ` — ${data.hint}` : "";
        toast.error(`Sync failed: ${detail}${hint}`, { duration: 10000 });
        return;
      }
      toast.success(
        `Synced ${data?.locations ?? 0} sub-accounts · auto-linked ${data?.linked ?? 0}`,
      );
      load();
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    if (!wsId) return;
    if (!confirm("Disconnect the agency token? Existing client links remain.")) return;
    const { error } = await (supabase as any)
      .from("integration_configs")
      .upsert(
        { workspace_id: wsId, ghl_api_key: null, ghl_company_id: null },
        { onConflict: "workspace_id" },
      );
    if (error) {
      toast.error(error.message);
      return;
    }
    setToken("");
    setSavedToken("");
    setCompanyId("");
    setSavedCompanyId("");
    toast.success("Disconnected");
    load();
  };

  if (!wsId) return null;

  const connected = !!savedToken;
  const dirty = token !== savedToken || companyId.trim() !== savedCompanyId;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              GoHighLevel — Agency Connection
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Connect once at the agency level using an Agency Private Integration Token.
              All sub-accounts (locations) will sync into MetaHub automatically and can be
              auto-linked to clients.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <Badge variant="outline" className="text-success border-success/40">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Not connected
            </Badge>
          )}
        </div>
      </div>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <>
          <div>
            <label className="text-xs text-muted-foreground">
              Agency Private Integration Token
            </label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="pit-... or eyJhbGciOi... (Agency PIT with locations.readonly)"
              className="mt-1 font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              GHL → Agency Settings → Private Integrations. Required scope:{" "}
              <code className="font-mono">locations.readonly</code>.
            </p>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">
              Agency Company ID
            </label>
            <Input
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              placeholder="e.g. abc123XYZ"
              className="mt-1 font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Required for opaque <code className="font-mono">pit-…</code> tokens. Find it in
              your GHL URL: <code className="font-mono">/agency/&lt;COMPANY_ID&gt;/</code>{" "}
              or in Agency Settings → Company.
            </p>
          </div>

          {(token || savedToken) && (
            <div className="rounded-md border border-border bg-accent/30 p-3 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Connection</span>
                {isAgencyToken ? (
                  <Badge variant="outline" className="text-success border-success/40">
                    Agency ready
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-warning border-warning/40">
                    Company ID missing
                  </Badge>
                )}
              </div>
              {effectiveCompanyId && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Company ID</span>
                  <code className="font-mono text-foreground">{effectiveCompanyId}</code>
                </div>
              )}
            </div>
          )}

          {connected && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-border bg-card p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Sub-accounts
                </div>
                <div className="text-lg font-semibold text-foreground mt-0.5">
                  {stats.locations}
                </div>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Clients linked
                </div>
                <div className="text-lg font-semibold text-foreground mt-0.5">
                  {stats.clientsLinked}
                  <span className="text-muted-foreground font-normal text-sm">
                    {" "}/ {stats.clientsTotal}
                  </span>
                </div>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Auto-link threshold
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="range"
                    min={0.5}
                    max={1}
                    step={0.05}
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <span className="text-xs font-mono text-foreground w-10 text-right">
                    {Math.round(threshold * 100)}%
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving || !dirty} size="sm">
              {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {connected ? "Update token" : "Connect"}
            </Button>
            <Button
              onClick={syncAll}
              disabled={syncing || !savedToken}
              variant="outline"
              size="sm"
            >
              {syncing ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Sync all sub-accounts
            </Button>
            {connected && (
              <Button
                onClick={disconnect}
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
              >
                <Unlink className="h-3 w-3 mr-1" />
                Disconnect
              </Button>
            )}
          </div>

          {connected && stats.locations > 0 && stats.clientsLinked < stats.clientsTotal && (
            <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 p-2.5 text-xs">
              <Link2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <span className="text-muted-foreground">
                Use the <span className="font-medium text-foreground">Integration Mapper</span> below
                to review fuzzy matches and link the remaining {stats.clientsTotal - stats.clientsLinked} client(s) to their GHL sub-account.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
