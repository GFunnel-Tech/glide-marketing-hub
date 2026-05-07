import { useState } from "react";
import { Wallet, Plus, Minus, Loader2, Settings2 } from "lucide-react";
import {
  useWallet, useWalletTransactions, useUpsertWallet, useAddWalletTransaction,
  type WalletTxnType,
} from "@/hooks/useWallets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const txnLabels: Record<WalletTxnType, string> = {
  topup: "Top-up",
  invoice_charge: "Invoice charge",
  manual_credit: "Manual credit",
  manual_debit: "Manual debit",
  refund: "Refund",
  adjustment: "Adjustment",
};

export function WalletPanel({ clientId, clientName }: { clientId: number; clientName: string }) {
  const { data: wallet, isLoading } = useWallet(clientId);
  const { data: txns = [] } = useWalletTransactions(wallet?.id);
  const upsert = useUpsertWallet();
  const addTxn = useAddWalletTransaction();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState<"credit" | "debit" | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const [autoTopup, setAutoTopup] = useState(false);
  const [threshold, setThreshold] = useState("100");
  const [topupAmt, setTopupAmt] = useState("500");

  const openSettings = () => {
    setAutoTopup(wallet?.auto_topup_enabled ?? false);
    setThreshold(String(wallet?.low_balance_threshold ?? 100));
    setTopupAmt(String(wallet?.topup_amount ?? 500));
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    await upsert.mutateAsync({
      client_id: clientId,
      auto_topup_enabled: autoTopup,
      low_balance_threshold: Number(threshold) || 0,
      topup_amount: Number(topupAmt) || 0,
    });
    setSettingsOpen(false);
  };

  const submitAdjust = async () => {
    if (!wallet) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    await addTxn.mutateAsync({
      wallet_id: wallet.id,
      client_id: clientId,
      type: adjustOpen === "credit" ? "manual_credit" : "manual_debit",
      amount: amt,
      description: description || undefined,
    });
    setAmount(""); setDescription(""); setAdjustOpen(null);
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading wallet…</div>;
  }

  if (!wallet) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-3">
        <Wallet className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No wallet for {clientName} yet.</p>
        <Button
          size="sm"
          onClick={() => upsert.mutate({ client_id: clientId, balance: 0 })}
          disabled={upsert.isPending}
        >
          {upsert.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Create wallet
        </Button>
      </div>
    );
  }

  const isLow = wallet.balance < wallet.low_balance_threshold;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center",
            wallet.balance < 0 ? "bg-destructive/15 text-destructive"
              : isLow ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
          )}>
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground tracking-wide">Wallet balance</div>
            <div className="text-2xl font-semibold">
              ${Number(wallet.balance).toFixed(2)} <span className="text-sm text-muted-foreground">USD</span>
            </div>
            {isLow && (
              <div className="text-xs text-warning mt-0.5">
                Below threshold of ${Number(wallet.low_balance_threshold).toFixed(2)}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAdjustOpen("credit")}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Credit
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAdjustOpen("debit")}>
            <Minus className="h-3.5 w-3.5 mr-1" /> Debit
          </Button>
          <Button size="sm" variant="ghost" onClick={openSettings}>
            <Settings2 className="h-3.5 w-3.5 mr-1" /> Settings
          </Button>
        </div>
      </div>

      <div className="p-4">
        <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">
          Recent activity
        </div>
        {txns.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No transactions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left py-1.5">Date</th>
                <th className="text-left py-1.5">Type</th>
                <th className="text-left py-1.5">Description</th>
                <th className="text-right py-1.5">Amount</th>
                <th className="text-right py-1.5">Balance</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="py-1.5 text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-1.5">{txnLabels[t.type]}</td>
                  <td className="py-1.5 text-muted-foreground text-xs">{t.description ?? "—"}</td>
                  <td className={cn(
                    "py-1.5 text-right font-mono",
                    t.amount >= 0 ? "text-success" : "text-destructive",
                  )}>
                    {t.amount >= 0 ? "+" : ""}${Math.abs(t.amount).toFixed(2)}
                  </td>
                  <td className="py-1.5 text-right font-mono text-xs text-muted-foreground">
                    ${Number(t.balance_after).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wallet settings — {clientName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto top-up via Stripe</Label>
                <p className="text-xs text-muted-foreground">
                  Charge saved card when balance drops below threshold.
                </p>
              </div>
              <Switch checked={autoTopup} onCheckedChange={setAutoTopup} />
            </div>
            <div>
              <Label>Low balance threshold (USD)</Label>
              <Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </div>
            <div>
              <Label>Top-up amount (USD)</Label>
              <Input type="number" value={topupAmt} onChange={(e) => setTopupAmt(e.target.value)} />
            </div>
            {autoTopup && !wallet.stripe_payment_method_id && (
              <p className="text-xs text-warning">
                No payment method on file. Auto top-up will be skipped until a card is added.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button onClick={saveSettings} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust dialog */}
      <Dialog open={!!adjustOpen} onOpenChange={(v) => !v && setAdjustOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustOpen === "credit" ? "Add credit" : "Add debit"} — {clientName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount (USD)</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Wire transfer received" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(null)}>Cancel</Button>
            <Button onClick={submitAdjust} disabled={addTxn.isPending || !amount}>
              {addTxn.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
