import { useState } from "react";
import { Loader2, Lock, ExternalLink, Copy, Check, Zap } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useConnectClientStripe, useStartClientStripeOAuth } from "@/hooks/useClientStripe";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: number;
  clientName: string;
}

const WEBHOOK_BASE = `https://kkuvdoejqruszisyojap.supabase.co/functions/v1/stripe-client-webhook`;

export function StripeConnectDialog({ open, onOpenChange, clientId, clientName }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [copied, setCopied] = useState(false);
  // Manual restricted-key entry is the fallback path; OAuth ("click & sync")
  // is shown first. We reveal the key form on request or if OAuth isn't set up.
  const [showKeyForm, setShowKeyForm] = useState(false);
  const connect = useConnectClientStripe();
  const startOAuth = useStartClientStripeOAuth();

  const webhookUrl = `${WEBHOOK_BASE}?client_id=${clientId}`;

  const handleOAuth = async () => {
    try {
      const res = await startOAuth.mutateAsync({
        clientId,
        returnUrl: `${window.location.origin}/billing`,
      });
      if ("notConfigured" in res) {
        toast.info("One-click Stripe Connect isn't set up yet — paste a restricted key instead.");
        setShowKeyForm(true);
        return;
      }
      // Hand off to Stripe's hosted consent screen.
      window.location.href = res.url;
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't start Stripe Connect");
      setShowKeyForm(true);
    }
  };

  const handleConnect = async () => {
    try {
      const res = await connect.mutateAsync({
        clientId,
        apiKey: apiKey.trim(),
        webhookSecret: webhookSecret.trim() || undefined,
      });
      toast.success(
        `Connected ${res.business_name ?? clientName} (${res.livemode ? "LIVE" : "TEST"} mode)`,
      );
      setApiKey("");
      setWebhookSecret("");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to connect Stripe");
    }
  };

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect Stripe — {clientName}</DialogTitle>
          <DialogDescription>
            Link {clientName}'s Stripe account so you can read their charges and rebill.
          </DialogDescription>
        </DialogHeader>

        {/* Primary path: one-click OAuth */}
        <div className="space-y-3 py-2">
          <button
            onClick={handleOAuth}
            disabled={startOAuth.isPending}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#635bff] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#544dff] disabled:opacity-60"
          >
            {startOAuth.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Zap className="h-4 w-4" />}
            Connect with Stripe
          </button>
          <p className="text-[11px] text-center text-muted-foreground">
            Redirects to Stripe to approve — no keys to copy. Comes back here automatically.
          </p>

          {!showKeyForm && (
            <button
              onClick={() => setShowKeyForm(true)}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Use a restricted API key instead (advanced)
            </button>
          )}
        </div>

        {/* Fallback path: manual restricted key */}
        {showKeyForm && (
          <div className="space-y-4 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Paste this client's own Stripe credentials. Their key is stored encrypted
              server-side and is never sent to any browser. Use a{" "}
              <a
                href="https://dashboard.stripe.com/test/apikeys/create"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline inline-flex items-center gap-0.5"
              >
                restricted key <ExternalLink className="h-3 w-3" />
              </a>{" "}
              with at minimum Charges (read+write) and Customers (read).
            </p>

            <div>
              <Label htmlFor="stripe-api-key" className="text-xs font-medium">
                Stripe secret or restricted key
              </Label>
              <div className="relative mt-1">
                <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="stripe-api-key"
                  type="password"
                  placeholder="sk_test_... or rk_test_..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pl-8 font-mono text-xs"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">
                Step 2 (optional): wire up their Stripe webhook
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                In <strong>their</strong> Stripe → Developers → Webhooks → Add endpoint, paste
                this URL and subscribe to <code className="text-[10px] bg-muted px-1 rounded">charge.*</code> events.
                Then paste the signing secret below.
              </p>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 rounded bg-background border border-border px-2 py-1 text-[10px] text-foreground break-all">
                  {webhookUrl}
                </code>
                <Button size="sm" variant="outline" onClick={copyWebhook} className="h-7 px-2 shrink-0">
                  {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <Input
                type="password"
                placeholder="whsec_..."
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={connect.isPending}>
                Cancel
              </Button>
              <Button onClick={handleConnect} disabled={!apiKey || connect.isPending}>
                {connect.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Connect with key
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
