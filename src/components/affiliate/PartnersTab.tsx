import { useState } from "react";
import { Plus, Pencil, Trash2, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  usePartners, AffiliatePartner, PartnerInput, PartnerStatus, CommissionType,
} from "@/hooks/useAffiliates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge, EmptyState } from "./shared";

const EMPTY: PartnerInput = {
  name: "",
  email: null,
  company: null,
  status: "active",
  commission_type: "percent",
  commission_rate: 10,
  flat_amount: 0,
  payout_method: null,
  payout_details: null,
  notes: null,
};

export function PartnersTab() {
  const { partners, isLoading, save, remove } = usePartners();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PartnerInput>(EMPTY);

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const startEdit = (p: AffiliatePartner) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      email: p.email,
      company: p.company,
      status: p.status,
      commission_type: p.commission_type,
      commission_rate: Number(p.commission_rate),
      flat_amount: Number(p.flat_amount),
      payout_method: p.payout_method,
      payout_details: p.payout_details,
      notes: p.notes,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Partner name is required");
      return;
    }
    try {
      await save.mutateAsync({ ...(editingId ? { id: editingId } : {}), ...form, name: form.name.trim() });
      toast.success(editingId ? "Partner updated" : "Partner added");
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Referral code copied");
  };

  const terms = (p: AffiliatePartner) =>
    p.commission_type === "percent"
      ? `${Number(p.commission_rate)}% of deal`
      : `$${Number(p.flat_amount).toLocaleString()} flat`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {partners.length} partner{partners.length === 1 ? "" : "s"}
        </p>
        <Button size="sm" onClick={startCreate}>
          <Plus className="w-4 h-4 mr-1" /> Add partner
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : partners.length === 0 ? (
        <EmptyState
          title="No partners yet"
          hint="Add your first affiliate partner, or connect Partnero / another network under API & Integrations to sync them in."
        />
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Terms</TableHead>
                <TableHead>Referral code</TableHead>
                <TableHead>Payout</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.email ?? p.company ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-sm">{terms(p)}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => copyCode(p.referral_code)}
                      className="inline-flex items-center gap-1 text-xs font-mono bg-muted px-2 py-1 rounded hover:bg-muted/70"
                      title="Copy referral code"
                    >
                      {p.referral_code} <Copy className="w-3 h-3" />
                    </button>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.payout_method ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground capitalize">
                    {p.external_provider ?? "manual"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(p)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={async () => {
                          if (!window.confirm(`Delete ${p.name}? Their referrals and commissions will be removed too.`)) return;
                          try {
                            await remove.mutateAsync(p.id);
                            toast.success("Partner deleted");
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
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
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit partner" : "Add partner"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Partner name" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value || null })} placeholder="partner@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Input value={form.company ?? ""} onChange={(e) => setForm({ ...form, company: e.target.value || null })} />
            </div>
            <div className="space-y-1.5">
              <Label>Commission type</Label>
              <Select
                value={form.commission_type}
                onValueChange={(v) => setForm({ ...form, commission_type: v as CommissionType })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percent of deal</SelectItem>
                  <SelectItem value="flat">Flat per conversion</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.commission_type === "percent" ? (
              <div className="space-y-1.5">
                <Label>Rate (%)</Label>
                <Input
                  type="number"
                  value={form.commission_rate}
                  onChange={(e) => setForm({ ...form, commission_rate: parseFloat(e.target.value) || 0 })}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Flat amount</Label>
                <Input
                  type="number"
                  value={form.flat_amount}
                  onChange={(e) => setForm({ ...form, flat_amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Payout method</Label>
              <Input value={form.payout_method ?? ""} onChange={(e) => setForm({ ...form, payout_method: e.target.value || null })} placeholder="Stripe / PayPal / wire" />
            </div>
            <div className="space-y-1.5">
              <Label>Payout details</Label>
              <Input value={form.payout_details ?? ""} onChange={(e) => setForm({ ...form, payout_details: e.target.value || null })} placeholder="Account / handle" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as PartnerStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editingId ? "Save changes" : "Add partner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
