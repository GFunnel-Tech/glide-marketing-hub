import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Copy, Trash2, Code2, Activity, Tag, Box, FlaskConical } from "lucide-react";
import { useAdAccount } from "@/contexts/AdAccountContext";

type Props = { clientId?: number | null; title?: string };

const PLATFORMS = [
  { id: "meta", label: "Meta Pixel" },
  { id: "google", label: "Google (GA4 / Ads)" },
  { id: "tiktok", label: "TikTok Pixel" },
  { id: "linkedin", label: "LinkedIn Insight" },
  { id: "snapchat", label: "Snapchat Pixel" },
  { id: "pinterest", label: "Pinterest Tag" },
];

const TAG_TYPES = [
  { id: "custom_html", label: "Custom HTML / JS" },
  { id: "image_pixel", label: "Image pixel (1x1)" },
  { id: "conversion", label: "Conversion event" },
];

const TRIGGER_TYPES = [
  { id: "pageview", label: "Page view" },
  { id: "event", label: "Custom event" },
  { id: "click", label: "Click" },
];

export function TrackingPanel({ clientId = null, title = "Tracking" }: Props) {
  const { currentWorkspace } = useWorkspace();
  const { accounts } = useAdAccount();
  const qc = useQueryClient();
  const workspaceId = currentWorkspace?.id;
  const [activeContainerId, setActiveContainerId] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<string>("__any"); // "__any" | "none" | "all" | act_id

  const { data: containers = [] } = useQuery({
    queryKey: ["tracking_containers", workspaceId, clientId],
    enabled: !!workspaceId,
    queryFn: async () => {
      let q = supabase.from("tracking_containers").select("*").eq("workspace_id", workspaceId!);
      if (clientId != null) q = q.eq("client_id", clientId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filteredContainers = useMemo(() => {
    if (accountFilter === "__any") return containers;
    if (accountFilter === "none") return containers.filter((c: any) => !c.ad_account_id);
    return containers.filter((c: any) => c.ad_account_id === accountFilter);
  }, [containers, accountFilter]);

  const container = useMemo(
    () => filteredContainers.find((c) => c.id === activeContainerId) || filteredContainers[0] || null,
    [filteredContainers, activeContainerId],
  );

  const createContainer = useMutation({
    mutationFn: async (input: { name: string; ad_account_id: string | null }) => {
      const { data, error } = await supabase
        .from("tracking_containers")
        .insert({
          name: input.name,
          workspace_id: workspaceId!,
          client_id: clientId,
          ad_account_id: input.ad_account_id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (c) => {
      toast.success("Container created");
      qc.invalidateQueries({ queryKey: ["tracking_containers"] });
      setActiveContainerId(c.id);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateContainer = useMutation({
    mutationFn: async (input: { id: string; ad_account_id: string | null }) => {
      const { error } = await supabase
        .from("tracking_containers")
        .update({ ad_account_id: input.ad_account_id })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["tracking_containers"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!workspaceId) return null;

  if (containers.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="rounded-full bg-primary/10 p-3"><Box className="h-6 w-6 text-primary" /></div>
          <p className="text-sm text-muted-foreground">No tracking container yet</p>
          <NewContainerDialog accounts={accounts} onCreate={(n, a) => createContainer.mutate({ name: n, ad_account_id: a })} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-lg font-semibold">{title}</h3>
          {filteredContainers.length > 1 && (
            <Select value={container?.id} onValueChange={setActiveContainerId}>
              <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {filteredContainers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__any">Any scope</SelectItem>
              <SelectItem value="none">N/A (default)</SelectItem>
              <SelectItem value="all">All accounts (notifications)</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <NewContainerDialog accounts={accounts} onCreate={(n, a) => createContainer.mutate({ name: n, ad_account_id: a })} />
      </div>

      {container ? (
        <>
          <ContainerAccountRow
            container={container}
            accounts={accounts}
            onChange={(a) => updateContainer.mutate({ id: container.id, ad_account_id: a })}
          />
          <ContainerView container={container} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-6">No containers match this ad account.</p>
      )}
    </div>
  );
}

function scopeHint(value: string) {
  if (value === "none") return "Default. Events are stored but not linked to any ad account report.";
  if (value === "all") return "Notification only. Events trigger alerts but are not added to any individual account report.";
  return "Events from this container are attached to this specific account's report and log.";
}

function ContainerAccountRow({
  container, accounts, onChange,
}: { container: any; accounts: { id: string; name: string }[]; onChange: (a: string | null) => void }) {
  const value = container.ad_account_id ?? "none";
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span className="text-muted-foreground">Ad Account scope:</span>
        <Select
          value={value}
          onValueChange={(v) => onChange(v === "none" ? null : v)}
        >
          <SelectTrigger className="h-8 w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">N/A (default — no account)</SelectItem>
            <SelectItem value="all">All accounts (notifications only)</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">{scopeHint(value)}</p>
    </div>
  );
}

function NewContainerDialog({
  accounts, onCreate,
}: { accounts: { id: string; name: string }[]; onCreate: (n: string, adAccountId: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [account, setAccount] = useState<string>("none"); // default N/A
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />New container</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New tracking container</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Main site" />
          </div>
          <div>
            <Label>Ad Account scope</Label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">N/A (default — no account)</SelectItem>
                <SelectItem value="all">All accounts (notifications only)</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">{scopeHint(account)}</p>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              onCreate(name || "Untitled", account === "none" ? null : account);
              setOpen(false); setName(""); setAccount("none");
            }}
          >Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContainerView({ container }: { container: any }) {
  return (
    <Tabs defaultValue="install">
      <TabsList>
        <TabsTrigger value="install"><Code2 className="h-3.5 w-3.5 mr-1.5" />Install</TabsTrigger>
        <TabsTrigger value="pixels"><FlaskConical className="h-3.5 w-3.5 mr-1.5" />Pixels</TabsTrigger>
        <TabsTrigger value="tags"><Tag className="h-3.5 w-3.5 mr-1.5" />Tags</TabsTrigger>
        <TabsTrigger value="events"><Activity className="h-3.5 w-3.5 mr-1.5" />Events</TabsTrigger>
      </TabsList>
      <TabsContent value="install" className="pt-4"><InstallTab container={container} /></TabsContent>
      <TabsContent value="pixels" className="pt-4"><PixelsTab container={container} /></TabsContent>
      <TabsContent value="tags" className="pt-4"><TagsTab container={container} /></TabsContent>
      <TabsContent value="events" className="pt-4"><EventsTab container={container} /></TabsContent>
    </Tabs>
  );
}

function InstallTab({ container }: { container: any }) {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const src = `${url}/functions/v1/track?key=${encodeURIComponent(container.public_key)}`;
  const snippet = `<!-- Lovable Tracking -->\n<script>\n  window.lv = window.lv || function(){(window.lv.q=window.lv.q||[]).push(arguments)};\n</script>\n<script async src="${src}"></script>`;
  const copy = () => { navigator.clipboard.writeText(snippet); toast.success("Copied"); };
  const eventSample = `lv('event', 'purchase', { value: 49.00, currency: 'USD' });`;
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs uppercase text-muted-foreground">Container ID</Label>
        <div className="font-mono text-sm mt-1">{container.public_key}</div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Install snippet (paste in &lt;head&gt;)</Label>
          <Button size="sm" variant="outline" onClick={copy}><Copy className="h-3.5 w-3.5 mr-1" />Copy</Button>
        </div>
        <pre className="rounded-md border border-border bg-muted/40 p-3 text-xs overflow-auto">{snippet}</pre>
      </div>
      <div>
        <Label>Fire a custom event</Label>
        <pre className="rounded-md border border-border bg-muted/40 p-3 text-xs overflow-auto mt-2">{eventSample}</pre>
      </div>
    </div>
  );
}

function PixelsTab({ container }: { container: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState("meta");
  const [pixelId, setPixelId] = useState("");
  const [label, setLabel] = useState("");

  const { data: pixels = [] } = useQuery({
    queryKey: ["tracking_pixels", container.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_pixels").select("*").eq("container_id", container.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tracking_pixels").insert({
        container_id: container.id, workspace_id: container.workspace_id,
        client_id: container.client_id, platform, pixel_id: pixelId, label,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Pixel added"); qc.invalidateQueries({ queryKey: ["tracking_pixels", container.id] }); setOpen(false); setPixelId(""); setLabel(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (p: any) => { const { error } = await supabase.from("tracking_pixels").update({ enabled: !p.enabled }).eq("id", p.id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tracking_pixels", container.id] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("tracking_pixels").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["tracking_pixels", container.id] }); },
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add pixel</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add pixel</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Platform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Pixel ID</Label><Input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="123456789012345" /></div>
              <div><Label>Label (optional)</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
            </div>
            <DialogFooter><Button onClick={() => add.mutate()} disabled={!pixelId}>Add</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {pixels.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No pixels yet</p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {pixels.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between p-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{PLATFORMS.find((x) => x.id === p.platform)?.label || p.platform}</Badge>
                  <span className="font-mono text-sm">{p.pixel_id}</span>
                  {p.label && <span className="text-xs text-muted-foreground">— {p.label}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={p.enabled} onCheckedChange={() => toggle.mutate(p)} />
                <Button size="icon" variant="ghost" onClick={() => remove.mutate(p.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TagsTab({ container }: { container: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tagType, setTagType] = useState("custom_html");
  const [code, setCode] = useState("");
  const [triggerType, setTriggerType] = useState("pageview");
  const [triggerEvent, setTriggerEvent] = useState("");

  const { data: tags = [] } = useQuery({
    queryKey: ["tracking_tags", container.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_tags").select("*").eq("container_id", container.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tracking_tags").insert({
        container_id: container.id, workspace_id: container.workspace_id,
        name, tag_type: tagType, code,
        trigger_type: triggerType, trigger_event: triggerType === "event" ? triggerEvent : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tag created"); qc.invalidateQueries({ queryKey: ["tracking_tags", container.id] }); setOpen(false); setName(""); setCode(""); setTriggerEvent(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (t: any) => { const { error } = await supabase.from("tracking_tags").update({ enabled: !t.enabled }).eq("id", t.id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tracking_tags", container.id] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("tracking_tags").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tracking_tags", container.id] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New tag</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New tag</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div>
                <Label>Tag type</Label>
                <Select value={tagType} onValueChange={setTagType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TAG_TYPES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Code / URL</Label><Textarea rows={4} value={code} onChange={(e) => setCode(e.target.value)} placeholder="<script>...</script> or pixel URL" /></div>
              <div>
                <Label>Trigger</Label>
                <Select value={triggerType} onValueChange={setTriggerType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TRIGGER_TYPES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {triggerType === "event" && (
                <div><Label>Event name</Label><Input value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)} placeholder="purchase" /></div>
              )}
            </div>
            <DialogFooter><Button onClick={() => add.mutate()} disabled={!name}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No tags yet</p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {tags.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between p-3">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{t.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-[10px]">{TAG_TYPES.find((x) => x.id === t.tag_type)?.label || t.tag_type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {t.trigger_type === "event" ? `on event "${t.trigger_event}"` : `on ${t.trigger_type}`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={t.enabled} onCheckedChange={() => toggle.mutate(t)} />
                <Button size="icon" variant="ghost" onClick={() => remove.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventsTab({ container }: { container: any }) {
  const [filter, setFilter] = useState("");
  const { data: events = [], refetch, isFetching } = useQuery({
    queryKey: ["tracking_events", container.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_events").select("*").eq("container_id", container.id)
        .order("occurred_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000,
  });
  const filtered = filter ? events.filter((e: any) => e.event_name.toLowerCase().includes(filter.toLowerCase())) : events;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input placeholder="Filter by event name" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 max-w-xs" />
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>Refresh</Button>
        <span className="text-xs text-muted-foreground ml-auto">Live · auto-refresh 5s</span>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No events yet — install the snippet to start receiving events.</p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border max-h-[480px] overflow-auto">
          {filtered.map((e: any) => (
            <div key={e.id} className="p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge>{e.event_name}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(e.occurred_at).toLocaleString()}</span>
              </div>
              {e.url && <div className="text-xs text-muted-foreground mt-1 truncate">{e.url}</div>}
              {e.properties && Object.keys(e.properties).length > 0 && (
                <pre className="text-[11px] font-mono bg-muted/40 rounded p-2 mt-1 overflow-auto">{JSON.stringify(e.properties, null, 2)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
