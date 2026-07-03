import { useMemo, useState } from "react";
import { Plus, Loader2, Check, BadgeCheck, Ban } from "lucide-react";
import { toast } from "sonner";
import {
  useCommissions, usePartners, useReferrals, CommissionInput, CommissionStatus,
  commissionForPartner,
} from "@/hooks/useAffiliates";
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

const STATUSES: CommissionStatus[] = ["pending", "approved", "paid", "void"];

export function CommissionsTab() {
  const { commissions, isLoading, save, setStatus } = useCommissions();
  const { partners } = usePartners();
  const { referrals } = useReferrals();

  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CommissionInput>({
    partner_id: "",
    description: null,
    basis_amount: null,
    amount: 0,
    currency: "USD",
    occurred_on: new Date().toISOString().slice(0, 10),
    status: "pending",
    referral_id: null,
  });
  const [amountTouched, setAmountTouched] = useState(false);

  const visible = filter === "all" ? commissions : commissions.filter((c) => c.status === filter);

  // Recompute the commission from the partner's terms while the user hasn't
  // typed an explicit amount.
  const applyBasis = (basisRaw: string) => {
    const basis = basisRaw === "" ? null : parseFloat(basisRaw);
    const partner = partnerById.get(form.partner_id);
    const next = { ...form, basis_amount: basis };
    if (!amountTouched && partner && basis != null && !Number.isNaN(basis)) {
      next.amount = commissionForPartner(partner, basis);
    }
    setForm(next);
  };

  const applyPartner = (partnerId: string) => {
    const partner = partnerById.get(partnerId);
    const next = { ...form, partner_id: partnerId };
    if (!amountTouched && partner && form.basis_amount != null) {
      next.amount = commissionForPartner(partner, Number(form.basis_amount));
    }
    setForm(next);
  };

  const submit = async () => {
    if (!form.partner_id) return toast.error("Pick a partner");
    if (!form.amount || form.amount <= 0) return toast.error("Commission amount must be positive");
    try {
      await save.mutateAsync(form);
      toast.success("Commission logged");
      setOpen(false);
      setAmountTouched(false);
      setForm({
        partner_id: "", description: null, basis_amount: null, amount: 0, currency: "USD",
        occurred_on: new Date().toISOString().slice(0, 10), status: "pending", referral_id: null,
      });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const advance = async (id: string, status: CommissionStatus) => {
    try {
      await setStatus.mutateAsync({ id, status });
      toast.success(`Commission ${status === "void" ? "voided" : `marked ${status}`}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const partnerReferrals = referrals.filter((r) => r.partner_id === form.partner_id);

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
          <Plus className="w-4 h-4 mr-1" /> Log commission
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={commissions.length === 0 ? "No commissions yet" : "No commissions match this filter"}
          hint={
            commissions.length === 0
              ? "Log commissions manually, or let them flow in from the partner API, provider webhooks, or a Partnero sync."
              : undefined
          }
        />
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Basis</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{partnerById.get(c.partner_id)?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-56 truncate">{c.description ?? "—"}</TableCell>
                  <TableCell className="text-sm">{fmtMoney(c.basis_amount, c.currency)}</TableCell>
                  <TableCell className="font-semibold">{fmtMoney(c.amount, c.currency)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(c.occurred_on)}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      {c.status === "pending" && (
                        <>
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => advance(c.id, "approved")}>
                            <Check className="w-3 h-3 mr-1" /> Approve
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => advance(c.id, "void")}>
                            <Ban className="w-3 h-3 mr-1" /> Void
                          </Button>
                        </>
                      )}
                      {c.status === "approved" && !c.payout_id && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => advance(c.id, "paid")}>
                          <BadgeCheck className="w-3 h-3 mr-1" /> Mark paid
                        </Button>
                      )}
                      {c.status === "approved" && c.payout_id && (
                        <span className="text-xs text-muted-foreground self-center">In payout</span>
                      )}
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
            <DialogTitle>Log commission</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Partner *</Label>
              <Select value={form.partner_id} onValueChange={applyPartner}>
                <SelectTrigger><SelectValue placeholder="Pick a partner" /></SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.commission_type === "percent" ? `${Number(p.commission_rate)}%` : `$${Number(p.flat_amount)} flat`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Deal / basis amount</Label>
              <Input
                type="number"
                value={form.basis_amount ?? ""}
                onChange={(e) => applyBasis(e.target.value)}
                placeholder="e.g. 1500"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Commission amount *</Label>
              <Input
                type="number"
                value={form.amount || ""}
                onChange={(e) => {
                  setAmountTouched(true);
                  setForm({ ...form, amount: parseFloat(e.target.value) || 0 });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.occurred_on}
                onChange={(e) => setForm({ ...form, occurred_on: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase().slice(0, 3) })}
              />
            </div>
            {partnerReferrals.length > 0 && (
              <div className="col-span-2 space-y-1.5">
                <Label>Linked referral (optional)</Label>
                <Select
                  value={form.referral_id ?? "none"}
                  onValueChange={(v) => setForm({ ...form, referral_id: v === "none" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked</SelectItem>
                    {partnerReferrals.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.contact_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Input
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                placeholder="e.g. May renewal — Acme Co"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Log commission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
