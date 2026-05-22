import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, X, ShieldAlert, Clock, Plug } from "lucide-react";
import { useMetaScopeStatus } from "@/hooks/useMetaScopeStatus";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

/**
 * Workspace + user scoped Meta scope banner.
 * Dismiss state is keyed by (user, workspace-connection-signature) so the
 * banner re-appears whenever scopes change or a new issue arises.
 */
export function MetaScopeBanner() {
  const { user } = useAuth();
  const { data } = useMetaScopeStatus();
  const [dismissed, setDismissed] = useState(false);

  const storageKey = data && user
    ? `meta_scope_banner_dismissed:${user.id}:${data.signature}`
    : null;

  useEffect(() => {
    if (!storageKey) return;
    setDismissed(localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  if (!data || !user) return null;
  if (data.state === "ok" || data.state === "no_connection") return null;
  if (dismissed) return null;

  const dismiss = () => {
    if (storageKey) localStorage.setItem(storageKey, "1");
    setDismissed(true);
  };

  const meta = bannerCopy(data.state, data.missingScopes);

  return (
    <div className={`flex items-center gap-3 px-4 py-2 text-sm border-b ${meta.className}`}>
      <meta.Icon className="h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">{meta.title}</span>
        <span className="ml-2 text-muted-foreground hidden sm:inline">{meta.body}</span>
      </div>
      <Button asChild size="sm" variant="outline" className="h-7">
        <Link to="/settings/integrations">{meta.cta}</Link>
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="opacity-60 hover:opacity-100 transition"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function bannerCopy(
  state: "expired" | "missing_scopes" | "errored",
  missing: string[],
) {
  switch (state) {
    case "expired":
      return {
        Icon: Clock,
        title: "Meta token expired",
        body: "Reconnect Meta so we can keep pulling ads, insights, and leads.",
        cta: "Reconnect Meta",
        className:
          "bg-destructive/10 text-destructive border-destructive/30",
      };
    case "missing_scopes":
      return {
        Icon: ShieldAlert,
        title: `Meta is missing ${missing.length} required permission${missing.length === 1 ? "" : "s"}`,
        body: `Re-grant: ${missing.join(", ")}. Without these we can't pull leads or insights.`,
        cta: "Re-grant scopes",
        className: "bg-warning/10 text-warning-foreground border-warning/40",
      };
    case "errored":
    default:
      return {
        Icon: Plug,
        title: "Meta connection error",
        body: "One or more Meta connections in this workspace aren't reporting healthy.",
        cta: "Open Integrations",
        className: "bg-warning/10 text-warning-foreground border-warning/40",
      };
  }
}
