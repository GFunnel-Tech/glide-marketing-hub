// Signed embed sign-in for GHL.
// A client's GHL sub-account embeds:
//   https://metahub.gfunnel.com/portal/<ghl_location_id>?t=<embed token>
// This function validates that (location id, token) pair against
// portal_embed_tokens, provisions a portal identity scoped to that single
// client, and returns a magic-link token_hash the browser exchanges for a
// session with supabase.auth.verifyOtp. The token is the credential, so it is
// only ever accepted together with its own location id and can be revoked.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const locationId = typeof body?.location_id === "string" ? body.location_id.trim() : "";
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    if (!locationId || locationId.length > 128 || !token || token.length > 200) {
      return json({ error: "location_id and token are required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: row, error: tokErr } = await admin
      .from("portal_embed_tokens")
      .select("id, client_id, workspace_id, location_id, revoked")
      .eq("token", token)
      .maybeSingle();
    if (tokErr) throw tokErr;

    if (!row || row.revoked || row.location_id !== locationId) {
      return json({ error: "Invalid or revoked embed link" }, 401);
    }

    const { data: client, error: clientErr } = await admin
      .from("clients")
      .select("id, workspace_id, ghl_location_id, name, brand")
      .eq("id", row.client_id)
      .maybeSingle();
    if (clientErr) throw clientErr;
    if (!client || client.ghl_location_id !== locationId) {
      return json({ error: "Embed link no longer matches this sub-account" }, 401);
    }

    // Stable, non-guessable-free identity for this embed. One shared portal
    // identity per client keeps the session scoped to that client only.
    const email = `ghl-${locationId.toLowerCase()}@portal.gfunnel.com`;

    let userId: string | null = null;
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingProfile?.id) userId = existingProfile.id;

    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          display_name: client.brand ?? client.name ?? "Client Portal",
          ghl_location_id: locationId,
          portal_embed: true,
        },
      });
      if (createErr || !created?.user) {
        // Race or pre-existing auth user without a profile row — look it up.
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const found = list?.users?.find((u) => u.email?.toLowerCase() === email);
        if (!found) throw createErr ?? new Error("createUser failed");
        userId = found.id;
      } else {
        userId = created.user.id;
      }
    }

    await admin.from("profiles").upsert(
      {
        id: userId,
        email,
        display_name: client.brand ?? client.name ?? "Client Portal",
      },
      { onConflict: "id" },
    );

    // Portal mapping so every downstream portal query resolves this client.
    const { data: mapping } = await admin
      .from("portal_users")
      .select("id, status")
      .eq("user_id", userId)
      .eq("client_id", client.id)
      .maybeSingle();

    if (!mapping) {
      await admin.from("portal_users").insert({
        user_id: userId,
        client_id: client.id,
        workspace_id: client.workspace_id ?? row.workspace_id ?? null,
        status: "active",
        accepted_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
      });
    } else if (mapping.status !== "active") {
      await admin
        .from("portal_users")
        .update({ status: "active", approved_at: new Date().toISOString() })
        .eq("id", mapping.id);
    }

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      throw linkErr ?? new Error("generateLink failed");
    }

    await admin
      .from("portal_embed_tokens")
      .update({ use_count: (row as any).use_count ?? undefined, last_used_at: new Date().toISOString() })
      .eq("id", row.id);

    return json({
      token_hash: link.properties.hashed_token,
      email,
      client_id: client.id,
    });
  } catch (err) {
    console.error("[portal-embed-auth] error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
