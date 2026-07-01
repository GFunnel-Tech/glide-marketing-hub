// Auto-provision a password-protected portal for a newly-created client.
// Fired from the AFTER INSERT trigger on public.clients (or callable directly).
//
// Flow:
//   1. Look up client + primary contact email (from onboarding / clients row).
//   2. If email present -> invite via Supabase Auth (magic link) and upsert
//      a portal_users row linked to that client with status='invited'.
//   3. If no email -> record a placeholder portal_users row with status='pending_email'
//      so the agency can see "Send portal invite" in the Client Profile.
//
// Never returns secrets. Called with either the service-role key (from the
// trigger's pg_net call, using the project anon key + signed URL is fine
// because we validate inputs and use SUPABASE_SERVICE_ROLE_KEY server-side).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Body {
  client_id: number;
  workspace_id?: string | null;
  email?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.client_id || typeof body.client_id !== "number") {
      return json({ error: "client_id required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const { data: client, error: clientErr } = await admin
      .from("clients")
      .select("id, name, brand, workspace_id, portal_slug, primary_contact_email, email")
      .eq("id", body.client_id)
      .maybeSingle();

    if (clientErr) return json({ error: clientErr.message }, 500);
    if (!client) return json({ error: "client not found" }, 404);

    // Try several places for the invite email.
    let email: string | null =
      body.email ??
      (client as any).primary_contact_email ??
      (client as any).email ??
      null;

    if (!email) {
      // Fall back to onboarding row (portal_onboarding.contact_email if present)
      const { data: onb } = await admin
        .from("portal_onboarding")
        .select("contact_email")
        .eq("client_id", client.id)
        .maybeSingle();
      email = (onb as any)?.contact_email ?? null;
    }

    if (!email) {
      // Record a pending row so the agency can send the invite later.
      await admin.from("portal_users").insert({
        client_id: client.id,
        workspace_id: client.workspace_id,
        status: "pending_email",
      });
      return json({ ok: true, invited: false, reason: "no_email" });
    }

    // Invite via Supabase Auth (magic-link). Redirect to portal invite acceptor.
    const redirectTo = `${SUPABASE_URL.replace(".supabase.co", ".lovable.app")}/portal/accept`;
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo,
        data: {
          invited_to_client: client.id,
          workspace_id: client.workspace_id,
          portal_slug: client.portal_slug,
        },
      },
    );

    if (inviteErr && !String(inviteErr.message).toLowerCase().includes("already")) {
      return json({ error: inviteErr.message }, 500);
    }

    const userId = invited?.user?.id ?? null;
    await admin.from("portal_users").upsert(
      {
        user_id: userId,
        client_id: client.id,
        workspace_id: client.workspace_id,
        status: "invited",
      },
      { onConflict: "user_id,client_id" },
    );

    return json({ ok: true, invited: true, email });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
