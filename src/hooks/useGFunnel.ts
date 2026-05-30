import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  GFunnelInitPayload,
  GFunnelTheme,
  isEmbeddedInGFunnel,
  onGFunnelMessage,
  startGFunnelBridge,
} from "@/lib/gfunnel-bridge";

type State = {
  isEmbedded: boolean;
  isReady: boolean;
  error: string | null;
  context: GFunnelInitPayload | null;
  theme: GFunnelTheme | null;
};

const HANDSHAKE_TIMEOUT_MS = 6000;

export function useGFunnel(moduleSlug: string): State {
  const embedded = isEmbeddedInGFunnel();
  const [isReady, setIsReady] = useState(!embedded);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<GFunnelInitPayload | null>(null);
  const [theme, setTheme] = useState<GFunnelTheme | null>(null);
  const signedInRef = useRef(false);

  useEffect(() => {
    if (!embedded) return;
    startGFunnelBridge(moduleSlug);

    const timeout = window.setTimeout(() => {
      if (!signedInRef.current) {
        setError("GFunnel handshake timed out");
        setIsReady(true);
      }
    }, HANDSHAKE_TIMEOUT_MS);

    const unsub = onGFunnelMessage(async (msg) => {
      if (msg.type === "gfunnel:theme") {
        setTheme(msg.payload.theme);
        document.documentElement.classList.toggle("dark", msg.payload.theme === "dark");
        return;
      }
      if (msg.type !== "gfunnel:init") return;

      setContext(msg.payload);
      setTheme(msg.payload.theme);
      document.documentElement.classList.toggle("dark", msg.payload.theme === "dark");

      if (signedInRef.current) {
        setIsReady(true);
        return;
      }
      signedInRef.current = true;

      try {
        const { data, error: fnErr } = await supabase.functions.invoke("gfunnel-sso", {
          body: msg.payload,
        });
        if (fnErr) throw fnErr;
        const token_hash = (data as { token_hash?: string })?.token_hash;
        if (!token_hash) throw new Error("Missing token_hash from gfunnel-sso");

        const { error: otpErr } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash,
        });
        if (otpErr) throw otpErr;
      } catch (e) {
        console.error("[useGFunnel] SSO failed", e);
        setError((e as Error).message);
      } finally {
        window.clearTimeout(timeout);
        setIsReady(true);
      }
    });

    return () => {
      window.clearTimeout(timeout);
      unsub();
    };
  }, [embedded, moduleSlug]);

  return { isEmbedded: embedded, isReady, error, context, theme };
}
