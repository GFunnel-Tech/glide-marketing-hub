// Remove expired, non-permanent audit artifacts from storage and the database.
// Can be invoked by a cron job (service role) or manually by an admin.
// Body: { dryRun?: boolean }
// Returns { deleted: number, errors: string[] }.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Authorize: service key, or super admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const isService = authHeader === `Bearer ${SERVICE_KEY}`;
    let isAdmin = false;
    if (!isService && authHeader) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: sa } = await admin.rpc("is_super_admin", { _user_id: user.id });
        isAdmin = !!sa;
      }
    }
    if (!isService && !isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    const { data: rows, error: findErr } = await admin
      .from("client_audit_artifacts")
      .select("id,storage_path")
      .eq("is_permanent", false)
      .lte("expires_at", new Date().toISOString());
    if (findErr) return json({ error: findErr.message }, 500);

    const paths = (rows ?? []).map((r: any) => r.storage_path).filter(Boolean);
    const ids = (rows ?? []).map((r: any) => r.id);

    const errors: string[] = [];

    if (!dryRun && paths.length) {
      const { error: storageErr } = await admin.storage.from("client-reports").remove(paths);
      if (storageErr) errors.push(`storage remove: ${storageErr.message}`);
    }

    if (!dryRun && ids.length) {
      const { error: dbErr } = await admin.from("client_audit_artifacts").delete().in("id", ids);
      if (dbErr) errors.push(`db delete: ${dbErr.message}`);
    }

    return json({
      ok: true,
      dryRun,
      deleted: ids.length,
      errors,
    });
  } catch (e) {
    console.error("[cleanup-audit-artifacts]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
