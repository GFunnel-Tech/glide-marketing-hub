import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalClient } from "@/hooks/usePortalClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PortalBilling() {
  const { clientId } = usePortalClient();

  const wallet = useQuery({
    queryKey: ["portal-wallet", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_wallets")
        .select("balance,currency,low_balance_threshold,topup_amount,auto_topup_enabled,last_transaction_at")
        .eq("client_id", clientId!)
        .maybeSingle();
      return data;
    },
  });

  const w = wallet.data;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">Plan, invoices, and payment method.</p>
      </div>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Wallet balance</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              ${Number(w?.balance ?? 0).toLocaleString()} <span className="text-base font-normal text-muted-foreground">{w?.currency ?? "USD"}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {w?.auto_topup_enabled
                ? `Auto top-up: $${w.topup_amount} when below $${w.low_balance_threshold}`
                : "Auto top-up: off"}
            </p>
          </div>
          <Button className="bg-[hsl(var(--primary))]">Update payment method</Button>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Invoices</h3>
        <p className="text-sm text-muted-foreground">Your invoice history will appear here once billing is connected.</p>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-2">Billing questions?</h3>
        <p className="text-sm text-muted-foreground">Contact billing support — we usually reply within one business day.</p>
        <Button variant="outline" className="mt-3">Contact billing support</Button>
      </Card>
    </div>
  );
}
