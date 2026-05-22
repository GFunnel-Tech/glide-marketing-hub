import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Facebook, RefreshCw, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export const REQUIRED_META_SCOPES = [
  "ads_read",
  "ads_management",
  "business_management",
  "read_insights",
  "leads_retrieval",
] as const;

const SCOPE_LABEL: Record<string, string> = {
  ads_read: "Read ad data",
  ads_management: "Manage ads",
  business_management: "Business Manager access",
  read_insights: "Read insights",
  leads_retrieval: "Retrieve leads",
};

interface ConnectionLike {
  id: string;
  meta_user_name: string | null;
  status: string;
  scopes: string[] | null;
}

/** Static banner — used on the public /auth page where no session/scopes exist yet. */
export function MetaScopesStaticBanner() {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-left">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">
          Meta permissions we'll request after sign-in
        </p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        When you connect Meta, Lovable will request the following scopes. You'll see the exact granted scopes on the Integrations page.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {REQUIRED_META_SCOPES.map(s => (
          <Badge key={s} variant="outline" className="text-[10px] font-mono">
            {s}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/** Live banner — shows current connections, their status, and granted scopes. */
export function MetaScopesLiveBanner({ connections }: { connections: ConnectionLike[] }) {
  if (!connections.length) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Facebook className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Meta connection status & granted scopes</p>
      </div>
      <div className="space-y-3">
        {connections.map(c => {
          const granted = c.scopes ?? [];
          const missing = REQUIRED_META_SCOPES.filter(s => !granted.includes(s));
          const isActive = c.status === "active";
          return (
            <div key={c.id} className="rounded-md border border-border bg-background p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  {isActive ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm font-medium text-foreground">
                    {c.meta_user_name ?? "Meta connection"}
                  </span>
                  <Badge variant={isActive ? "default" : "destructive"} className="text-[10px] uppercase">
                    {c.status}
                  </Badge>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {granted.length} / {REQUIRED_META_SCOPES.length} scopes granted
                </span>
              </div>

              {granted.length > 0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Granted</p>
                  <div className="flex flex-wrap gap-1.5">
                    {granted.map(s => (
                      <Badge key={s} variant="secondary" className="text-[10px] font-mono gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5 text-success" />
                        {s}
                        {SCOPE_LABEL[s] && (
                          <span className="text-muted-foreground font-sans font-normal">· {SCOPE_LABEL[s]}</span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {missing.length > 0 && (
                <div>
                  <p className="text-[11px] text-warning flex items-center gap-1 mb-1">
                    <AlertTriangle className="h-3 w-3" /> Missing required scopes
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {missing.map(s => (
                      <Badge key={s} variant="outline" className="text-[10px] font-mono border-warning/40 text-warning">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
