// onboarding-drive-sync
// =====================
// Mirrors a client's onboarding assets into the per-client Google Drive folder
// via the n8n relay (apihub.gfunnel.com). Idempotent: assets that already have
// a drive_file_id are skipped. Failures are written back to client_media_assets
// with a human-readable error_message; never silently marked synced.
//
// EMM-branded folder structure on Drive (the n8n side enforces this):
//   EMM Clients/
//     {brand} — {short id}/
//       Images/  Voice/  Files/  Generated/
//
// Caller (JWT verified) must be either the client's portal user or a workspace
// writer for the client's workspace. The service-role client is used to update
// the asset rows after we get the Drive file id back.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const N8N_DRIVE_WEBHOOK = Deno.env.get("N8N_ONBOARDING_DRIVE_WEBHOOK") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function shortId(clientId: number) {
  return clientId.toString().padStart(4, "0");
}

function folderForKind(kind: string): string {
  if (kind === "image") return "Images";
  if (kind === "voice") return "Voice";
  if (kind === "logo") return "Files";
  return "Files";
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
    const clientId = Number(body?.client_id);
    if (!Number.isFinite(clientId)) return json({ error: "client_id required" }, 400);

    // Fetch the client + assets. We do this with the service role so we can
    // operate even if the caller is a portal user whose RLS scopes are tighter.
    // Authorization is enforced by checking the caller below.
    const { data: client, error: clientErr } = await admin
      .from("clients")
      .select("id, name, brand, workspace_id")
      .eq("id", clientId)
      .maybeSingle();
    if (clientErr) return json({ error: clientErr.message }, 500);
    if (!client) return json({ error: "Client not found" }, 404);
    if (!client.workspace_id) return json({ error: "Client has no workspace" }, 422);

    // Authorize: portal user for this client OR workspace writer.
    const [{ data: pu }, { data: wm }] = await Promise.all([
      admin.from("portal_users").select("id").eq("user_id", caller.id).eq("client_id", clientId).maybeSingle(),
      admin.from("workspace_members").select("role").eq("user_id", caller.id).eq("workspace_id", client.workspace_id).maybeSingle(),
    ]);
    const isPortalUser = !!pu;
    const isWriter = !!wm && ["owner", "admin", "member"].includes((wm as any).role);
    if (!isPortalUser && !isWriter) return json({ error: "Forbidden" }, 403);

    // Pull only assets that still need syncing (pending or failed).
    const { data: assets, error: assetsErr } = await admin
      .from("client_media_assets")
      .select("*")
      .eq("client_id", clientId)
      .in("drive_sync_status", ["pending", "failed"]);
    if (assetsErr) return json({ error: assetsErr.message }, 500);

    if (!assets || assets.length === 0) {
      return json({ ok: true, synced: 0, skipped: 0, message: "Nothing pending" });
    }

    if (!N8N_DRIVE_WEBHOOK) {
      // Mark every pending asset as failed with the actual reason. Admin view
      // surfaces this; user does NOT see silent success.
      await admin
        .from("client_media_assets")
        .update({
          drive_sync_status: "failed",
          error_message: "onboarding-drive-sync webhook not configured (N8N_ONBOARDING_DRIVE_WEBHOOK)",
        })
        .eq("client_id", clientId)
        .in("drive_sync_status", ["pending", "failed"]);
      return json({
        ok: false,
        error: "N8N_ONBOARDING_DRIVE_WEBHOOK is not set. Configure it and call retry_drive_sync.",
        marked_failed: assets.length,
      }, 503);
    }

    const driveFolderName = `${(client.brand || client.name || "client").toString()} — ${shortId(client.id)}`;

    let synced = 0;
    let failed = 0;

    for (const asset of assets) {
      try {
        // Skip if it somehow already has an id.
        if (asset.drive_file_id) {
          await admin
            .from("client_media_assets")
            .update({
              drive_sync_status: "synced",
              drive_synced_at: new Date().toISOString(),
              error_message: null,
            })
            .eq("id", asset.id);
          synced++;
          continue;
        }

        const { data: signed, error: signedErr } = await admin.storage
          .from(asset.storage_bucket || "client-onboarding")
          .createSignedUrl(asset.storage_path, 60 * 60);
        if (signedErr || !signed?.signedUrl) {
          throw new Error(signedErr?.message ?? "Could not sign storage URL");
        }

        const payload = {
          client_id: client.id,
          asset_id: asset.id,
          kind: asset.kind,
          brand: client.brand,
          name: client.name,
          drive_folder_name: driveFolderName,
          drive_subfolder: folderForKind(asset.kind),
          filename: asset.filename ?? `${asset.id}`,
          mime_type: asset.mime_type,
          byte_size: asset.byte_size,
          signed_url: signed.signedUrl,
        };

        const res = await fetch(N8N_DRIVE_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        let parsed: any = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { /* not JSON */ }

        if (!res.ok) throw new Error(parsed?.message ?? text ?? `Webhook HTTP ${res.status}`);
        const driveFileId = parsed?.drive_file_id ?? parsed?.fileId ?? parsed?.id;
        if (!driveFileId) throw new Error("Webhook did not return drive_file_id");

        await admin
          .from("client_media_assets")
          .update({
            drive_file_id: String(driveFileId),
            drive_sync_status: "synced",
            drive_synced_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", asset.id);
        synced++;
      } catch (err: any) {
        failed++;
        await admin
          .from("client_media_assets")
          .update({
            drive_sync_status: "failed",
            error_message: String(err?.message ?? err).slice(0, 1000),
          })
          .eq("id", asset.id);
      }
    }

    return json({ ok: failed === 0, synced, failed, total: assets.length });
  } catch (err: any) {
    return json({ error: err?.message ?? "Unknown error" }, 500);
  }
});
