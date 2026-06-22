import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Copy, ExternalLink, Check, Loader2, Bell, Zap } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetaConnectionsPanel } from "@/components/integrations/MetaConnectionsPanel";
import { KpiThresholdsPanel } from "@/components/settings/KpiThresholdsPanel";
import { CustomKpisPanel } from "@/components/kpi/CustomKpisPanel";
import { GuaranteeTemplatesPanel } from "@/components/guarantees/GuaranteeTemplatesPanel";
import { GhlClickupPanel } from "@/components/integrations/GhlClickupPanel";
import { GhlAgencyConnectionPanel } from "@/components/integrations/GhlAgencyConnectionPanel";
import { IntegrationMapper } from "@/components/integrations/IntegrationMapper";
import { ClientAccountMapper } from "@/components/integrations/ClientAccountMapper";
import { SharedAdAccountsPanel } from "@/components/integrations/SharedAdAccountsPanel";
import { MatchReviewQueue } from "@/components/integrations/MatchReviewQueue";
import { StatusPhasesPanel } from "@/components/settings/StatusPhasesPanel";
import { AgencyProfilePanel } from "@/components/settings/AgencyProfilePanel";
import { WebhooksPanel } from "@/components/settings/WebhooksPanel";
import { TeamMembersPanel } from "@/components/settings/TeamMembersPanel";
import { EmbedTabsPanel } from "@/components/settings/EmbedTabsPanel";
import { NOTIFICATION_EVENTS, useNotificationPreferences, type NotificationEventType } from "@/hooks/useNotificationPreferences";
import { useWorkspace } from "@/contexts/WorkspaceContext";

const integrations = [
  { name: "Meta Ads API", type: "oauth", connected: true, lastSync: "2 min ago" },
  { name: "GoHighLevel", type: "apikey", connected: true, lastSync: "5 min ago" },
  { name: "Plai", type: "apikey", connected: true, lastSync: "1 hr ago", extra: "28/32 accounts connected", docUrl: "https://plai.io" },
  { name: "ClickUp", type: "oauth", connected: false, lastSync: null },
  { name: "n8n Webhooks", type: "display", connected: true, lastSync: "Live", url: "https://apihub.gfunnel.com/webhook" },
];

