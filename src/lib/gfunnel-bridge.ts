// GFunnel parent <-> child iframe postMessage bridge.
// Trust gate: only accept messages from GFUNNEL_ORIGIN.
export const GFUNNEL_ORIGIN = "https://www.gfunnel.com";

export type GFunnelTheme = "light" | "dark";

export type GFunnelInitPayload = {
  workspace_id: string;
  workspace_slug?: string;
  workspace_name?: string;
  user_id?: string;
  user_profile_id: string;
  user_email: string;
  user_display_name?: string;
  user_avatar_url?: string | null;
  user_role?: string;
  theme: GFunnelTheme;
  config?: Record<string, unknown>;
};

type Listener = (msg: GFunnelMessage) => void;

export type GFunnelMessage =
  | { type: "gfunnel:init"; payload: GFunnelInitPayload }
  | { type: "gfunnel:theme"; payload: { theme: GFunnelTheme } };

let context: GFunnelInitPayload | null = null;
const listeners = new Set<Listener>();
let started = false;

export function getGFunnelContext() {
  return context;
}

export function isEmbeddedInGFunnel() {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function onGFunnelMessage(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function startGFunnelBridge(moduleSlug: string) {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== GFUNNEL_ORIGIN) return;
    const data = event.data as GFunnelMessage | undefined;
    if (!data || typeof data !== "object" || !("type" in data)) return;
    if (!String(data.type).startsWith("gfunnel:")) return;

    if (data.type === "gfunnel:init") {
      context = data.payload;
    }
    listeners.forEach((l) => l(data));
  });

  // Announce ready to parent
  try {
    window.parent?.postMessage(
      { type: "module:ready", payload: { module_slug: moduleSlug } },
      GFUNNEL_ORIGIN,
    );
  } catch (e) {
    console.warn("[gfunnel] postMessage to parent failed", e);
  }
}
