import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePortalLocationId } from "@/hooks/usePortalLocationScope";

/**
 * Signed embed sign-in for GHL.
 *
 * When the portal is opened inside a GHL sub-account as
 * `/portal/<locationId>?t=<embed token>`, this exchanges the token for a real
 * portal session so the user never sees a login screen. The token is stripped
 * from the URL right after the exchange so it isn't left in the address bar.
 */
export function usePortalEmbedAuth(hasSession: boolean) {
  const locationId = usePortalLocationId();
  const [params, setParams] = useSearchParams();
  const token = params.get("t");
  const attempted = useRef(false);
  const [exchanging, setExchanging] = useState<boolean>(!!token && !!locationId && !hasSession);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !locationId) {
      setExchanging(false);
      return;
    }
    if (hasSession) {
      // Already signed in — just clean the token out of the URL.
      const next = new URLSearchParams(params);
      next.delete("t");
      setParams(next, { replace: true });
      setExchanging(false);
      return;
    }
    if (attempted.current) return;
    attempted.current = true;

    (async () => {
      setExchanging(true);
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("portal-embed-auth", {
          body: { location_id: locationId, token },
        });
        if (fnErr) throw fnErr;
        if (!data?.token_hash || !data?.email) throw new Error("Invalid embed link");

        const { error: otpErr } = await supabase.auth.verifyOtp({
          email: data.email,
          token_hash: data.token_hash,
          type: "magiclink",
        });
        if (otpErr) throw otpErr;

        const next = new URLSearchParams(params);
        next.delete("t");
        setParams(next, { replace: true });
      } catch (e) {
        console.error("[portal-embed-auth]", e);
        setError("This embed link is invalid or has been revoked.");
      } finally {
        setExchanging(false);
      }
    })();
  }, [token, locationId, hasSession, params, setParams]);

  return { exchanging, error, hasEmbedToken: !!token && !!locationId };
}
