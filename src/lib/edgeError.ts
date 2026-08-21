import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Turns the opaque "Edge Function returned a non-2xx status code" into the
 * real server message (and a readable hint for auth/session failures).
 */
export async function readEdgeError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context?.status;
    let body = "";
    try {
      body = await error.context.text();
    } catch {
      /* ignore */
    }
    let parsed: any = null;
    try {
      parsed = body ? JSON.parse(body) : null;
    } catch {
      /* non-JSON */
    }
    const msg = parsed?.error || parsed?.message || body || `HTTP ${status}`;
    if (status === 401 || /unauthor/i.test(String(msg))) {
      return "Your session expired — sign out and back in, then try again.";
    }
    return typeof msg === "string" ? msg : JSON.stringify(msg);
  }
  return (error as any)?.message || "Request failed";
}

/** Ensures a live session before invoking an authenticated edge function. */
export async function ensureSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;
  const { data: refreshed } = await supabase.auth.refreshSession();
  return !!refreshed.session;
}

/** Opens an OAuth popup, falling back to same-tab navigation if blocked. */
export function openOAuthPopup(url: string): boolean {
  const win = window.open(url, "_blank", "width=600,height=700");
  if (!win || win.closed) {
    window.location.href = url;
    return false;
  }
  return true;
}
