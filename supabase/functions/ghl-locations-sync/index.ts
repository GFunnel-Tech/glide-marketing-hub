// Sync GHL locations into ghl_locations cache and auto-link strong client matches.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function norm(s: string | null | undefined) {
  return (s || "")
    .toLowerCase()
    .replace(/\b(llc|inc|ltd|co|corp|the|mortgage|capital|group|agency)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Dice coefficient on bigrams — fast & decent for short business names.
function similarity(a: string, b: string): number {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bg = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const k = s.slice(i, i + 2);
      out.set(k, (out.get(k) || 0) + 1);
    }
    return out;
  };
  const A = bg(a), B = bg(b);
  let inter = 0, total = 0;
  for (const [k, v] of A) { total += v; if (B.has(k)) inter += Math.min(v, B.get(k)!); }
  for (const v of B.values()) total += v;
  return total === 0 ? 0 : (2 * inter) / total;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const { workspace_id, autoLink = true, threshold = 0.9 } = body as {
      workspace_id: string; autoLink?: boolean; threshold?: number;
    };
    if (!workspace_id) return new Response(JSON.stringify({ error: "workspace_id required" }), { status: 400, headers: corsHeaders });

    // Membership check
    const { data: membership } = await supabase
      .from("workspace_members").select("role").eq("workspace_id", workspace_id).eq("user_id", user.id).maybeSingle();
    if (!membership) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });

    // Fetch GHL key
    const { data: cfg } = await supabase
      .from("integration_configs").select("ghl_api_key").eq("workspace_id", workspace_id).maybeSingle();
    if (!cfg?.ghl_api_key) {
      return new Response(JSON.stringify({ error: "GHL API key not configured" }), { status: 400, headers: corsHeaders });
    }

    // Try GHL v2 first (new token format), fall back to v1 legacy.
    let locations: any[] = [];
    let lastErr = "";

    // v2: needs companyId. Decode JWT to find it (PIT/OAuth tokens are JWTs).
    let companyId: string | null = null;
    try {
      const parts = cfg.ghl_api_key.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
        companyId = payload.company_id ?? payload.companyId ?? null;
      }
    } catch (_) { /* not a JWT */ }

    if (companyId) {
      const v2 = await fetch(
        `https://services.leadconnectorhq.com/locations/search?companyId=${encodeURIComponent(companyId)}&limit=500`,
        { headers: {
            Authorization: `Bearer ${cfg.ghl_api_key}`,
            Version: "2021-07-28",
            Accept: "application/json",
        } },
      );
      if (v2.ok) {
        const j = await v2.json();
        locations = j.locations || j.data || [];
      } else {
        lastErr = `v2 ${v2.status}: ${await v2.text()}`;
      }
    }

    // Fallback to v1 if v2 produced nothing.
    if (locations.length === 0) {
      const v1 = await fetch("https://rest.gohighlevel.com/v1/locations/", {
        headers: { Authorization: `Bearer ${cfg.ghl_api_key}` },
      });
      if (v1.ok) {
        const j = await v1.json();
        locations = j.locations || j.data || [];
      } else {
        const t = await v1.text();
        return new Response(
          JSON.stringify({ error: "GHL API error", detail: t, v2_error: lastErr, hint: companyId ? null : "Token is not an agency JWT — needs an Agency Private Integration Token with locations.readonly scope." }),
          { status: 502, headers: corsHeaders },
        );
      }
    }

    // Upsert cache
    const rows = locations.map((l) => ({
      workspace_id,
      location_id: l.id,
      name: l.name ?? null,
      business_name: l.business?.name ?? l.businessName ?? null,
      timezone: l.timezone ?? null,
      address: [l.address, l.city, l.state].filter(Boolean).join(", ") || null,
      raw: l,
      last_synced_at: new Date().toISOString(),
    }));
    if (rows.length) {
      await supabase.from("ghl_locations").upsert(rows, { onConflict: "workspace_id,location_id" });
    }

    // Auto-link strong matches
    let linked = 0;
    if (autoLink) {
      const { data: clients } = await supabase
        .from("clients").select("id,name,brand,bm_account_name,ghl_location_id").eq("workspace_id", workspace_id);

      for (const loc of locations) {
        const candidates = (clients || []).filter((c) => !c.ghl_location_id);
        let best = { client: null as any, score: 0 };
        for (const c of candidates) {
          const score = Math.max(
            similarity(loc.name || "", c.name || ""),
            similarity(loc.name || "", c.brand || ""),
            similarity(loc.name || "", c.bm_account_name || ""),
            similarity(loc.business?.name || loc.businessName || "", c.name || ""),
          );
          if (score > best.score) best = { client: c, score };
        }
        if (best.client && best.score >= threshold) {
          await supabase.from("clients").update({ ghl_location_id: loc.id }).eq("id", best.client.id);
          best.client.ghl_location_id = loc.id;
          linked++;
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, locations: locations.length, linked }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
