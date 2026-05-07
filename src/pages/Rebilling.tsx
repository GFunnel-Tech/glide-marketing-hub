import { useState } from "react";
import { Settings, Loader2, Receipt, Wallet as WalletIcon } from "lucide-react";
import { useClients } from "@/hooks/useDatabase";
import {
  useRebillConfigs, useRebillInvoices, useGenerateInvoice, useUpdateInvoiceStatus,
} from "@/hooks/useRebilling";
import { useWallets } from "@/hooks/useWallets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RebillConfigDialog } from "@/components/rebilling/RebillConfigDialog";
import { AssignmentManager } from "@/components/rebilling/AssignmentManager";
import { WalletPanel } from "@/components/rebilling/WalletPanel";
import { cn } from "@/lib/utils";

function firstOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function lastOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

export default function Rebilling() {
  const { data: clients = [] } = useClients();
  const { data: configs = [] } = useRebillConfigs();
  const { data: invoices = [] } = useRebillInvoices();
  const generate = useGenerateInvoice();
  const updateStatus = useUpdateInvoiceStatus();

  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [genFor, setGenFor] = useState<{ id: number; name: string } | null>(null);
  const [periodStart, setPeriodStart] = useState(firstOfMonth());
  const [periodEnd, setPeriodEnd] = useState(lastOfMonth());

  const configByClient = new Map(configs.map((c) => [c.client_id, c]));

  const enabledClients = clients.filter((c) => configByClient.get(c.id)?.enabled);

  const startGenerate = async () => {
    if (!genFor) return;
    await generate.mutateAsync({ clientId: genFor.id, periodStart, periodEnd });
    setGenFor(null);
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Rebilling</h1>
        <p className="text-sm text-muted-foreground">
          Configure markup, assign ad objects, and generate invoices for clients on agency billing.
        </p>
      </div>

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">Clients ({enabledClients.length} enabled)</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="space-y-3 mt-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Client</th>
                  <th className="text-left px-4 py-2">Brand</th>
                  <th className="text-right px-4 py-2">Markup</th>
                  <th className="text-right px-4 py-2">Fixed fee</th>
                  <th className="text-right px-4 py-2">Min</th>
                  <th className="text-left px-4 py-2">Cadence</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const cfg = configByClient.get(c.id);
                  return (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-4 py-2 font-medium">{c.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{c.brand}</td>
                      <td className="px-4 py-2 text-right">{cfg ? `${cfg.markup_pct}%` : "—"}</td>
                      <td className="px-4 py-2 text-right">{cfg ? `$${Number(cfg.fixed_fee).toFixed(2)}` : "—"}</td>
                      <td className="px-4 py-2 text-right">{cfg ? `$${Number(cfg.monthly_minimum).toFixed(2)}` : "—"}</td>
                      <td className="px-4 py-2">{cfg?.cadence ?? "—"}</td>
                      <td className="px-4 py-2">
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          cfg?.enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                        )}>
                          {cfg?.enabled ? "Enabled" : "Off"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ id: c.id, name: c.name })}>
                          <Settings className="h-3.5 w-3.5 mr-1" /> Config
                        </Button>
                        {cfg?.enabled && (
                          <Button size="sm" variant="ghost" onClick={() => setGenFor({ id: c.id, name: c.name })}>
                            <Receipt className="h-3.5 w-3.5 mr-1" /> Generate
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {clients.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No clients yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {editing && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Ad object assignments — {editing.name}</h3>
                <button onClick={() => setEditing(null)} className="text-xs text-muted-foreground hover:underline">Close</button>
              </div>
              <AssignmentManager clientId={editing.id} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Invoice #</th>
                  <th className="text-left px-4 py-2">Client</th>
                  <th className="text-left px-4 py-2">Period</th>
                  <th className="text-right px-4 py-2">Spend</th>
                  <th className="text-right px-4 py-2">Markup</th>
                  <th className="text-right px-4 py-2">Total</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const client = clients.find((c) => c.id === inv.client_id);
                  return (
                    <tr key={inv.id} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs">{inv.invoice_number}</td>
                      <td className="px-4 py-2">{client?.name ?? `#${inv.client_id}`}</td>
                      <td className="px-4 py-2 text-xs">{inv.period_start} → {inv.period_end}</td>
                      <td className="px-4 py-2 text-right">${Number(inv.raw_spend).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{inv.markup_pct}%</td>
                      <td className="px-4 py-2 text-right font-semibold">${Number(inv.total_due).toFixed(2)} {inv.currency}</td>
                      <td className="px-4 py-2">
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                          inv.status === "paid" && "bg-success/15 text-success",
                          inv.status === "sent" && "bg-warning/15 text-warning",
                          inv.status === "draft" && "bg-muted text-muted-foreground",
                          inv.status === "void" && "bg-destructive/15 text-destructive",
                        )}>{inv.status}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Select
                          value={inv.status}
                          onValueChange={(v) => updateStatus.mutate({ id: inv.id, status: v as any })}
                        >
                          <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="sent">Sent</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="void">Void</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
                {invoices.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No invoices yet. Generate one from the Clients tab.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {editing && (
        <RebillConfigDialog
          clientId={editing.id}
          clientName={editing.name}
          existing={configByClient.get(editing.id)}
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}

      <Dialog open={!!genFor} onOpenChange={(v) => !v && setGenFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate invoice — {genFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Period start</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <Label>Period end</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenFor(null)}>Cancel</Button>
            <Button onClick={startGenerate} disabled={generate.isPending}>
              {generate.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
