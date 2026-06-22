import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: ures } = await userClient.auth.getUser();
    const caller = ures?.user;
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json();
    const { target_user_id, reason, action } = body;

    // For "start" we require super_admin OR an agency owner/admin impersonating
    // one of their own client portal users. For "end" the caller is the
    // impersonated user, so we authorize via the existence of an open start
    // record (handled below).
    let isSuperAdmin = false;
    let isAgencyScoped = false;
    if (action !== "end") {
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", caller.id)
        .eq("role", "super_admin")
        .maybeSingle();
      isSuperAdmin = !!roleRow;

      if (!isSuperAdmin) {
        if (!target_user_id) return json({ error: "target_user_id required" }, 400);

        // Agency-scoped path: caller must be owner/admin of a workspace that
        // contains a client linked to target via portal_users.
        const { data: mappings } = await admin
          .from("portal_users")
          .select("workspace_id")
          .eq("user_id", target_user_id);
        const workspaceIds = Array.from(
          new Set((mappings ?? []).map((m: any) => m.workspace_id).filter(Boolean)),
        );
        if (workspaceIds.length > 0) {
          const { data: memberships } = await admin
            .from("workspace_members")
            .select("workspace_id, role")
            .eq("user_id", caller.id)
            .in("workspace_id", workspaceIds);
          isAgencyScoped = (memberships ?? []).some((m: any) =>
            ["owner", "admin"].includes(m.role),
          );
        }

        if (!isAgencyScoped) {
          await admin.from("impersonation_log").insert({
            super_admin_id: caller.id,
            target_user_id: target_user_id ?? null,
            action: "denied_impersonation",
            meta: { endpoint: "admin-impersonate", email: caller.email ?? null, scope: "agency_attempt" },
          }).then(() => {}, () => {});
          return json({ error: "Forbidden" }, 403);
        }
      }
    }


    // ---- END action: log when an admin exits an impersonation session.
    // The caller here IS the impersonated user (the session has been swapped),
    // so we resolve the originating super admin from the most recent open start. ----
    if (action === "end") {
      const { data: lastStart } = await admin
        .from("impersonation_log")
        .select("id, created_at, meta, super_admin_id, target_user_id")
        .eq("target_user_id", caller.id)
        .eq("action", "start")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastStart) return json({ ok: true, skipped: "no open session" });

      const durationMs = Date.now() - new Date(lastStart.created_at).getTime();
      await admin.from("impersonation_log").insert({
        super_admin_id: lastStart.super_admin_id,
        target_user_id: lastStart.target_user_id,
        action: "end",
        meta: {
          start_id: lastStart.id,
          duration_ms: durationMs,
          email: (lastStart.meta as any)?.email ?? null,
        },
      });
      return json({ ok: true });
    }

    if (!target_user_id) return json({ error: "target_user_id required" }, 400);
    if (target_user_id === caller.id) return json({ error: "You cannot impersonate yourself" }, 400);

    const { data: target, error: gErr } = await admin.auth.admin.getUserById(target_user_id);
    if (gErr || !target?.user?.email) throw gErr ?? new Error("User missing email");

    // Block impersonating banned/suspended accounts
    const bannedUntil = (target.user as any).banned_until;
    if (bannedUntil && new Date(bannedUntil) > new Date()) {
      return json({ error: "Cannot impersonate a suspended user" }, 403);
    }

    // SAFETY: never impersonate another super admin (privilege parity / audit clarity)
    const { data: targetRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", target_user_id);
    const roles = (targetRoles ?? []).map((r: any) => r.role);
    if (roles.includes("super_admin")) {
      return json({ error: "Impersonating another super admin is not allowed" }, 403);
    }
    // Configurable allow-list of impersonatable roles. 'user' is implicit when no role rows exist.
    const ALLOWED_ROLES = new Set(["user", "admin", "moderator"]);
    const disallowed = roles.filter((r: string) => !ALLOWED_ROLES.has(r));
    if (disallowed.length > 0) {
      return json({ error: `Role not allowed for impersonation: ${disallowed.join(", ")}` }, 403);
    }

    // Rate limit: max 10 impersonation starts per super admin per hour
    const { count: recent } = await admin
      .from("impersonation_log")
      .select("id", { count: "exact", head: true })
      .eq("super_admin_id", caller.id)
      .eq("action", "start")
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
    if ((recent ?? 0) >= 10) {
      return json({ error: "Impersonation rate limit reached (10/hour). Try again later." }, 429);
    }

    const { data: link, error: lErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: target.user.email,
    });
    if (lErr) throw lErr;

    const hashed_token = (link as any)?.properties?.hashed_token;
    if (!hashed_token) throw new Error("No hashed_token returned");

    await admin.from("impersonation_log").insert({
      super_admin_id: caller.id,
      target_user_id,
      action: "start",
      meta: { email: target.user.email, target_roles: roles, reason: reason ?? null },
    });

    return json({ hashed_token, email: target.user.email });
  } catch (e: any) {
    console.error(e);
    return json({ error: e.message ?? "Server error" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
