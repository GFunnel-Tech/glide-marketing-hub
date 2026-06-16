import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, ExternalLink, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useConnectAgencyStripe, useSyncAgencyStripe } from "@/hooks/useAgencyStripe";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If true, modal can be dismissed (e.g. user clicked "Reconnect"). Otherwise it's a forced prompt. */
  dismissible?: boolean;
}

export function AgencyStripeConnectModal({ open, onOpenChange, dismissible = true }: Props) {
  const [apiKey, setApiKey] = useState("");
  const connect = useConnectAgencyStripe();
  const sync = useSyncAgencyStripe();

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    try {
      const res: any = await connect.mutateAsync(apiKey.trim());
      toast.success(`Connected to ${res?.account?.name ?? res?.account?.email ?? "your Stripe account"}`);
      setApiKey("");
      // Kick off an initial 90-day sync
      const syncToast = toast.loading("Syncing the last 90 days of charges…");
      try {
        const syncRes = await sync.mutateAsync(90);
        toast.success(
          `Synced ${syncRes.fetched} charge${syncRes.fetched === 1 ? "" : "s"} · ${syncRes.matched} matched to clients`,
          { id: syncToast },
        );
      } catch (e: any) {
        toast.error(e?.message ?? "Initial sync failed", { id: syncToast });
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to connect Stripe");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!dismissible && !o) return; // block closing when forced
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => !dismissible && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            Connect your agency Stripe account
          </DialogTitle>
          <DialogDescription>
            Sync charges from your single Stripe account across all clients. We'll match each Stripe customer to a client by email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              Create a <strong>restricted key</strong> (read-only on Charges, Customers, Invoices, Disputes) so we never have write access.{" "}
              <a
                href="https://dashboard.stripe.com/apikeys/create"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 underline hover:text-amber-900"
              >
                Create one in Stripe <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stripe-key">Stripe API key</Label>
            <Input
              id="stripe-key"
              type="password"
              autoComplete="off"
              placeholder="rk_live_… or sk_live_…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-xs text-gray-500">
              Stored securely on the backend — only used to read charges, never displayed back.
            </p>
          </div>
        </div>

        <DialogFooter>
          {dismissible && (
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={connect.isPending}>
              Cancel
            </Button>
          )}
          <Button onClick={handleConnect} disabled={connect.isPending || !apiKey.trim()}>
            {connect.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Verifying…
              </>
            ) : (
              "Connect & sync"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
