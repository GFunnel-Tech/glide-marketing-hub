import { useMemo, useState } from "react";
import { Plus, Loader2, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { usePayouts, usePartners, useCommissions, PayoutStatus } from "@/hooks/useAffiliates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

export function PayoutsTab() {
  const { payouts, isLoading, create, setStatus } = usePayouts();
  const { partners } = usePartners();
  const { commissions } = useCommissions();

  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);

  const [open, setOpen] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState("");

  // Approved, not-yet-swept commissions for the chosen partner.
  const eligible = useMemo(
    () => commissions.filter((c) => c.partner_id === partnerId && c.status === "approved" && !c.payout_id),
    [commissions, partnerId],
  );
  const selectedRows = eligible.filter((c) => selected.has(c.id));
  const total = selectedRows.reduce((s, c) => s + Number(c.amount), 0);
  const currency = selectedRows[0]?.currency ?? eligible[0]?.currency ?? "USD";

  const openDialog = () => {
    setPartnerId("");
    setSelected(new Set());
    setMethod("");
    setOpen(true);
  };

  const pickPartner = (id: string) => {
    setPartnerId(id);
    // Preselect everything eligible — the common case is "pay it all out".
    setSelected(new Set(commissions.filter((c) => c.partner_id === id && c.status === "approved" && !c.payout_id).map((c) => c.id)));
    setMethod(partnerById.get(id)?.payout_method ?? "");
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const submit = async () => {
    if (!partnerId) return toast.error("Pick a partner");
    if (selectedRows.length === 0) return toast.error("Select at least one commission");
    const mixed = selectedRows.some((c) => c.currency !== currency);
    if (mixed) return toast.error("Selected commissions use different currencies — create separate payouts");
    try {
      await create.mutateAsync({
        partner_id: partnerId,
        commission_ids: selectedRows.map((c) => c.id),
        amount: Math.round(total * 100) / 100,
        currency,
        method: method || null,
      });
      toast.success("Payout created");
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const advance = async (id: string, status: PayoutStatus) => {
    try {
      await setStatus.mutateAsync({ id, status });
      toast.success(status === "paid" ? "Payout marked paid — commissions settled" : `Payout ${status}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const anyApproved = commissions.some((c) => c.status === "approved" && !c.payout_id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Sweep approved commissions into payout batches. Marking a payout paid settles its commissions.
        </p>
        <Button size="sm" onClick={openDialog} disabled={!anyApproved}>
          <Plus className="w-4 h-4 mr-1" /> New payout
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : payouts.length === 0 ? (
        <EmptyState
          title="No payouts yet"
          hint="Approve commissions on the Commissions tab, then batch them into a payout here."
        />
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{partnerById.get(p.partner_id)?.name ?? "—"}</TableCell>
                  <TableCell className="font-semibold">{fmtMoney(p.amount, p.currency)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.method ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(p.requested_at)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(p.paid_at)}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      {p.status === "requested" && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => advance(p.id, "processing")}>
                          Start processing
                        </Button>
                      )}
                      {(p.status === "requested" || p.status === "processing") && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => advance(p.id, "paid")}>
                          <BadgeCheck className="w-3 h-3 mr-1" /> Mark paid
                        </Button>
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
            <DialogTitle>New payout</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Partner *</Label>
              <Select value={partnerId} onValueChange={pickPartner}>
                <SelectTrigger><SelectValue placeholder="Pick a partner" /></SelectTrigger>
                <SelectContent>
                  {partners
                    .filter((p) => commissions.some((c) => c.partner_id === p.id && c.status === "approved" && !c.payout_id))
                    .map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {partnerId && (
              <>
                <div className="space-y-1.5">
                  <Label>Approved commissions</Label>
                  <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
                    {eligible.map((c) => (
                      <label key={c.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
                        <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                        <span className="flex-1 text-sm truncate">{c.description ?? fmtDate(c.occurred_on)}</span>
                        <span className="text-sm font-medium">{fmtMoney(c.amount, c.currency)}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Payout method</Label>
                  <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Stripe / PayPal / wire" />
                </div>
                <div className="flex items-center justify-between bg-muted rounded-lg px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    {selectedRows.length} commission{selectedRows.length === 1 ? "" : "s"} selected
                  </span>
                  <span className="text-lg font-semibold">{fmtMoney(total, currency)}</span>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending || selectedRows.length === 0}>
              {create.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Create payout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
