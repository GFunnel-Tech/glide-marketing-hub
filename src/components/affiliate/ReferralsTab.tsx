import { useMemo, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useReferrals, usePartners, ReferralInput, ReferralStatus,
} from "@/hooks/useAffiliates";
import { useClients } from "@/hooks/useDatabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge, EmptyState, fmtMoney, fmtDate } from "./shared";

const STATUSES: ReferralStatus[] = ["lead", "trial", "converted", "lost"];

export function ReferralsTab() {
  const { referrals, isLoading, save, remove } = useReferrals();
  const { partners } = usePartners();
  const { data: clients = [] } = useClients();

  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [form, setForm] = useState<ReferralInput>({
    partner_id: "",
    contact_name: "",
    contact_email: null,
    source: null,
    status: "lead",
    deal_value: null,
    currency: "USD",
    client_id: null,
  });

  const visible = filter === "all" ? referrals : referrals.filter((r) => r.status === filter);

  const submit = async () => {
    if (!form.partner_id) return toast.error("Pick the referring partner");
    if (!form.contact_name.trim()) return toast.error("Contact name is required");
    try {
      await save.mutateAsync({ ...form, contact_name: form.contact_name.trim() });
      toast.success("Referral added");
      setOpen(false);
      setForm({ partner_id: "", contact_name: "", contact_email: null, source: null, status: "lead", deal_value: null, currency: "USD", client_id: null });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const changeStatus = async (id: string, status: ReferralStatus) => {
    const r = referrals.find((x) => x.id === id);
    if (!r) return;
    try {
      await save.mutateAsync({
        id,
        partner_id: r.partner_id,
        contact_name: r.contact_name,
        contact_email: r.contact_email,
        source: r.source,
        status,
        deal_value: r.deal_value,
        currency: r.currency,
        client_id: r.client_id,
      });
      toast.success(`Referral marked ${status}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setOpen(true)} disabled={partners.length === 0}>
          <Plus className="w-4 h-4 mr-1" /> Log referral
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={referrals.length === 0 ? "No referrals yet" : "No referrals match this filter"}
          hint={
            referrals.length === 0
              ? partners.length === 0
                ? "Add a partner first, then log the leads and deals they send you. Referrals also arrive automatically via the partner API and provider webhooks."
                : "Log the leads and deals your partners send you. Referrals also arrive automatically via the partner API and provider webhooks."
              : undefined
          }
        />
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Deal value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.contact_name}</div>
                    <div className="text-xs text-muted-foreground">{r.contact_email ?? r.source ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-sm">{partnerById.get(r.partner_id)?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.client_id != null ? clientById.get(r.client_id)?.name ?? `#${r.client_id}` : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{fmtMoney(r.deal_value, r.currency)}</TableCell>
                  <TableCell>
                    <Select value={r.status} onValueChange={(v) => changeStatus(r.id, v as ReferralStatus)}>
                      <SelectTrigger className="w-32 h-8 border-none shadow-none p-0 [&>svg]:hidden justify-start">
                        <StatusBadge status={r.status} />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(r.created_at)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={async () => {
                        if (!window.confirm(`Delete referral for ${r.contact_name}?`)) return;
                        try {
                          await remove.mutateAsync(r.id);
                          toast.success("Referral deleted");
                        } catch (err) {
                          toast.error((err as Error).message);
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log referral</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Partner *</Label>
              <Select value={form.partner_id} onValueChange={(v) => setForm({ ...form, partner_id: v })}>
                <SelectTrigger><SelectValue placeholder="Who sent this referral?" /></SelectTrigger>
                <SelectContent>
                  {partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Contact name *</Label>
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Contact email</Label>
              <Input value={form.contact_email ?? ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value || null })} />
            </div>
            <div className="space-y-1.5">
              <Label>Deal value</Label>
              <Input
                type="number"
                value={form.deal_value ?? ""}
                onChange={(e) => setForm({ ...form, deal_value: e.target.value === "" ? null : parseFloat(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ReferralStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Link to client (optional)</Label>
              <Select
                value={form.client_id != null ? String(form.client_id) : "none"}
                onValueChange={(v) => setForm({ ...form, client_id: v === "none" ? null : parseInt(v, 10) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Source</Label>
              <Input value={form.source ?? ""} onChange={(e) => setForm({ ...form, source: e.target.value || null })} placeholder="e.g. intro call, landing page" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Log referral
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
