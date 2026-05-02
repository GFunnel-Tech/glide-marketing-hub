import { useState } from "react";
import { useTeamMembers } from "@/hooks/useDatabase";
import { cn } from "@/lib/utils";
import { Copy, ExternalLink, Check, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetaConnectionsPanel } from "@/components/integrations/MetaConnectionsPanel";

const integrations = [
  { name: "Meta Ads API", type: "oauth", connected: true, lastSync: "2 min ago" },
  { name: "GoHighLevel", type: "apikey", connected: true, lastSync: "5 min ago" },
  { name: "Plai", type: "apikey", connected: true, lastSync: "1 hr ago", extra: "28/32 accounts connected" },
  { name: "ClickUp", type: "oauth", connected: false, lastSync: null },
  { name: "Play.ai", type: "apikey", connected: false, lastSync: null, docUrl: "https://docs.play.ai/api-reference/agents/introduction" },
  { name: "n8n Webhooks", type: "display", connected: true, lastSync: "Live", url: "https://apihub.gfunnel.com/webhook" },
];

const notifications = [
  { key: "cpl_alert", label: "CPL Alert", description: "When CPL exceeds threshold", hasInput: true, inputLabel: "Threshold ($)" },
  { key: "frequency_alert", label: "Frequency Alert", description: "When ad frequency gets too high" },
  { key: "zero_spend", label: "Zero Spend Alert", description: "Campaign with zero spend detected" },
  { key: "double_count", label: "Double Count Detected", description: "Lead duplication confirmed" },
  { key: "weekly_summary", label: "Weekly Portfolio Summary", description: "Sent every Monday", hasInput: true, inputLabel: "Email" },
  { key: "monthly_reminder", label: "Monthly Report Reminder", description: "Reminder to generate reports" },
  { key: "bm_quality", label: "Agency BM Quality Alert", description: "When BM quality drops" },
];

export default function Settings() {
  const { data: teamMembers = [] } = useTeamMembers();
  const [copied, setCopied] = useState(false);
  const [enabledNotifs, setEnabledNotifs] = useState<Record<string, boolean>>({ cpl_alert: true, double_count: true, weekly_summary: true });

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>

      <Tabs defaultValue="agency" className="space-y-4">
        <TabsList>
          <TabsTrigger value="agency">Agency</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

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
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Performance Thresholds</h3>
              {[
                { label: "DSCR CPL Target", min: 0, max: 100, defaultVal: 30, unit: "$" },
                { label: "Canadian Refi CPL", min: 0, max: 30, defaultVal: 15, unit: "$" },
                { label: "Frequency Alert", min: 1, max: 5, defaultVal: 3.5, unit: "" },
                { label: "Double-count Threshold", min: 0, max: 100, defaultVal: 20, unit: "%" },
              ].map(t => (
                <div key={t.label}>
                  <div className="flex justify-between"><label className="text-xs text-muted-foreground">{t.label}</label><span className="text-xs font-medium text-foreground">{t.unit}{t.defaultVal}{t.unit === "%" ? "%" : ""}</span></div>
                  <input type="range" min={t.min} max={t.max} step={t.unit === "" ? 0.1 : 1} defaultValue={t.defaultVal} className="w-full mt-1 accent-primary" />
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <MetaConnectionsPanel />
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
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            {notifications.map(n => (
              <div key={n.key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{n.label}</p>
                  <p className="text-xs text-muted-foreground">{n.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  {n.hasInput && enabledNotifs[n.key] && <Input placeholder={n.inputLabel} className="h-7 w-24 text-xs" />}
                  <Switch checked={!!enabledNotifs[n.key]} onCheckedChange={v => setEnabledNotifs(p => ({ ...p, [n.key]: v }))} />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
