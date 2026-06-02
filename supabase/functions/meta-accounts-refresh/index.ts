// Re-pulls /me/adaccounts (paginated) for every active Meta connection and
// runs Meta-ad-account → Client automap. Strong matches (>= threshold)
// auto-link; medium matches (>= 0.6) land in account_match_suggestions for
// one-click approval. Designed for hourly cron + manual invocation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { bestClientMatch } from "../_shared/automap.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUGGEST_MIN = 0.6;
const AUTO_LINK = 0.9;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { workspace_id, threshold = AUTO_LINK } = body as {
      workspace_id?: string;
      threshold?: number;
    };

    // If a workspace_id is provided, scope to it; otherwise process all active connections (cron mode).
    let connQuery = admin
      .from("meta_connections")
      .select("id, workspace_id, access_token, status")
      .eq("status", "active");
    if (workspace_id) connQuery = connQuery.eq("workspace_id", workspace_id);

    const { data: connections, error: connErr } = await connQuery;
    if (connErr) throw connErr;

    let totalDiscovered = 0;
    let totalLinked = 0;
    let totalSuggested = 0;
    const perWorkspace: Record<string, { discovered: number; linked: number; suggested: number }> = {};

    for (const conn of connections ?? []) {
      const stats = perWorkspace[conn.workspace_id] ?? { discovered: 0, linked: 0, suggested: 0 };

      // Paginate /me/adaccounts
      const discovered: any[] = [];
      let nextUrl: string | null =
        `https://graph.facebook.com/v21.0/me/adaccounts?fields=account_id,name,currency,timezone_name,account_status,business{id,name}&limit=200&access_token=${encodeURIComponent(conn.access_token)}`;
      let pages = 0;
      let lastErr: any = null;
      while (nextUrl && pages < 25) {
        const r = await fetch(nextUrl);
        const j = await r.json();
        if (!r.ok) {
          lastErr = j?.error?.message ?? `HTTP ${r.status}`;
          if (r.status === 401 || r.status === 403 || j?.error?.code === 190) {
            await admin.from("meta_connections").update({ status: "expired", last_error: lastErr }).eq("id", conn.id);
          } else {
            await admin.from("meta_connections").update({ last_error: lastErr }).eq("id", conn.id);
          }
          break;
        }
        if (Array.isArray(j?.data)) discovered.push(...j.data);
        nextUrl = j?.paging?.next ?? null;
        pages++;
      }
      if (lastErr) continue;

      // Upsert ad accounts (preserve existing is_active state)
      if (discovered.length) {
        const { data: existing } = await admin
          .from("meta_ad_accounts")
          .select("act_id,is_active,client_id")
          .eq("workspace_id", conn.workspace_id)
          .eq("connection_id", conn.id);
        const existingMap = new Map((existing ?? []).map((e: any) => [e.act_id, e]));

        const rows = discovered.map((a: any) => {
          const act_id = `act_${a.account_id}`;
          const prev = existingMap.get(act_id);
          return {
            workspace_id: conn.workspace_id,
            connection_id: conn.id,
            act_id,
            account_name: a.name,
            currency: a.currency,
            timezone_name: a.timezone_name,
            business_id: a.business?.id ?? null,
            business_name: a.business?.name ?? null,
            account_status: a.account_status ?? null,
            is_active: prev ? prev.is_active : false,
            last_synced_at: new Date().toISOString(),
          };
        });
        await admin
          .from("meta_ad_accounts")
          .upsert(rows, { onConflict: "workspace_id,act_id" });
        stats.discovered += discovered.length;
      }

      // Automap pass: unmapped active accounts → best-match client
      const { data: unmapped } = await admin
        .from("meta_ad_accounts")
        .select("id, account_name, business_name")
        .eq("workspace_id", conn.workspace_id)
        .eq("connection_id", conn.id)
        .eq("is_active", true)
        .is("client_id", null);

      const { data: clients } = await admin
        .from("clients")
        .select("id, name, brand, bm_account_name")
        .eq("workspace_id", conn.workspace_id);

      for (const acc of unmapped ?? []) {
        const best = bestClientMatch(
          [acc.account_name, acc.business_name],
          clients ?? [],
        );
        if (!best.client || best.score < SUGGEST_MIN) continue;

        if (best.score >= threshold) {
          await admin.from("meta_ad_accounts").update({ client_id: best.client.id }).eq("id", acc.id);
          stats.linked++;
        } else {
          await admin.from("account_match_suggestions").upsert({
            workspace_id: conn.workspace_id,
            source: "meta",
            source_ref: acc.id,
            source_name: acc.account_name,
            source_business_name: acc.business_name,
            client_id: best.client.id,
            score: Number(best.score.toFixed(3)),
            status: "pending",
          }, { onConflict: "workspace_id,source,source_ref" });
          stats.suggested++;
        }
      }

      perWorkspace[conn.workspace_id] = stats;
    }

    for (const s of Object.values(perWorkspace)) {
      totalDiscovered += s.discovered;
      totalLinked += s.linked;
      totalSuggested += s.suggested;
    }

    return new Response(JSON.stringify({
      ok: true,
      connections: connections?.length ?? 0,
      discovered: totalDiscovered,
      linked: totalLinked,
      suggested: totalSuggested,
      perWorkspace,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