export default function Settings() {
  const [copied, setCopied] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const validTabs = ["agency", "integrations", "team", "kpis", "guarantees", "statuses", "notifications"] as const;
  // "custom_kpis" was merged into the combined "kpis" tab; keep old deep links working.
  const normalizedTabParam = tabParam === "custom_kpis" ? "kpis" : tabParam;
  const initialTab = (validTabs as readonly string[]).includes(normalizedTabParam ?? "")
    ? (normalizedTabParam as typeof validTabs[number])
    : "agency";

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>

      <Tabs
        value={initialTab}
        onValueChange={(v) => {
          const next = new URLSearchParams(searchParams);
          next.set("tab", v);
          setSearchParams(next, { replace: true });
        }}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="agency">Agency</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="kpis">KPIs</TabsTrigger>
          <TabsTrigger value="guarantees">Guarantees</TabsTrigger>
          <TabsTrigger value="statuses">Statuses</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="statuses">
          <StatusPhasesPanel />
        </TabsContent>

        <TabsContent value="kpis" className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-6">
            <KpiThresholdsPanel />
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <CustomKpisPanel />
          </div>
        </TabsContent>

        <TabsContent value="guarantees">
          <div className="rounded-lg border border-border bg-card p-6">
            <GuaranteeTemplatesPanel />
          </div>
        </TabsContent>

        <TabsContent value="agency" className="space-y-6">
          <AgencyProfilePanel />
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <Tabs defaultValue="meta" className="space-y-4">
            <TabsList>
              <TabsTrigger value="meta">Meta Ads</TabsTrigger>
              <TabsTrigger value="ghl">GoHighLevel</TabsTrigger>
              <TabsTrigger value="mapping">Account Mapping</TabsTrigger>
              <TabsTrigger value="other">Other</TabsTrigger>
            </TabsList>

            <TabsContent value="meta" className="space-y-4">
              <MetaConnectionsPanel />
            </TabsContent>

            <TabsContent value="ghl" className="space-y-4">
              <GhlAgencyConnectionPanel />
              <GhlClickupPanel />
            </TabsContent>

            <TabsContent value="mapping" className="space-y-4">
              {/* Primary: map everything onto one client account */}
              <ClientAccountMapper />
              {/* Multi-client (shared) ad accounts + per-campaign attribution */}
              <SharedAdAccountsPanel />
              {/* Suggested auto-matches to review */}
              <MatchReviewQueue />
              {/* Advanced: bulk view by integration type */}
              <details className="rounded-lg border border-border bg-card">
                <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-foreground">
                  Advanced · bulk mapping by integration type
                </summary>
                <div className="px-1 pb-1">
                  <IntegrationMapper />
                </div>
              </details>
            </TabsContent>

            <TabsContent value="other" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {integrations.map(int => (
                  <div key={int.name} className={cn("rounded-lg border p-5 space-y-3", int.connected ? "border-border bg-card" : "border-destructive/30 bg-card")}>
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-foreground">{int.name}</h4>
                      <span className={cn("h-2.5 w-2.5 rounded-full", int.connected ? "bg-success" : "bg-destructive")} />
                    </div>
                    {int.lastSync && <p className="text-xs text-muted-foreground">Last synced: {int.lastSync}</p>}
                    {int.extra && <p className="text-xs text-muted-foreground">{int.extra}</p>}
                    {int.type === "apikey" && (
                      <Input type="password" defaultValue={int.connected ? "sk-••••••••••••" : ""} placeholder="Enter API key..." className="text-xs" />
                    )}
                    {int.type === "display" && int.url && (
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded bg-accent px-2 py-1 text-xs text-foreground">{int.url}</code>
                        <button onClick={() => copyUrl(int.url!)} className="text-muted-foreground hover:text-foreground">
                          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    )}
                    <div className="flex gap-2">
                      {int.type !== "display" && <button className="rounded bg-accent px-3 py-1.5 text-xs font-medium hover:bg-accent/80">Test Connection</button>}
                      {!int.connected && <button className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Connect</button>}
                      {int.connected && int.type !== "display" && <button className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">Reconnect</button>}
                      {int.docUrl && <a href={int.docUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">View docs <ExternalLink className="h-3 w-3" /></a>}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="team">
          <TeamMembersPanel />
        </TabsContent>

        <TabsContent value="notifications">
          <Tabs
            value={["preferences", "webhooks"].includes(searchParams.get("section") ?? "") ? searchParams.get("section")! : "preferences"}
            onValueChange={(v) => {
              const next = new URLSearchParams(searchParams);
              next.set("tab", "notifications");
              next.set("section", v);
              setSearchParams(next, { replace: true });
            }}
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="preferences">Preferences</TabsTrigger>
              <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            </TabsList>
            <TabsContent value="preferences">
              <NotificationPreferencesPanel />
            </TabsContent>
            <TabsContent value="webhooks">
              <WebhooksPanel />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NotificationPreferencesPanel() {
  const { currentWorkspace } = useWorkspace();
  const { isLoading, getPref, upsert } = useNotificationPreferences();

  if (!currentWorkspace) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Select a workspace to manage notification preferences.
      </div>
    );
  }

  const handleToggle = async (
    eventType: NotificationEventType,
    field: "in_app_enabled" | "realtime_enabled",
    value: boolean,
  ) => {
    try {
      await upsert.mutateAsync({ eventType, [field]: value });
    } catch (e: any) {
      toast.error(e?.message || "Failed to update preference");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Notification preferences</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Choose which events create notifications and which arrive in realtime. Preferences are
            scoped to <span className="text-foreground font-medium">{currentWorkspace.name}</span>.
          </p>
        </div>

        <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-1 items-center text-xs text-muted-foreground pb-2 border-b border-border">
          <span>Event</span>
          <span className="flex items-center gap-1 justify-end"><Bell className="h-3 w-3" /> In-app</span>
          <span className="flex items-center gap-1 justify-end"><Zap className="h-3 w-3" /> Realtime</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading preferences…
          </div>
        ) : (
          NOTIFICATION_EVENTS.map(evt => {
            const pref = getPref(evt.key);
            return (
              <div
                key={evt.key}
                className="grid grid-cols-[1fr_auto_auto] gap-x-6 items-center py-3 border-b border-border last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{evt.label}</p>
                  <p className="text-xs text-muted-foreground">{evt.description}</p>
                </div>
                <div className="flex justify-end">
                  <Switch
                    checked={pref.in_app_enabled}
                    onCheckedChange={v => handleToggle(evt.key, "in_app_enabled", v)}
                    disabled={upsert.isPending}
                    aria-label={`Enable in-app notifications for ${evt.label}`}
                  />
                </div>
                <div className="flex justify-end">
                  <Switch
                    checked={pref.realtime_enabled && pref.in_app_enabled}
                    onCheckedChange={v => handleToggle(evt.key, "realtime_enabled", v)}
                    disabled={upsert.isPending || !pref.in_app_enabled}
                    aria-label={`Enable realtime updates for ${evt.label}`}
                  />
                </div>
              </div>
            );
          })
        )}

        <p className="text-xs text-muted-foreground mt-4">
          When in-app is off, no notification is created for that event. When realtime is off, the
          bell will refresh on next page load instead of pushing live.
        </p>
      </div>
    </div>
  );
}
