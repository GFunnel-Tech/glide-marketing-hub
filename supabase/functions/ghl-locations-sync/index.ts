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

    // Fetch GHL key + optional company id
    const { data: cfg } = await supabase
      .from("integration_configs").select("ghl_api_key, ghl_company_id").eq("workspace_id", workspace_id).maybeSingle();
    if (!cfg?.ghl_api_key) {
      return new Response(JSON.stringify({ error: "GHL API key not configured" }), { status: 400, headers: corsHeaders });
    }

    let locations: any[] = [];
    let companyId: string | null = cfg.ghl_company_id ?? null;
    const attempts: Array<{ endpoint: string; status: number; body: string }> = [];

    // Try to extract companyId from JWT (legacy tokens). Opaque `pit-...` tokens skip this.
    if (!companyId) {
      try {
        const parts = cfg.ghl_api_key.split(".");
        if (parts.length === 3) {
          const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
          const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
          const payload = JSON.parse(atob(padded));
          companyId = payload.company_id ?? payload.companyId
            ?? (payload.authClass === "Company" ? payload.authClassId : null)
            ?? payload.primaryAuthClassId ?? null;
        }
      } catch (_) { /* opaque */ }
    }

    const v2Headers = {
      Authorization: `Bearer ${cfg.ghl_api_key}`,
      Version: "2021-07-28",
      Accept: "application/json",
    };

    // Attempt 1: auto-discover companyId via /oauth/userinfo (works with most agency PITs)
    if (!companyId) {
      const r = await fetch("https://services.leadconnectorhq.com/oauth/userinfo", { headers: v2Headers });
      const txt = await r.text();
      attempts.push({ endpoint: "GET /oauth/userinfo", status: r.status, body: txt.slice(0, 400) });
      if (r.ok) {
        try {
          const j = JSON.parse(txt);
          companyId = j.companyId ?? j.company_id ?? j.activeLocation?.companyId ?? null;
        } catch (_) {}
      }
    }

    // Attempt 2: try /locations/search without companyId — some PITs allow this
    if (!companyId) {
      const r = await fetch("https://services.leadconnectorhq.com/locations/search?limit=500", { headers: v2Headers });
      const txt = await r.text();
      attempts.push({ endpoint: "GET /locations/search (no companyId)", status: r.status, body: txt.slice(0, 400) });
      if (r.ok) {
        try {
          const j = JSON.parse(txt);
          locations = j.locations || j.data || [];
          if (locations[0]?.companyId) companyId = locations[0].companyId;
        } catch (_) {}
      } else {
        // GHL sometimes echoes companyId in the error
        const m = txt.match(/companyId["'\s:]+([A-Za-z0-9]{12,})/);
        if (m) companyId = m[1];
      }
    }

    // Attempt 3: with discovered companyId, paginate through /locations/search
    if (companyId) {
      const collected: any[] = locations.slice();
      let skip = collected.length; // honor whatever attempt 2 already returned
      let page = 0;
      while (page < 25) {
        const r = await fetch(
          `https://services.leadconnectorhq.com/locations/search?companyId=${encodeURIComponent(companyId)}&limit=500&skip=${skip}`,
          { headers: v2Headers },
        );
        const txt = await r.text();
        attempts.push({ endpoint: `GET /locations/search?companyId=${companyId}&skip=${skip}`, status: r.status, body: txt.slice(0, 200) });
        if (!r.ok) break;
        let chunk: any[] = [];
        try { const j = JSON.parse(txt); chunk = j.locations || j.data || []; } catch (_) { break; }
        if (!chunk.length) break;
        collected.push(...chunk);
        if (chunk.length < 500) break;
        skip += chunk.length;
        page++;
      }
      locations = collected;
    }

    if (locations.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Could not fetch GHL sub-accounts",
          companyId,
          attempts,
          hint: companyId
            ? "Discovered Company ID but locations call failed. Verify the PIT has scope `locations.readonly`."
            : "Could not auto-discover Company ID from the PIT. Either add it manually in the Agency Connection panel, or recreate the PIT in GHL Agency View → Settings → Private Integrations with scope `locations.readonly`.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Persist discovered companyId for future runs
    if (companyId && !cfg.ghl_company_id) {
      await supabase.from("integration_configs")
        .update({ ghl_company_id: companyId })
        .eq("workspace_id", workspace_id);
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

    // Auto-link strong matches + queue medium-confidence suggestions
    let linked = 0;
    let suggested = 0;
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
        if (!best.client) continue;
        if (best.score >= threshold) {
          await supabase.from("clients").update({ ghl_location_id: loc.id }).eq("id", best.client.id);
          best.client.ghl_location_id = loc.id;
          linked++;
        } else if (best.score >= 0.6) {
          await supabase.from("account_match_suggestions").upsert({
            workspace_id,
            source: "ghl",
            source_ref: loc.id,
            source_name: loc.name,
            source_business_name: loc.business?.name ?? loc.businessName ?? null,
            client_id: best.client.id,
            score: Number(best.score.toFixed(3)),
            status: "pending",
          }, { onConflict: "workspace_id,source,source_ref" });
          suggested++;
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, locations: locations.length, linked, suggested }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
