import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTeamMembers } from "@/hooks/useDatabase";
import { cn } from "@/lib/utils";
import { Copy, ExternalLink, Check, Loader2, UserPlus, Bell, Zap } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetaConnectionsPanel } from "@/components/integrations/MetaConnectionsPanel";
import { KpiThresholdsPanel } from "@/components/settings/KpiThresholdsPanel";
import { CustomKpisPanel } from "@/components/kpi/CustomKpisPanel";
import { GhlClickupPanel } from "@/components/integrations/GhlClickupPanel";
import { IntegrationMapper } from "@/components/integrations/IntegrationMapper";
import { StatusPhasesPanel } from "@/components/settings/StatusPhasesPanel";
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
  const { data: teamMembers = [] } = useTeamMembers();
  const [copied, setCopied] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const validTabs = ["agency", "integrations", "team", "kpis", "statuses", "notifications"] as const;
  const initialTab = (validTabs as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as typeof validTabs[number])
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
          <TabsTrigger value="kpis">KPI Thresholds</TabsTrigger>
          <TabsTrigger value="statuses">Statuses &amp; Webhooks</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="statuses">
          <StatusPhasesPanel />
        </TabsContent>

        <TabsContent value="kpis">
          <div className="rounded-lg border border-border bg-card p-6">
            <KpiThresholdsPanel />
          </div>
        </TabsContent>

        <TabsContent value="agency" className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Agency Info</h3>
              <div><label className="text-xs text-muted-foreground">Agency Name</label><Input defaultValue="" placeholder="Your agency name" className="mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">Contact Email</label><Input defaultValue="" placeholder="contact@youragency.com" className="mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">Timezone</label>
                <select className="w-full mt-1 rounded-md border border-border bg-accent px-3 py-2 text-sm">
                  <option>America/New_York (EST)</option>
                  <option>America/Chicago (CST)</option>
                  <option>America/Los_Angeles (PST)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Logo</label>
                <div className="mt-1 rounded-lg border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground hover:border-primary/40 transition-colors cursor-pointer">
                  Drop logo here or click to upload
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-dashed border-border bg-card/50 p-5 text-sm text-muted-foreground">
              Performance thresholds have moved to the <span className="font-medium text-foreground">KPI Thresholds</span> tab, where you can configure them per workspace, vertical, or individual client.
            </div>
          </div>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <MetaConnectionsPanel />
          <GhlClickupPanel />
          <IntegrationMapper />
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

        <TabsContent value="team">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Team Members</h3>
              <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 flex items-center gap-1"><UserPlus className="h-3 w-3" />Invite Member</button>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-accent/50">
                {["Name", "Role", "Access Level", "Status", ""].map(h => <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{h}</th>)}
              </tr></thead>
              <tbody>
                {teamMembers.map(m => (
                  <tr key={m.id} className="border-b border-border hover:bg-accent/30">
                    <td className="px-4 py-3 font-medium text-foreground">{m.name}</td>
                    <td className="px-4 py-3"><span className="rounded bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">{m.role}</span></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{m.access_level}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-success/15 text-success px-2 py-0.5 text-xs font-medium">{m.member_status}</span></td>
                    <td className="px-4 py-3"><button className="text-xs text-primary hover:underline">Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationPreferencesPanel />
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
