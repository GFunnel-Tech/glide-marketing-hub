// Lists Facebook Pages, linked Instagram business accounts, and Ad Accounts
// accessible to the connected Meta user.
// Body: { workspaceId, refresh?: boolean }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const { workspaceId } = await req.json();
    if (!workspaceId) return json({ error: "workspaceId required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conn } = await admin.from("meta_connections")
      .select("id, access_token, meta_user_name, meta_user_id, status, token_expires_at")
      .eq("workspace_id", workspaceId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!conn) return json({ error: "No active Meta connection", connection: null, pages: [], adAccounts: [] }, 200);

    // Pages + their linked Instagram business account (one Graph call)
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,picture{url},instagram_business_account{id,username,profile_picture_url},tasks&limit=100&access_token=${conn.access_token}`,
    );
    const pagesJson = await pagesRes.json();
    if (!pagesRes.ok) {
      return json({ error: pagesJson?.error?.message || "Failed to list Pages", connection: conn, pages: [], adAccounts: [] }, 200);
    }
    let pages = (pagesJson.data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      avatar: p.picture?.data?.url ?? null,
      canAdvertise: Array.isArray(p.tasks) ? p.tasks.includes("ADVERTISE") : true,
      instagram: p.instagram_business_account
        ? {
            id: p.instagram_business_account.id,
            username: p.instagram_business_account.username,
            avatar: p.instagram_business_account.profile_picture_url ?? null,
          }
        : null,
    }));

    // Scope identities to a specific ad account when one is selected.
    // Meta only allows publishing as a Page/IG that is promotable by the ad account.
    let scopedToAdAccount = false;
    let scopeWarning: string | null = null;
    if (adAccountId) {
      const actId = String(adAccountId).startsWith("act_") ? String(adAccountId) : `act_${adAccountId}`;
      try {
        const [promoRes, igRes] = await Promise.all([
          fetch(`https://graph.facebook.com/v21.0/${actId}/promote_pages?fields=id,name,picture{url}&limit=200&access_token=${conn.access_token}`),
          fetch(`https://graph.facebook.com/v21.0/${actId}/instagram_accounts?fields=id,username&limit=200&access_token=${conn.access_token}`),
        ]);
        const promoJson = await promoRes.json();
        const igJson = await igRes.json();

        if (promoRes.ok && Array.isArray(promoJson.data)) {
          const allowedPageIds = new Set<string>(promoJson.data.map((p: any) => String(p.id)));
          const byId = new Map(pages.map((p: any) => [p.id, p]));
          // Keep the ad account's promotable pages, enriching with data from me/accounts.
          pages = promoJson.data.map((p: any) => {
            const known: any = byId.get(String(p.id));
            return known ?? {
              id: String(p.id),
              name: p.name,
              avatar: p.picture?.data?.url ?? null,
              canAdvertise: true,
              instagram: null,
            };
          });
          scopedToAdAccount = true;
          if (allowedPageIds.size === 0) {
            scopeWarning = "This ad account has no Pages available to advertise with. Add the Page to the same Business Manager as the ad account.";
          }
        } else {
          scopeWarning = promoJson?.error?.message || "Couldn't verify which Pages this ad account can advertise with.";
        }

        if (igRes.ok && Array.isArray(igJson.data) && igJson.data.length > 0) {
          const allowedIg = new Set<string>(igJson.data.map((a: any) => String(a.id)));
          pages = pages.map((p: any) =>
            p.instagram && !allowedIg.has(String(p.instagram.id)) ? { ...p, instagram: null } : p,
          );
        }
      } catch (_e) {
        scopeWarning = "Couldn't verify Page access for this ad account.";
      }
    }


    // Ad Accounts (from our table — already synced via the connect flow)
    const { data: accounts } = await admin.from("meta_ad_accounts")
      .select("act_id, account_name, business_name, currency, client_id")
      .eq("workspace_id", workspaceId).eq("is_active", true)
      .order("account_name");

    return json({
      connection: {
        id: conn.id,
        userName: conn.meta_user_name,
        userId: conn.meta_user_id,
        status: conn.status,
        expiresAt: conn.token_expires_at,
      },
      pages,
      adAccounts: accounts ?? [],
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});
