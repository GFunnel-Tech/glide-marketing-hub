import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useQuery } from "@tanstack/react-query";
import { useCustomKpis } from "@/hooks/useCustomKpis";
import {
  useWebhookEndpoints,
  type WebhookEndpoint,
  type WebhookEndpointInput,
} from "@/hooks/useWebhookEndpoints";
import {
  buildWebhookEventCatalog,
  labelForEventKey,
  ALL_EVENTS_KEY,
} from "@/lib/webhookEvents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Webhook,
  Plus,
  Trash2,
  Send,
  Loader2,
  Pencil,
  CheckCircle2,
  XCircle,
  Globe,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface StatusPhaseLite {
  status_key: string;
  label: string;
  sort_order: number;
}

const EMPTY_FORM: WebhookEndpointInput = {
  name: "",
  url: "",
  description: "",
  events: [],
  secret: "",
  headers: {},
  enabled: true,
};

export function WebhooksPanel() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const { endpoints, isLoading, save, remove, setEnabled, test } = useWebhookEndpoints();
  const { data: customKpis = [] } = useCustomKpis();

  const { data: phases = [] } = useQuery({
    queryKey: ["client_status_phases", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_status_phases")
        .select("status_key, label, sort_order")
        .eq("workspace_id", wsId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as StatusPhaseLite[];
    },
  });

  const catalog = useMemo(
    () => buildWebhookEventCatalog(phases, customKpis.map(k => ({ id: k.id, name: k.name }))),
    [phases, customKpis],
  );

  const [editing, setEditing] = useState<WebhookEndpoint | null>(null);
  const [creating, setCreating] = useState(false);

  if (!wsId) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Select a workspace to manage webhooks.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Webhook className="h-4 w-4" />Webhooks
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Send a signed HTTP POST to external software whenever an event fires — status
              indicators (Red/Yellow/Green &amp; lifecycle phases), signals (leads, messages,
              guarantees, AI actions), and your custom-programmed KPIs. Point one at n8n, Zapier,
              a Slack relay, or any URL to notify other tools and threads.
            </p>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setCreating(true); }}>
            <Plus className="h-3 w-3 mr-1" />Add webhook
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : endpoints.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center">
            <Globe className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-foreground font-medium">No webhooks yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add one to start notifying external software when events fire.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {endpoints.map(ep => (
              <EndpointRow
                key={ep.id}
                ep={ep}
                catalog={catalog}
                onEdit={() => { setCreating(false); setEditing(ep); }}
                onDelete={() => {
                  if (confirm(`Delete webhook "${ep.name}"?`)) {
                    remove.mutate(ep.id, {
                      onSuccess: () => toast.success("Webhook deleted"),
                      onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
                    });
                  }
                }}
                onToggle={v =>
                  setEnabled.mutate({ id: ep.id, enabled: v }, {
                    onError: (e: any) => toast.error(e?.message ?? "Failed to update"),
                  })
                }
                onTest={() =>
                  test.mutate({ endpoint_id: ep.id }, {
                    onSuccess: r => r.ok ? toast.success("Test delivered") : toast.error(r.message || "Test failed"),
                    onError: (e: any) => toast.error(e?.message ?? "Test failed"),
                  })
                }
                testing={test.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {(creating || editing) && (
        <EndpointDialog
          open
          endpoint={editing}
          catalog={catalog}
          saving={save.isPending}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={(form) =>
            save.mutate(
              { id: editing?.id, ...form },
              {
                onSuccess: () => {
                  toast.success(editing ? "Webhook updated" : "Webhook created");
                  setCreating(false);
                  setEditing(null);
                },
                onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
              },
            )
          }
        />
      )}
    </div>
  );
}

