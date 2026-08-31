import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// One-off bootstrap: creates a single hard-coded admin account that must
// change its password on first sign-in. Safe to delete after use.
const TARGET_EMAIL = "ryan@rivemedia.com";
const TARGET_PASSWORD = "Rive123$";

Deno.serve(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users.find((u) => u.email?.toLowerCase() === TARGET_EMAIL);

  if (user) {
    await admin.auth.admin.updateUserById(user.id, {
      password: TARGET_PASSWORD,
      email_confirm: true,
    } as any);
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: TARGET_EMAIL,
      password: TARGET_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Ryan" },
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    user = created.user!;
  }

  await admin.from("profiles").upsert(
    {
      id: user!.id,
      email: TARGET_EMAIL,
      display_name: "Ryan",
      must_change_password: true,
    },
    { onConflict: "id" },
  );

  await admin.from("user_roles").upsert(
    { user_id: user!.id, role: "admin" },
    { onConflict: "user_id,role" },
  );

  return new Response(JSON.stringify({ ok: true, user_id: user!.id }), {
    headers: { "Content-Type": "application/json" },
  });
});
