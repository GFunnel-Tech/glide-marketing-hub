import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  embedId: string;
  clientId: number;
  url: string;
  title: string;
};

/**
 * Iframes a per-client embed (e.g. a ConnectWise Terms quote).
 *
 * Listens for postMessage from the embedded origin to:
 *   - auto-resize the iframe ({ source, type: "resize", height })
 *   - persist status updates ({ source, type: "decision", decision: "accepted"|"declined" })
 *
 * Until the embedded app adds the postMessage emitter, it falls back to a
 * generous fixed height and "pending" status — the iframe still renders fine.
 */
export function EmbedFrame({ embedId, clientId, url, title }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>(900);

  // Derive trusted origin from the embed URL so messages from other tabs are ignored.
  const trustedOrigin = (() => {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (!trustedOrigin) return;
    const handler = async (e: MessageEvent) => {
      if (e.origin !== trustedOrigin) return;
      const data = e.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "resize" && typeof data.height === "number") {
        setHeight(Math.max(400, Math.min(data.height + 24, 4000)));
        return;
      }

      if (data.type === "decision" && (data.decision === "accepted" || data.decision === "declined")) {
        await supabase
          .from("client_embeds")
          .update({
            status: data.decision,
            last_event_at: new Date().toISOString(),
          })
          .eq("id", embedId);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [trustedOrigin, embedId, clientId]);

  if (!trustedOrigin) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        Invalid embed URL: <code className="font-mono">{url}</code>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <iframe
        ref={iframeRef}
        src={url}
        title={title}
        className="w-full block"
        style={{ height: `${height}px`, border: 0 }}
        // sandbox is intentionally permissive — Lovable apps need scripts + same-origin to read their own Supabase session.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
