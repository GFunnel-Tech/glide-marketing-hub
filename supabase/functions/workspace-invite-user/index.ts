import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Creates a REAL login user for a workspace and records them in the team
// directory. Replaces the old client-side `team_members` insert, which was
// blocked by admin-only RLS and never provisioned an actual auth account.
//
// Flow: verify the caller owns/admins the target workspace -> find-or-create
// the auth user -> ensure profile -> add workspace membership -> upsert the
// team_members directory row -> return a magic sign-in link the inviter can
// share (an email is also sent automatically when SMTP is configured).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

type WsRole = "owner" | "admin" | "member" | "viewer";

function mapWorkspaceRole(role: string, accessLevel: string): WsRole {
  const r = (role || "").toLowerCase();
  const a = (accessLevel || "").toLowerCase();
  if (r.includes("owner")) return "owner";
  if (r.includes("admin")) return "admin";
  if (a.includes("read")) return "viewer";
  return "member";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const caller = userRes?.user;
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const workspace_id = String(body.workspace_id ?? "");
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const phone = body.phone ? String(body.phone).trim() : null;
    const role = String(body.role ?? "Member");
    const access_level = String(body.access_level ?? "Standard");

    if (!workspace_id) return json({ error: "workspace_id is required" }, 400);
    if (!email) return json({ error: "A valid email is required to create a login" }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email address" }, 400);
    if (!name) return json({ error: "Name is required" }, 400);

    // Authorize: caller must own/admin this workspace (or be a super admin).
    const { data: membership } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", caller.id)
      .maybeSingle();
    const { data: superRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "super_admin")
      .maybeSingle();
    const callerRole = membership?.role ?? null;
    const isWsAdmin = callerRole === "owner" || callerRole === "admin";
    if (!isWsAdmin && !superRow) {
      return json({ error: "Only a workspace owner or admin can add team members" }, 403);
    }

    // Find or create the auth user (idempotent on email).
    let userId: string | null = null;
    const { data: byEmail } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (byEmail?.id) userId = byEmail.id as string;

    let created = false;
    if (!userId) {
      const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { display_name: name, invited_to_workspace: workspace_id },
      });
      if (createErr || !createdUser.user) {
        // A pre-existing auth user (no profile row) lands here — surface clearly.
        return json({ error: createErr?.message ?? "Could not create the user account" }, 400);
      }
      userId = createdUser.user.id;
      created = true;
    }

    // Ensure a profile row exists (the auth trigger normally handles this, but
    // upsert keeps the directory consistent for pre-existing accounts).
    await admin.from("profiles").upsert(
      { id: userId, email, display_name: name },
      { onConflict: "id" },
    );

    // Workspace membership — never downgrade an existing owner.
    const wsRole = mapWorkspaceRole(role, access_level);
    if (callerRole === "owner" || wsRole !== "owner") {
      await admin.from("workspace_members").upsert(
        { workspace_id, user_id: userId, role: wsRole },
        { onConflict: "workspace_id,user_id", ignoreDuplicates: true },
      );
    }

    // Team directory row (service role bypasses the admin-only RLS that was
    // rejecting the old client-side insert).
    const member_status = created ? "invited" : "active";
    const { data: existingMember } = await admin
      .from("team_members")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    let memberRow;
    if (existingMember?.id) {
      const { data } = await admin
        .from("team_members")
        .update({ name, phone, role, access_level, member_status })
        .eq("id", existingMember.id)
        .select()
        .single();
      memberRow = data;
    } else {
      const { data } = await admin
        .from("team_members")
        .insert({ name, email, phone, role, access_level, member_status })
        .select()
        .single();
      memberRow = data;
    }

    // Sign-in link the inviter can share immediately (also emailed if SMTP is set).
    let inviteLink: string | null = null;
    try {
      const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      inviteLink = link?.properties?.action_link ?? null;
    } catch (_) {
      inviteLink = null;
    }

    return json({ ok: true, user_id: userId, created, member: memberRow, invite_link: inviteLink });
  } catch (e: any) {
    console.error("workspace-invite-user", e);
    return json({ error: e?.message ?? "Server error" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
