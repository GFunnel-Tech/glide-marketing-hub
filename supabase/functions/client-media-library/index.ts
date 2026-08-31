// Unified client media library: GHL sub-account media library + Meta ad account
// library (adimages / advideos) + Glide Media-stored client assets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GRAPH = "https://graph.facebook.com/v20.0";

interface LibraryItem {
  id: string;
  source: "ghl" | "meta" | "metahub";
  type: "image" | "video";
  name: string;
  url: string;
  thumbnail?: string;
  createdAt?: string;
  meta?: Record<string, unknown>;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isVideoName(name: string, mime?: string) {
  if (mime?.startsWith("video/")) return true;
  return /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(name || "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const {
      action = "list",
      workspaceId,
      clientId,
      sources = ["ghl", "meta", "metahub"],
      query = "",
      limit = 100,
      assets = [],
    } = body as {
      action?: "list" | "import";
      workspaceId?: string;
      clientId?: number;
      sources?: string[];
      query?: string;
      limit?: number;
      assets?: { url: string; name?: string; type?: "image" | "video" }[];
    };

    if (!workspaceId) return json({ error: "workspaceId is required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Access check: workspace member or super admin
    const { data: member } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!member) {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
      const isSuper = (roles ?? []).some((r: { role: string }) => r.role === "super_admin");
      if (!isSuper) return json({ error: "Not a workspace member" }, 403);
    }

    // ---------- Import remote media into Glide Media storage (CORS-safe for the editor) ----------
    if (action === "import") {
      if (!Array.isArray(assets) || assets.length === 0) {
        return json({ error: "assets[] is required for import" }, 400);
      }
      const imported: { url: string; name: string; type: "image" | "video" }[] = [];
      const failures: { url: string; message: string }[] = [];
      for (const asset of assets.slice(0, 20)) {
        try {
          const res = await fetch(asset.url);
          if (!res.ok) throw new Error(`Download failed (${res.status})`);
          const blob = await res.blob();
          const contentType = res.headers.get("content-type") || blob.type || "application/octet-stream";
          const safeName = (asset.name || "media").replace(/[^\w.\-]+/g, "_").slice(-80);
          const path = `${workspaceId}/library/${crypto.randomUUID()}-${safeName}`;
          const { error: upErr } = await admin.storage
            .from("ad-creatives")
            .upload(path, blob, { contentType, upsert: false });
          if (upErr) throw new Error(upErr.message);
          const { data: pub } = admin.storage.from("ad-creatives").getPublicUrl(path);
          imported.push({
            url: pub.publicUrl,
            name: asset.name || safeName,
            type: asset.type ?? (contentType.startsWith("video/") ? "video" : "image"),
          });
        } catch (e) {
          failures.push({ url: asset.url, message: e instanceof Error ? e.message : String(e) });
        }
      }
      return json({ imported, failures });
    }

    const items: LibraryItem[] = [];
    const errors: { source: string; message: string }[] = [];


    // ---------- GHL media library ----------
    if (sources.includes("ghl") && clientId) {
      try {
        const { data: client } = await admin
          .from("clients")
          .select("ghl_location_id")
          .eq("id", clientId)
          .maybeSingle();

        const locationId = client?.ghl_location_id;
        if (!locationId) throw new Error("This client has no GHL sub-account mapped.");

        const { data: loc } = await admin
          .from("ghl_locations")
          .select("location_api_key")
          .eq("workspace_id", workspaceId)
          .eq("location_id", locationId)
          .maybeSingle();

        let token = loc?.location_api_key?.trim();
        if (!token) {
          const { data: cfg } = await admin
            .from("integration_configs")
            .select("ghl_api_key")
            .eq("workspace_id", workspaceId)
            .maybeSingle();
          token = cfg?.ghl_api_key?.trim();
        }
        if (!token) throw new Error("No GHL token configured. Add a Private Integration Token in Settings → Integrations.");

        const params = new URLSearchParams({
          altType: "location",
          altId: locationId,
          limit: String(Math.min(limit, 100)),
          offset: "0",
          sortBy: "createdAt",
          sortOrder: "desc",
        });
        if (query) params.set("query", query);

        const res = await fetch(`${GHL_BASE}/medias/files?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Version: "2021-07-28",
            Accept: "application/json",
          },
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.message || payload?.error || `GHL media API ${res.status}`);
        }
        const files = payload?.files ?? payload?.data ?? [];
        for (const f of files) {
          if (f?.type === "folder" || !f?.url) continue;
          const name = f.name ?? f.altId ?? "file";
          items.push({
            id: `ghl:${f._id ?? f.id ?? f.url}`,
            source: "ghl",
            type: isVideoName(name, f.mimeType) ? "video" : "image",
            name,
            url: f.url,
            thumbnail: f.thumbnailUrl ?? (isVideoName(name, f.mimeType) ? undefined : f.url),
            createdAt: f.createdAt,
            meta: { path: f.path, parentId: f.parentId },
          });
        }
      } catch (e) {
        errors.push({ source: "ghl", message: e instanceof Error ? e.message : String(e) });
      }
    }

    // ---------- Meta ad account library ----------
    if (sources.includes("meta") && clientId) {
      try {
        let actId: string | null = null;
        let connectionId: string | null = null;

        const { data: direct } = await admin
          .from("meta_ad_accounts")
          .select("act_id, connection_id")
          .eq("workspace_id", workspaceId)
          .eq("client_id", clientId)
          .eq("is_active", true)
          .limit(1);
        if (direct?.length) {
          actId = direct[0].act_id;
          connectionId = direct[0].connection_id;
        } else {
          const { data: mapped } = await admin
            .from("meta_ad_account_clients")
            .select("ad_account_id")
            .eq("workspace_id", workspaceId)
            .eq("client_id", clientId)
            .limit(1);
          if (mapped?.length) {
            const { data: acct } = await admin
              .from("meta_ad_accounts")
              .select("act_id, connection_id")
              .eq("id", mapped[0].ad_account_id)
              .maybeSingle();
            actId = acct?.act_id ?? null;
            connectionId = acct?.connection_id ?? null;
          }
        }

        if (!actId) throw new Error("This client has no Meta ad account mapped.");

        const { data: conn } = await admin
          .from("meta_connections")
          .select("access_token, status")
          .eq("id", connectionId)
          .maybeSingle();
        const token = conn?.access_token;
        if (!token) throw new Error("No healthy Meta connection for this client.");

        const act = actId.startsWith("act_") ? actId : `act_${actId}`;
        const cap = Math.min(limit, 100);

        const [imgRes, vidRes] = await Promise.all([
          fetch(`${GRAPH}/${act}/adimages?fields=hash,name,url,permalink_url,created_time,width,height&limit=${cap}&access_token=${token}`),
          fetch(`${GRAPH}/${act}/advideos?fields=id,title,source,picture,created_time&limit=${cap}&access_token=${token}`),
        ]);
        const imgJson = await imgRes.json().catch(() => ({}));
        const vidJson = await vidRes.json().catch(() => ({}));

        if (imgJson?.error && vidJson?.error) {
          throw new Error(imgJson.error?.message || "Meta library request failed");
        }
        for (const img of imgJson?.data ?? []) {
          if (!img.url) continue;
          items.push({
            id: `meta:img:${img.hash}`,
            source: "meta",
            type: "image",
            name: img.name || "Meta image",
            url: img.url,
            thumbnail: img.url,
            createdAt: img.created_time,
            meta: { hash: img.hash, width: img.width, height: img.height },
          });
        }
        for (const v of vidJson?.data ?? []) {
          items.push({
            id: `meta:vid:${v.id}`,
            source: "meta",
            type: "video",
            name: v.title || "Meta video",
            url: v.source ?? "",
            thumbnail: v.picture,
            createdAt: v.created_time,
            meta: { videoId: v.id },
          });
        }
      } catch (e) {
        errors.push({ source: "meta", message: e instanceof Error ? e.message : String(e) });
      }
    }

    // ---------- Glide Media stored assets ----------
    if (sources.includes("metahub")) {
      try {
        let q = admin
          .from("client_media_assets")
          .select("id, filename, mime_type, storage_bucket, storage_path, kind, created_at, client_id")
          .eq("workspace_id", workspaceId)
          .in("kind", ["image", "logo", "file"])
          .order("created_at", { ascending: false })
          .limit(Math.min(limit, 100));
        if (clientId) q = q.eq("client_id", clientId);
        const { data: assets } = await q;

        for (const a of assets ?? []) {
          if (!a.storage_path) continue;
          const bucket = a.storage_bucket || "client-onboarding";
          const { data: signed } = await admin.storage.from(bucket).createSignedUrl(a.storage_path, 60 * 60 * 6);
          if (!signed?.signedUrl) continue;
          items.push({
            id: `metahub:${a.id}`,
            source: "metahub",
            type: isVideoName(a.filename ?? "", a.mime_type ?? undefined) ? "video" : "image",
            name: a.filename ?? "Asset",
            url: signed.signedUrl,
            thumbnail: signed.signedUrl,
            createdAt: a.created_at,
          });
        }
      } catch (e) {
        errors.push({ source: "metahub", message: e instanceof Error ? e.message : String(e) });
      }
    }

    const needle = query.trim().toLowerCase();
    const filtered = needle ? items.filter((i) => i.name.toLowerCase().includes(needle)) : items;

    return json({ items: filtered, errors });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
