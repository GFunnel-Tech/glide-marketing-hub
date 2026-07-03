import { useMemo, useState } from "react";
import {
  Plus, Loader2, Copy, KeyRound, Trash2, PlugZap, RefreshCw, CheckCircle2, XCircle, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAffiliateApiKeys, useAffiliateIntegrations, useAffiliateEvents,
  AffiliateIntegration, IntegrationProvider,
} from "@/hooks/useAffiliates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState, fmtDate } from "./shared";

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/affiliate-api/v1`;

const PROVIDERS: { key: IntegrationProvider; label: string; hint: string }[] = [
  { key: "partnero", label: "Partnero", hint: "Syncs partners & transactions via the Partnero API; receives webhooks." },
  { key: "rewardful", label: "Rewardful", hint: "Syncs affiliates via the Rewardful API; receives webhooks." },
  { key: "firstpromoter", label: "FirstPromoter", hint: "Syncs promoters via the FirstPromoter API; receives webhooks." },
  { key: "custom", label: "Custom / other", hint: "Any other system — point its webhooks here and/or use the partner API with an API key." },
];

function copy(text: string, message: string) {
  navigator.clipboard.writeText(text);
  toast.success(message);
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------
function ApiKeysSection() {
  const { apiKeys, isLoading, create, revoke, remove } = useAffiliateApiKeys();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return toast.error("Give the key a name");
    try {
      const created = await create.mutateAsync({ name: name.trim(), scopes: readOnly ? ["read"] : ["read", "write"] });
      setNewKey(created.key);
      setName("");
      setReadOnly(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> API keys
            </CardTitle>
            <CardDescription>
              Authenticate third parties against the partner API. Keys are shown once and stored hashed.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => { setNewKey(null); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> New key
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : apiKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet. Create one to let external tools call the partner API.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="font-mono text-xs">{k.key_prefix}…</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{k.scopes.join(", ")}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{k.last_used_at ? fmtDate(k.last_used_at) : "Never"}</TableCell>
                  <TableCell>
                    {k.enabled && !k.revoked_at ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="w-3 h-3" /> Active</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="w-3 h-3" /> Revoked</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      {k.enabled && !k.revoked_at && (
                        <Button
                          variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={async () => {
                            try { await revoke.mutateAsync(k.id); toast.success("Key revoked"); }
                            catch (err) { toast.error((err as Error).message); }
                          }}
                        >
                          Revoke
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={async () => {
                          if (!window.confirm(`Delete key "${k.name}"? Integrations using it will stop working.`)) return;
                          try { await remove.mutateAsync(k.id); toast.success("Key deleted"); }
                          catch (err) { toast.error((err as Error).message); }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{newKey ? "API key created" : "New API key"}</DialogTitle>
            {newKey && (
              <DialogDescription>
                Copy this key now — it won't be shown again.
              </DialogDescription>
            )}
          </DialogHeader>
          {newKey ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                <code className="flex-1 text-xs break-all">{newKey}</code>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copy(newKey, "API key copied")}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Partnero, Zapier, internal script" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Read-only</Label>
                  <p className="text-xs text-muted-foreground">Key can list data but not create or modify it.</p>
                </div>
                <Switch checked={readOnly} onCheckedChange={setReadOnly} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit} disabled={create.isPending}>
                  {create.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Create key
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// API reference
// ---------------------------------------------------------------------------
function ApiReferenceSection() {
  const example = `curl -X POST "${API_BASE}/referrals" \\
  -H "Authorization: Bearer gfa_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"referral_code":"PARTNER_CODE","contact_name":"Jane Doe","contact_email":"jane@acme.com","deal_value":1500,"external_id":"crm-42"}'`;

  const endpoints: [string, string][] = [
    ["GET/POST /partners · GET/PATCH /partners/:id", "Manage partners"],
    ["GET/POST /referrals · PATCH /referrals/:id", "Push leads/deals (idempotent on external_id)"],
    ["GET/POST /commissions · PATCH /commissions/:id", "Push commissions; amount auto-computed from partner terms when omitted"],
    ["GET /payouts", "Read payout batches"],
    ["POST /webhooks/:provider?token=…", "Inbound provider webhooks (Partnero & co)"],
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Partner API reference</CardTitle>
        <CardDescription>
          REST API for connecting Partnero, Zapier, CRMs, or custom systems. Authenticate with{" "}
          <code className="text-xs">Authorization: Bearer &lt;key&gt;</code> or <code className="text-xs">x-api-key</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <span className="text-xs text-muted-foreground shrink-0">Base URL</span>
          <code className="flex-1 text-xs break-all">{API_BASE}</code>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copy(API_BASE, "Base URL copied")}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="border rounded-lg divide-y">
          {endpoints.map(([ep, desc]) => (
            <div key={ep} className="px-3 py-2 flex items-center justify-between gap-4">
              <code className="text-xs">{ep}</code>
              <span className="text-xs text-muted-foreground text-right">{desc}</span>
            </div>
          ))}
        </div>
        <div className="relative">
          <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto">{example}</pre>
          <Button
            variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7"
            onClick={() => copy(example, "Example copied")}
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Provider integrations
// ---------------------------------------------------------------------------
function IntegrationCard({
  provider, label, hint, integration,
}: {
  provider: IntegrationProvider;
  label: string;
  hint: string;
  integration: AffiliateIntegration | undefined;
}) {
  const { save, remove, test, sync } = useAffiliateIntegrations();
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState(integration?.api_base ?? "");
  const [programId, setProgramId] = useState(integration?.program_id ?? "");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [showKey, setShowKey] = useState(false);

  const webhookUrl = integration
    ? `${API_BASE}/webhooks/${provider}?token=${integration.webhook_token}`
    : null;

  const startEdit = () => {
    setApiKey(integration?.api_key ?? "");
    setApiBase(integration?.api_base ?? "");
    setProgramId(integration?.program_id ?? "");
    setWebhookSecret(integration?.webhook_secret ?? "");
    setEditing(true);
  };

  const submit = async () => {
    try {
      await save.mutateAsync({
        ...(integration ? { id: integration.id } : {}),
        provider,
        api_key: apiKey || null,
        api_base: apiBase || null,
        program_id: programId || null,
        webhook_secret: webhookSecret || null,
        enabled: true,
      });
      toast.success(`${label} ${integration ? "updated" : "connected"}`);
      setEditing(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const runTest = async () => {
    try {
      const res = await test.mutateAsync(provider);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const runSync = async () => {
    try {
      const res = await sync.mutateAsync(provider);
      if (res.ok) toast.success(`Synced ${res.partners ?? 0} partners, ${res.commissions ?? 0} commissions`);
      else toast.error(res.message ?? "Sync failed");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <PlugZap className="w-4 h-4" /> {label}
              {integration && (
                integration.last_sync_status === "error" ? (
                  <span className="inline-flex items-center gap-1 text-xs text-red-600 font-normal"><XCircle className="w-3 h-3" /> Error</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-normal"><CheckCircle2 className="w-3 h-3" /> Connected</span>
                )
              )}
            </CardTitle>
            <CardDescription>{hint}</CardDescription>
          </div>
          <div className="flex gap-2">
            {integration && provider !== "custom" && (
              <>
                <Button variant="outline" size="sm" onClick={runTest} disabled={test.isPending}>
                  {test.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null} Test
                </Button>
                <Button variant="outline" size="sm" onClick={runSync} disabled={sync.isPending}>
                  {sync.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                  Sync now
                </Button>
              </>
            )}
            <Button variant={integration ? "ghost" : "default"} size="sm" onClick={startEdit}>
              {integration ? "Configure" : "Connect"}
            </Button>
          </div>
        </div>
      </CardHeader>
      {(integration || editing) && (
        <CardContent className="space-y-3">
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              {provider !== "custom" ? (
                <div className="col-span-2 space-y-1.5">
                  <Label>{label} API key</Label>
                  <div className="flex gap-2">
                    <Input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={`Paste your ${label} API key`}
                    />
                    <Button variant="outline" size="icon" onClick={() => setShowKey(!showKey)}>
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="col-span-2 space-y-1.5">
                  <Label>Endpoint base URL (optional)</Label>
                  <Input value={apiBase} onChange={(e) => setApiBase(e.target.value)} placeholder="https://api.example.com" />
                </div>
              )}
              {provider === "partnero" && (
                <div className="space-y-1.5">
                  <Label>Program ID (optional)</Label>
                  <Input value={programId} onChange={(e) => setProgramId(e.target.value)} />
                </div>
              )}
              <div className={provider === "partnero" ? "space-y-1.5" : "col-span-2 space-y-1.5"}>
                <Label>Webhook signing secret (optional)</Label>
                <Input
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder="Verifies inbound webhook signatures"
                />
              </div>
              <div className="col-span-2 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                {integration && (
                  <Button
                    variant="outline" size="sm" className="text-destructive"
                    onClick={async () => {
                      if (!window.confirm(`Disconnect ${label}? The webhook URL stops accepting events.`)) return;
                      try { await remove.mutateAsync(integration.id); toast.success(`${label} disconnected`); setEditing(false); }
                      catch (err) { toast.error((err as Error).message); }
                    }}
                  >
                    Disconnect
                  </Button>
                )}
                <Button size="sm" onClick={submit} disabled={save.isPending}>
                  {save.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Save
                </Button>
              </div>
            </div>
          )}

          {integration && webhookUrl && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Webhook URL — paste into {label === "Custom / other" ? "the external system" : `${label}'s webhook settings`}
              </Label>
              <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                <code className="flex-1 text-xs break-all">{webhookUrl}</code>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copy(webhookUrl, "Webhook URL copied")}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {integration?.last_synced_at && (
            <p className="text-xs text-muted-foreground">Last synced {fmtDate(integration.last_synced_at)}</p>
          )}
          {integration?.last_error && (
            <p className="text-xs text-red-600">Last error: {integration.last_error}</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------
function EventLogSection() {
  const { data: events = [], isLoading } = useAffiliateEvents(50);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Activity log</CardTitle>
        <CardDescription>Inbound webhooks, API writes, and sync runs.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet — events appear here as third parties call the API.</p>
        ) : (
          <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
            {events.map((e) => (
              <div key={e.id} className="px-3 py-2 flex items-center gap-3">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.status === "error" ? "bg-red-500" : "bg-emerald-500"}`} />
                <code className="text-xs shrink-0">{e.event_type}</code>
                <span className="text-xs text-muted-foreground capitalize shrink-0">{e.provider ?? e.source}</span>
                {e.error && <span className="text-xs text-red-600 truncate">{e.error}</span>}
                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                  {new Date(e.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
export function ApiIntegrationsTab() {
  const { integrations, isLoading, error } = useAffiliateIntegrations();
  const byProvider = useMemo(
    () => new Map(integrations.map((i) => [i.provider, i])),
    [integrations],
  );

  // affiliate_integrations / affiliate_api_keys are owner/admin-only via RLS —
  // members see an access note instead of broken cards.
  if (!isLoading && error) {
    return (
      <EmptyState
        title="Restricted"
        hint="API keys and integrations are managed by workspace owners and admins."
      />
    );
  }

  return (
    <div className="space-y-4">
      <ApiKeysSection />
      <ApiReferenceSection />
      {PROVIDERS.map((p) => (
        <IntegrationCard
          key={p.key}
          provider={p.key}
          label={p.label}
          hint={p.hint}
          integration={byProvider.get(p.key)}
        />
      ))}
      <EventLogSection />
    </div>
  );
}
