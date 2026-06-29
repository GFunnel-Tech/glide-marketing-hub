// onboarding-process-stage
// =========================
// Admin-side gate that prepares a client's image set + voice asset for the
// downstream pipeline (ElevenLabs voice clone, Higgsfield avatar). Per F5 the
// MVP STAGES — it does not generate. It:
//   1. Confirms a voice_likeness consent row exists.
//   2. Marks image + voice assets as `ready_for_processing` (skips ones
//      already processed/processing).
//   3. Returns time-limited signed URLs the downstream worker can pull.
//   4. (Optional) If ELEVENLABS_API_KEY / HIGGSFIELD_API_KEY are present AND
//      the caller passed { auto_process: true }, the function does NOT call
//      them in this MVP — wiring is intentionally left to the pipeline.
//      The returned IDs (elevenlabs_voice_id, higgsfield_character_id) are
//      written back via PATCH /client_media_assets/{id} (see write-back
//      mode below).
//
// Two operation modes selected by `mode`:
//   - mode = "stage"        : (default) the above.
//   - mode = "write_back"   : caller (with workspace-writer or service-role
//                             JWT) updates an asset's returned IDs and flips
//                             processing_status to 'processed'. Used by the
//                             downstream pipeline to report results.
//
// Authorization: workspace writers for the client's workspace. Portal users
// CANNOT call this endpoint.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

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
    const mode = (body?.mode as string) ?? "stage";

    if (mode === "stage") {
      const clientId = Number(body?.client_id);
      if (!Number.isFinite(clientId)) return json({ error: "client_id required" }, 400);

      const { data: client } = await admin
        .from("clients")
        .select("id, workspace_id, name, brand")
        .eq("id", clientId)
        .maybeSingle();
      if (!client) return json({ error: "Client not found" }, 404);
      if (!client.workspace_id) return json({ error: "Client has no workspace" }, 422);

      const { data: wm } = await admin
        .from("workspace_members")
        .select("role")
        .eq("user_id", caller.id)
        .eq("workspace_id", client.workspace_id)
        .maybeSingle();
      if (!wm || !["owner", "admin", "member"].includes((wm as any).role)) {
        return json({ error: "Forbidden — workspace writer required" }, 403);
      }

      const { data: consent } = await admin
        .from("client_consents")
        .select("id")
        .eq("client_id", clientId)
        .eq("consent_type", "voice_likeness")
        .limit(1)
        .maybeSingle();
      if (!consent) {
        return json({ error: "No voice_likeness consent on file — cannot stage" }, 412);
      }

      const { data: assets } = await admin
        .from("client_media_assets")
        .select("*")
        .eq("client_id", clientId)
        .in("kind", ["image", "voice"]);

      if (!assets || assets.length === 0) {
        return json({ ok: false, error: "No image/voice assets to stage" }, 422);
      }

      const updates: { id: string; signed_url: string | null; ready: boolean }[] = [];
      for (const a of assets) {
        // Don't re-mark already-processed or in-flight ones.
        if (a.processing_status === "processed" || a.processing_status === "processing") {
          updates.push({ id: a.id, signed_url: null, ready: false });
          continue;
        }
        const { data: signed } = await admin.storage
          .from(a.storage_bucket || "client-onboarding")
          .createSignedUrl(a.storage_path, 60 * 60 * 2); // 2h
        updates.push({ id: a.id, signed_url: signed?.signedUrl ?? null, ready: true });
      }

      const toMark = updates.filter((u) => u.ready).map((u) => u.id);
      if (toMark.length > 0) {
        await admin
          .from("client_media_assets")
          .update({
            processing_status: "ready_for_processing",
            error_message: null,
          })
          .in("id", toMark);
      }

      const items = assets.map((a) => {
        const upd = updates.find((u) => u.id === a.id)!;
        return {
          id: a.id,
          kind: a.kind,
          filename: a.filename,
          mime_type: a.mime_type,
          duration_seconds: a.duration_seconds,
          width: a.width,
          height: a.height,
          drive_file_id: a.drive_file_id,
          processing_status: upd.ready ? "ready_for_processing" : a.processing_status,
          signed_url: upd.signed_url,
        };
      });

      const elevenlabsConfigured = !!Deno.env.get("ELEVENLABS_API_KEY");
      const higgsfieldConfigured = !!Deno.env.get("HIGGSFIELD_API_KEY");

      return json({
        ok: true,
        client_id: clientId,
        staged_count: toMark.length,
        items,
        downstream: { elevenlabs_configured: elevenlabsConfigured, higgsfield_configured: higgsfieldConfigured },
      });
    }

    if (mode === "write_back") {
      // Pipeline worker reports back the returned IDs from ElevenLabs /
      // Higgsfield. Caller must still be a workspace writer for the asset's
      // workspace; downstream workers should use a service-role-token caller
      // or a dedicated writer service account.
      const assetId = body?.asset_id as string | undefined;
      const elevenlabsVoiceId = body?.elevenlabs_voice_id as string | undefined;
      const higgsfieldCharacterId = body?.higgsfield_character_id as string | undefined;
      const errorMessage = body?.error_message as string | undefined;
      if (!assetId) return json({ error: "asset_id required" }, 400);

      const { data: asset } = await admin
        .from("client_media_assets")
        .select("id, workspace_id, client_id")
        .eq("id", assetId)
        .maybeSingle();
      if (!asset) return json({ error: "Asset not found" }, 404);

      const { data: wm } = await admin
        .from("workspace_members")
        .select("role")
        .eq("user_id", caller.id)
        .eq("workspace_id", asset.workspace_id)
        .maybeSingle();
      if (!wm || !["owner", "admin", "member"].includes((wm as any).role)) {
        return json({ error: "Forbidden — workspace writer required" }, 403);
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (errorMessage) {
        patch.processing_status = "failed";
        patch.error_message = errorMessage.slice(0, 1000);
      } else {
        patch.processing_status = "processed";
        patch.error_message = null;
        if (elevenlabsVoiceId) patch.elevenlabs_voice_id = elevenlabsVoiceId;
        if (higgsfieldCharacterId) patch.higgsfield_character_id = higgsfieldCharacterId;
      }

      const { error } = await admin
        .from("client_media_assets")
        .update(patch)
        .eq("id", assetId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, asset_id: assetId });
    }

    return json({ error: `Unknown mode: ${mode}` }, 400);
  } catch (err: any) {
    return json({ error: err?.message ?? "Unknown error" }, 500);
  }
});
