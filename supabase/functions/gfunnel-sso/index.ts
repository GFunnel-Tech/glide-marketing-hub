// GFunnel SSO provisioning + magic-link issue.
// Trust gate is the parent iframe origin check on the client; this function
// upserts the workspace/profile/role and returns a magic-link token_hash the
// child uses with supabase.auth.verifyOtp.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Payload = {
  workspace_id: string;
  workspace_slug?: string;
  workspace_name?: string;
  user_id?: string;
  user_profile_id: string;
  user_email: string;
  user_display_name?: string;
  user_avatar_url?: string | null;
  user_role?: string;
};

function mapAppRole(role?: string): "admin" | "user" {
  const r = (role ?? "").toLowerCase();
  if (["admin", "owner", "superadmin", "super_admin"].includes(r)) return "admin";
  return "user";
}

function mapWorkspaceRole(role?: string): "owner" | "admin" | "member" {
  const r = (role ?? "").toLowerCase();
  if (["owner"].includes(r)) return "owner";
  if (["admin", "superadmin", "super_admin", "manager", "lead"].includes(r)) return "admin";
  return "member";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Payload;
    if (!body?.workspace_id || !body?.user_profile_id || !body?.user_email) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Upsert workspace (organization equivalent)
    const { error: wsErr } = await admin
      .from("workspaces")
      .upsert(
        {
          id: body.workspace_id,
          name: body.workspace_name ?? body.workspace_slug ?? "GFunnel Workspace",
          slug: body.workspace_slug ?? null,
          auth_mode: "sso",
        },
        { onConflict: "id" },
      );
    if (wsErr) throw wsErr;

    // 2) Find or create auth user
    let userId: string | null = null;

    // by gfunnel_user_profile_id
    const { data: byGfp } = await admin
      .from("profiles")
      .select("id")
      .eq("gfunnel_user_profile_id", body.user_profile_id)
      .maybeSingle();
    if (byGfp?.id) userId = byGfp.id;

    // by email on profiles
    if (!userId) {
      const { data: byEmail } = await admin
        .from("profiles")
        .select("id")
        .eq("email", body.user_email)
        .maybeSingle();
      if (byEmail?.id) userId = byEmail.id;
    }

    // create
    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: body.user_email,
        email_confirm: true,
        user_metadata: {
          gfunnel_user_profile_id: body.user_profile_id,
          gfunnel_user_id: body.user_id ?? null,
          display_name: body.user_display_name ?? null,
          avatar_url: body.user_avatar_url ?? null,
          workspace_id: body.workspace_id,
        },
      });
      if (createErr || !created.user) throw createErr ?? new Error("createUser failed");
      userId = created.user.id;
    }

    // 3) Upsert profile
    await admin.from("profiles").upsert(
      {
        id: userId,
        email: body.user_email,
        display_name: body.user_display_name ?? body.user_email.split("@")[0],
        avatar_url: body.user_avatar_url ?? null,
        gfunnel_user_profile_id: body.user_profile_id,
      },
      { onConflict: "id" },
    );

    // 4) App role
    await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: mapAppRole(body.user_role) }, {
        onConflict: "user_id,role",
        ignoreDuplicates: true,
      });

    // 5) Workspace membership
    await admin.from("workspace_members").upsert(
      {
        workspace_id: body.workspace_id,
        user_id: userId,
        role: mapWorkspaceRole(body.user_role),
      },
      { onConflict: "workspace_id,user_id" },
    );

    // 6) Magic link
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: body.user_email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      throw linkErr ?? new Error("generateLink failed");
    }

    return new Response(
      JSON.stringify({
        token_hash: link.properties.hashed_token,
        email: body.user_email,
        user_id: userId,
        workspace_id: body.workspace_id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[gfunnel-sso] error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
