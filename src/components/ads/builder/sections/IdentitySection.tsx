import { useState } from "react";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { Section } from "../shared/Section";
import { User, Facebook, Instagram, Wallet, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectedAccountsModal } from "../ConnectedAccountsModal";

export function IdentitySection() {
  const state = useAdDraftStore((s) => s.state);
  const [open, setOpen] = useState(false);

  const connected = state.pageId && state.adAccountId;

  return (
    <Section title="Identity" icon={<User className="h-4 w-4 text-primary" />}>
      {connected ? (
        <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
              {state.pageAvatar ? <img src={state.pageAvatar} alt="" className="h-full w-full object-cover" /> : <Facebook className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{state.pageName}</div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {state.igUsername ? (
                  <span className="inline-flex items-center gap-1"><Instagram className="h-3 w-3" /> @{state.igUsername}</span>
                ) : (
                  <span>Facebook only</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Wallet className="h-3.5 w-3.5 text-emerald-500" />
            <span className="truncate">{state.adAccountName || state.adAccountId}</span>
            <span className="text-muted-foreground">• {state.currency}</span>
          </div>
          <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => setOpen(true)}>
            <Settings2 className="h-3 w-3 mr-1.5" /> Change connected accounts
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-xs text-muted-foreground mb-2">Connect a Facebook Page, Instagram account, and Ad Account to publish.</p>
          <Button size="sm" onClick={() => setOpen(true)} className="h-8 text-xs">
            <Settings2 className="h-3 w-3 mr-1.5" /> Choose connected accounts
          </Button>
        </div>
      )}
      <ConnectedAccountsModal open={open} onOpenChange={setOpen} />
    </Section>
  );
}
