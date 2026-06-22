import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Portal chat thread provisioner.
//
// Portal users are NOT workspace members, so RLS blocks them from creating
// conversations directly. This function (service role) finds-or-creates the
// caller's dedicated conversation for a given client and makes sure both the
// portal user and the client's point of contact are participants. Once that's
// done the portal UI talks to messages/conversations directly under the normal
// participant-based RLS.
//
// Flow: verify the caller -> resolve the client they're a portal user for ->
// resolve the point of contact (clients.point_of_contact_user_id, else the
// workspace owner) -> find-or-create one thread per (portal user, client) ->
// ensure participants -> return { conversation_id, point_of_contact }.

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
    const { data: userRes } = await userClient.auth.getUser();
    const caller = userRes?.user;
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const requestedClientId = body.client_id != null ? Number(body.client_id) : null;

    // Which client is this portal user allowed to chat for? Validate against
    // their portal_users mappings; prefer the requested client when valid.
    const { data: mappings, error: mapErr } = await admin
      .from("portal_users")
      .select("client_id, status, created_at")
      .eq("user_id", caller.id)
      .order("created_at", { ascending: true });
    if (mapErr) throw mapErr;
    if (!mappings || mappings.length === 0) {
      return json({ error: "No portal access for this account" }, 403);
    }

    const active = mappings.filter((m) => m.status === "active");
    const pool = active.length > 0 ? active : mappings;
    const chosen =
      (requestedClientId != null && pool.find((m) => m.client_id === requestedClientId)) ||
      pool[0];
    const clientId = chosen.client_id as number;

    // Client context: workspace + point of contact.
    const { data: client, error: clientErr } = await admin
      .from("clients")
      .select("id, name, workspace_id, point_of_contact_user_id")
      .eq("id", clientId)
      .maybeSingle();
    if (clientErr) throw clientErr;
    if (!client || !client.workspace_id) {
      return json({ error: "Client not found or not linked to a workspace" }, 404);
    }

    // Resolve point of contact: explicit field, else workspace owner, else any
    // admin/member. May be null if the workspace has no members yet.
    let poc: string | null = client.point_of_contact_user_id ?? null;
    if (!poc) {
      const { data: members } = await admin
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", client.workspace_id);
      const owner = (members ?? []).find((m) => m.role === "owner");
      const adminMember = (members ?? []).find((m) => m.role === "admin");
      const anyMember = (members ?? [])[0];
      poc = owner?.user_id ?? adminMember?.user_id ?? anyMember?.user_id ?? null;
    }

    // Find-or-create this portal user's dedicated thread for the client.
    const { data: existing } = await admin
      .from("conversations")
      .select("id")
      .eq("portal_user_id", caller.id)
      .eq("client_id", clientId)
      .maybeSingle();

    let conversationId = existing?.id as string | undefined;
    if (!conversationId) {
      const { data: conv, error: convErr } = await admin
        .from("conversations")
        .insert({
          workspace_id: client.workspace_id,
          subject: `Portal chat — ${client.name}`,
          created_by: caller.id,
          client_id: clientId,
          portal_user_id: caller.id,
        })
        .select("id")
        .single();
      if (convErr) throw convErr;
      conversationId = conv.id as string;
    }

    // Ensure participants: the portal user (always) and the point of contact.
    const participants: Array<{ conversation_id: string; user_id: string }> = [
      { conversation_id: conversationId, user_id: caller.id },
    ];
    if (poc && poc !== caller.id) {
      participants.push({ conversation_id: conversationId, user_id: poc });
    }
    const { error: partErr } = await admin
      .from("conversation_participants")
      .upsert(participants, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });
    if (partErr) throw partErr;

    return json({
      ok: true,
      conversation_id: conversationId,
      client_id: clientId,
      point_of_contact: poc,
    });
  } catch (e: any) {
    console.error("portal-chat", e);
    return json({ error: e?.message ?? "Server error" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
