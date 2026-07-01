import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalClient } from "@/hooks/usePortalClient";
import { useClientRequests, useCreateClientRequest } from "@/hooks/useClientRequests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plug, CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PROVIDERS = [
  { id: "meta", label: "Meta Ads" },
  { id: "ghl", label: "GoHighLevel (CRM)" },
  { id: "google", label: "Google Ads" },
  { id: "ga4", label: "Google Analytics 4" },
  { id: "stripe", label: "Stripe" },
];

export default function PortalIntegrations() {
  const { clientId } = usePortalClient();
  const { data: reqs = [] } = useClientRequests("integration", clientId);

  // Detect existing connections (best-effort)
  const meta = useQuery({
    queryKey: ["portal-int-meta", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { count } = await supabase.from("meta_ad_accounts").select("id", { count: "exact", head: true }).eq("client_id", clientId!);
      return (count ?? 0) > 0;
    },
  });
  const ghl = useQuery({
    queryKey: ["portal-int-ghl", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("ghl_location_id").eq("id", clientId!).maybeSingle();
      return !!(data as any)?.ghl_location_id;
    },
  });

  const connected: Record<string, boolean> = {
    meta: meta.data ?? false, ghl: ghl.data ?? false, google: false, ga4: false, stripe: false,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Plug className="h-6 w-6 text-primary" /> Integrations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Connected platforms and integration requests.</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {PROVIDERS.map((p) => {
          const isOn = connected[p.id];
          return (
            <div key={p.id} className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                {isOn ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                <div>
                  <p className="text-sm font-medium text-foreground">{p.label}</p>
                  <p className="text-xs text-muted-foreground">{isOn ? "Connected" : "Not connected"}</p>
                </div>
              </div>
              {!isOn && <RequestIntegrationDialog clientId={clientId} provider={p.id} label={p.label} />}
            </div>
          );
        })}
      </div>

      {reqs.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Integration requests</h3>
          </div>
          <div className="divide-y divide-border">
            {reqs.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">{r.provider}</p>
                  {r.credentials_note && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.credentials_note}</p>}
                </div>
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold uppercase",
                  r.status === "done" ? "bg-success/10 text-success" : "bg-primary/10 text-primary",
                )}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RequestIntegrationDialog({ clientId, provider, label }: { clientId: number | null; provider: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const create = useCreateClientRequest("integration", clientId);
  async function submit() {
    try {
      await create.mutateAsync({ provider, credentials_note: note || null });
      toast.success("Request sent"); setOpen(false); setNote("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm">Request connection</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Request {label} connection</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Anything we should know?</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="e.g. Account ID, login owner, admin contact…" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
