// ai-creative-generate
// ====================
// Generates ad creative images with Lovable AI and stores them in the
// `ad-creatives` bucket so they can be attached to an ad draft directly.
//
// POST { workspaceId: string, prompt: string, aspect?: "1:1"|"4:5"|"9:16"|"1.91:1", n?: number }
// -> { images: [{ url, path }] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const ASPECT_HINT: Record<string, string> = {
  "1:1": "square 1:1 composition",
  "4:5": "vertical 4:5 portrait composition",
  "9:16": "tall 9:16 vertical story composition",
  "1.91:1": "wide 1.91:1 landscape composition",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured for this project" }, 500);

    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: userRes } = await userClient.auth.getUser();
    const caller = userRes?.user;
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const aspect = typeof body.aspect === "string" && ASPECT_HINT[body.aspect] ? body.aspect : "1:1";
    const n = Math.min(Math.max(Number(body.n) || 1, 1), 4);

    if (!workspaceId) return json({ error: "workspaceId is required" }, 400);
    if (prompt.length < 3) return json({ error: "Describe the creative you want (at least 3 characters)" }, 400);
    if (prompt.length > 2000) return json({ error: "Prompt is too long (max 2000 characters)" }, 400);

    // Caller must be a member of the workspace.
    const { data: member, error: memberErr } = await userClient
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", caller.id)
      .maybeSingle();
    if (memberErr) console.error("membership check failed", memberErr.message);
    if (!member) return json({ error: "You don't have access to this workspace" }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const fullPrompt =
      `High-converting social media advertising creative. ${prompt}. ` +
      `${ASPECT_HINT[aspect]}. Clean, professional, high contrast, uncluttered, ` +
      `leave visual breathing room so ad copy can be overlaid. No watermarks, no lorem ipsum.`;

    const images: { url: string; path: string }[] = [];
    const errors: string[] = [];

    for (let i = 0; i < n; i++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image",
          messages: [{ role: "user", content: fullPrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`AI gateway failed [${res.status}]: ${text}`);
        if (res.status === 429) return json({ error: "Rate limited. Try again in a moment." }, 429);
        if (res.status === 402) return json({ error: "AI credits exhausted. Add credits to continue." }, 402);
        errors.push(text || `HTTP ${res.status}`);
        continue;
      }

      const payload = await res.json();
      const b64 = payload?.data?.[0]?.b64_json;
      if (!b64) {
        console.error("No image in AI response", JSON.stringify(payload).slice(0, 500));
        errors.push("Model returned no image");
        continue;
      }

      const path = `${workspaceId}/ai/${crypto.randomUUID()}.png`;
      const { error: upErr } = await admin.storage
        .from("ad-creatives")
        .upload(path, b64ToBytes(b64), { contentType: "image/png", upsert: false });
      if (upErr) {
        console.error("upload failed", upErr.message);
        errors.push(upErr.message);
        continue;
      }
      const { data: pub } = admin.storage.from("ad-creatives").getPublicUrl(path);
      images.push({ url: pub.publicUrl, path });
    }

    if (images.length === 0) {
      return json({ error: errors[0] || "Image generation failed" }, 502);
    }
    return json({ images, partialErrors: errors });
  } catch (e) {
    console.error("ai-creative-generate error", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
