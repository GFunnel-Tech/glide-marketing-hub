// Store a client audit artifact (ZIP or PDF) uploaded from the frontend.
// Accepts multipart/form-data with fields: clientId (number), kind (optional, default audit_zip),
// audience (optional, default agency), file (binary blob).
// Returns { ok, path, signedUrl, artifactId }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function sanitizeKind(kind: string | null): string {
  const k = String(kind ?? "audit_zip").toLowerCase();
  return ["audit_zip", "audit_pdf"].includes(k) ? k : "audit_zip";
}

function sanitizeAudience(audience: string | null): string {
  const a = String(audience ?? "agency").toLowerCase();
  return a === "client" ? "client" : "agency";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Missing auth" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    // Parse form
    const form = await req.formData().catch(() => null);
    if (!form) return json({ error: "Expected multipart/form-data" }, 400);

    const clientId = Number(form.get("clientId"));
    if (!Number.isFinite(clientId)) return json({ error: "clientId required" }, 400);

    const kind = sanitizeKind(form.get("kind") as string | null);
    const audience = sanitizeAudience(form.get("audience") as string | null);
    const file = form.get("file");
    if (!file || !(file instanceof File)) return json({ error: "file required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: client } = await admin.from("clients").select("workspace_id,name,brand")
      .eq("id", clientId).maybeSingle();
    if (!client) return json({ error: "client not found" }, 404);

    // Authorization: workspace member or super admin
    const { data: member } = await admin.from("workspace_members")
      .select("user_id").eq("workspace_id", client.workspace_id).eq("user_id", user.id).maybeSingle();
    const { data: sa } = await admin.rpc("is_super_admin", { _user_id: user.id });
    if (!member && !sa) return json({ error: "forbidden" }, 403);

    const stamp = new Date().toISOString().slice(0, 10);
    const ext = kind === "audit_pdf" ? "pdf" : "zip";
    const prefix = audience === "client" ? "review" : "audit";
    const fileName = `${prefix}_${kind}_${stamp}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const path = `${client.workspace_id}/${clientId}/${fileName}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const up = await admin.storage.from("client-reports")
      .upload(path, bytes, { contentType: ext === "pdf" ? "application/pdf" : "application/zip", upsert: true });
    if (up.error) return json({ error: `Storage upload failed: ${up.error.message}` }, 500);

    const { data: signed } = await admin.storage.from("client-reports")
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    const { data: inserted, error: dbErr } = await admin.from("client_audit_artifacts")
      .insert({
        workspace_id: client.workspace_id,
        client_id: clientId,
        kind,
        audience,
        storage_path: path,
        file_name: fileName,
        is_permanent: false,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (dbErr) return json({ error: `Database insert failed: ${dbErr.message}` }, 500);

    return json({ ok: true, path, signedUrl: signed?.signedUrl ?? null, artifactId: inserted.id });
  } catch (e) {
    console.error("[client-audit-store]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