function EndpointRow({
  ep, catalog, onEdit, onDelete, onToggle, onTest, testing,
}: {
  ep: WebhookEndpoint;
  catalog: ReturnType<typeof buildWebhookEventCatalog>;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (v: boolean) => void;
  onTest: () => void;
  testing: boolean;
}) {
  const subscribesAll = ep.events.length === 0 || ep.events.includes(ALL_EVENTS_KEY);
  const eventLabels = subscribesAll
    ? ["All events"]
    : ep.events.map(k => labelForEventKey(k, catalog));

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">{ep.name}</span>
            {ep.last_status === "sent" && <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-label="Last delivery ok" />}
            {ep.last_status === "error" && <XCircle className="h-3.5 w-3.5 text-destructive" aria-label="Last delivery failed" />}
          </div>
          <code className="text-xs text-muted-foreground font-mono truncate block">{ep.url}</code>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {eventLabels.slice(0, 6).map((l, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] font-normal">{l}</Badge>
            ))}
            {eventLabels.length > 6 && (
              <Badge variant="outline" className="text-[10px] font-normal">+{eventLabels.length - 6} more</Badge>
            )}
          </div>
          {ep.last_fired_at && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Last fired {new Date(ep.last_fired_at).toLocaleString()}
              {ep.last_status === "error" && ep.last_error ? ` — ${ep.last_error}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Switch checked={ep.enabled} onCheckedChange={onToggle} aria-label="Enabled" />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onTest} disabled={testing} aria-label="Send test">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} aria-label="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={onDelete} aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function EndpointDialog({
  open, endpoint, catalog, saving, onClose, onSave,
}: {
  open: boolean;
  endpoint: WebhookEndpoint | null;
  catalog: ReturnType<typeof buildWebhookEventCatalog>;
  saving: boolean;
  onClose: () => void;
  onSave: (form: WebhookEndpointInput) => void;
}) {
  const [form, setForm] = useState<WebhookEndpointInput>(
    endpoint
      ? {
          name: endpoint.name,
          url: endpoint.url,
          description: endpoint.description ?? "",
          events: endpoint.events ?? [],
          secret: endpoint.secret ?? "",
          headers: endpoint.headers ?? {},
          enabled: endpoint.enabled,
        }
      : EMPTY_FORM,
  );

  const allSelected = form.events.includes(ALL_EVENTS_KEY);

  const toggleEvent = (key: string) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(key) ? f.events.filter(k => k !== key) : [...f.events, key],
    }));
  };

  const toggleAll = (checked: boolean) => {
    setForm(f => ({ ...f, events: checked ? [ALL_EVENTS_KEY] : [] }));
  };

  const headerRows = Object.entries(form.headers);
  const setHeader = (idx: number, k: string, v: string) => {
    const next = headerRows.map(([hk, hv], i) => (i === idx ? [k, v] : [hk, hv]));
    setForm(f => ({ ...f, headers: Object.fromEntries(next.filter(([hk]) => hk)) }));
  };
  const addHeader = () => setForm(f => ({ ...f, headers: { ...f.headers, "": "" } }));
  const removeHeader = (idx: number) =>
    setForm(f => ({ ...f, headers: Object.fromEntries(headerRows.filter((_, i) => i !== idx)) }));

  const submit = () => {
    if (!form.name.trim()) return toast.error("Name is required");
    try {
      new URL(form.url);
    } catch {
      return toast.error("Enter a valid URL (https://…)");
    }
    onSave({ ...form, name: form.name.trim(), url: form.url.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{endpoint ? "Edit webhook" : "Add webhook"}</DialogTitle>
          <DialogDescription>
            Configure where events are delivered and which events trigger a delivery.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Slack #alerts relay"
                className="mt-1"
              />
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} id="wh-enabled" />
              <label htmlFor="wh-enabled" className="text-sm text-foreground">Enabled</label>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Payload URL</label>
            <Input
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              placeholder="https://hooks.example.com/…"
              className="mt-1 font-mono text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
            <Input
              value={form.description ?? ""}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What this webhook is for"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Secret (optional)</label>
            <Input
              value={form.secret ?? ""}
              onChange={e => setForm(f => ({ ...f, secret: e.target.value }))}
              placeholder="Sent as the X-Webhook-Secret header"
              className="mt-1 font-mono text-xs"
            />
          </div>

          {/* Events */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Events</label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <Checkbox checked={allSelected} onCheckedChange={v => toggleAll(!!v)} />
                All events (including future ones)
              </label>
            </div>
            {!allSelected && (
              <div className="space-y-3 rounded-md border border-border p-3 max-h-64 overflow-y-auto">
                {catalog.map(group => (
                  <div key={group.group}>
                    <p className="text-xs font-semibold text-foreground">{group.group}</p>
                    <p className="text-[11px] text-muted-foreground mb-1.5">{group.hint}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {group.events.map(evt => (
                        <label key={evt.key} className="flex items-start gap-2 text-sm cursor-pointer py-0.5" title={evt.description}>
                          <Checkbox
                            className="mt-0.5"
                            checked={form.events.includes(evt.key)}
                            onCheckedChange={() => toggleEvent(evt.key)}
                          />
                          <span className="text-foreground leading-tight">{evt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              {allSelected
                ? "This endpoint receives every event in the workspace."
                : `${form.events.length} event${form.events.length === 1 ? "" : "s"} selected. Leave empty to receive all events.`}
            </p>
          </div>

          {/* Custom headers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Custom headers (optional)</label>
              <Button size="sm" variant="ghost" className="h-7" onClick={addHeader}>
                <Plus className="h-3 w-3 mr-1" />Add header
              </Button>
            </div>
            {headerRows.length > 0 && (
              <div className="space-y-1.5">
                {headerRows.map(([k, v], idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input value={k} onChange={e => setHeader(idx, e.target.value, v)} placeholder="Header" className="h-8 text-xs flex-1" />
                    <Input value={v} onChange={e => setHeader(idx, k, e.target.value)} placeholder="Value" className="h-8 text-xs flex-1" />
                    <button onClick={() => removeHeader(idx)} className="text-muted-foreground hover:text-destructive" aria-label="Remove header">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {endpoint ? "Save changes" : "Create webhook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
