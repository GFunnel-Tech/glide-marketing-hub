// Launches a Meta campaign end-to-end: Campaign -> AdSet -> Creative -> Ad.
// Body: { workspaceId, draftId, state }
// state = the full AdBuilderState JSON
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const META_VER = "v21.0";

function objectiveMap(obj: string): { objective: string; optimization_goal: string } {
  switch (obj) {
    case "leads": return { objective: "OUTCOME_LEADS", optimization_goal: "LEAD_GENERATION" };
    case "website": return { objective: "OUTCOME_TRAFFIC", optimization_goal: "LINK_CLICKS" };
    case "awareness": return { objective: "OUTCOME_AWARENESS", optimization_goal: "REACH" };
    case "messages": return { objective: "OUTCOME_ENGAGEMENT", optimization_goal: "CONVERSATIONS" };
    default: return { objective: "OUTCOME_TRAFFIC", optimization_goal: "LINK_CLICKS" };
  }
}

function specialCategoryMap(cat: string | string[] | null | undefined): string[] {
  if (!cat) return [];
  const arr = Array.isArray(cat) ? cat : String(cat).split(",");
  const map: Record<string, string> = { housing: "HOUSING", credit: "CREDIT", employment: "EMPLOYMENT" };
  return arr.map((c) => map[String(c).trim().toLowerCase()]).filter(Boolean);
}

// ---- Error humanization + retry ----------------------------------------

interface MetaErrorShape {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  type?: string;
  fbtrace_id?: string;
}

// Transient Meta error codes that are safe to retry.
// 1/2 = unknown/service, 4/17/32/613 = rate limits, 341 = app-level throttle,
// 368 = temporarily blocked, -1 = unknown.
const RETRYABLE_CODES = new Set([-1, 1, 2, 4, 17, 32, 341, 368, 613]);

function isRetryable(status: number, err?: MetaErrorShape) {
  if (status === 429 || status >= 500) return true;
  if (err?.code != null && RETRYABLE_CODES.has(err.code)) return true;
  return false;
}

function humanizeMetaError(step: string, err: MetaErrorShape | undefined, status: number): string {
  const userMsg = err?.error_user_msg?.trim();
  const baseMsg = err?.message?.trim();
  const code = err?.code;
  const sub = err?.error_subcode;

  // Specific, well-known cases first
  if (code === 190 || sub === 463 || sub === 460 || sub === 467) {
    return `${step}: Your Meta connection has expired. Please reconnect your Facebook account in Connected Accounts and try again.`;
  }
  if (code === 200 || code === 10 || code === 3 || code === 294) {
    return `${step}: Missing Meta permissions. Reconnect with ads_management, pages_manage_ads, pages_show_list, and leads_retrieval scopes.`;
  }
  if (code === 100 && /image|hash/i.test(baseMsg ?? "")) {
    return `${step}: One of your creative images couldn't be processed. Try a different image (JPG/PNG, under 30MB, at least 600px wide).`;
  }
  if (code === 100 && /privacy/i.test(baseMsg ?? "")) {
    return `${step}: Meta rejected the Privacy Policy URL. Make sure it's a public HTTPS link that loads without redirects.`;
  }
  if (code === 100 && /lead_gen_form|leadgen/i.test(baseMsg ?? "")) {
    return `${step}: The lead form was rejected. Check the form name (max 60 chars), questions, and thank-you message for restricted content.`;
  }
  if (code === 1885007 || /special ad category/i.test(baseMsg ?? "")) {
    return `${step}: Your targeting isn't allowed for this Special Ad Category. Remove detailed interests and narrow age/gender targeting.`;
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return `${step}: Meta is rate-limiting your account right now. We retried a few times — please wait a minute and try again.`;
  }
  if (status === 0) {
    return `${step}: Couldn't reach Meta. Check your internet connection and try again.`;
  }

  const friendly = userMsg || baseMsg || `Meta returned an unexpected error (HTTP ${status}).`;
  return `${step}: ${friendly}`;
}

async function metaFetch(
  step: string,
  url: string,
  init: RequestInit,
  { retries = 3, baseDelayMs = 800 }: { retries?: number; baseDelayMs?: number } = {},
): Promise<any> {
  let lastErr: { status: number; err?: MetaErrorShape } = { status: 0 };
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, init);
      let j: any = null;
      try { j = await r.json(); } catch { /* non-json */ }
      if (r.ok) return j ?? {};
      const err: MetaErrorShape | undefined = j?.error;
      lastErr = { status: r.status, err };
      console.warn(`[meta] ${step} failed (attempt ${attempt + 1}/${retries + 1}) status=${r.status} code=${err?.code} sub=${err?.error_subcode} msg=${err?.message}`);
      if (attempt < retries && isRetryable(r.status, err)) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }
      throw new Error(humanizeMetaError(step, err, r.status));
    } catch (e: any) {
      // Network / fetch-level error
      if (e?.message && e.message.startsWith(step + ":")) throw e; // already humanized
      console.warn(`[meta] ${step} network error (attempt ${attempt + 1}/${retries + 1})`, e?.message ?? e);
      if (attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }
      throw new Error(humanizeMetaError(step, lastErr.err, lastErr.status));
    }
  }
  throw new Error(humanizeMetaError(step, lastErr.err, lastErr.status));
}

async function metaPost(path: string, body: Record<string, any>, token: string, step = `POST ${path}`) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    params.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  params.set("access_token", token);
  return metaFetch(step, `https://graph.facebook.com/${META_VER}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
}

async function metaGet(path: string, token: string, extra: Record<string, string> = {}, step = `GET ${path}`) {
  const params = new URLSearchParams({ access_token: token, ...extra });
  return metaFetch(step, `https://graph.facebook.com/${META_VER}/${path}?${params.toString()}`, { method: "GET" });
}

async function getPageAccessToken(pageId: string, userToken: string): Promise<string> {
  const j = await metaGet(`${pageId}`, userToken, { fields: "access_token" }, "Fetching Page access token");
  if (!j.access_token) throw new Error("Fetching Page access token: We couldn't get permission for your Facebook Page. Reconnect Meta with pages_manage_ads, pages_show_list, and leads_retrieval scopes.");
  return j.access_token;
}

function mapLeadQuestion(q: { type: string; label: string; options?: string[] }) {
  switch (q.type) {
    case "FULL_NAME": return { type: "FULL_NAME" };
    case "EMAIL": return { type: "EMAIL" };
    case "PHONE": return { type: "PHONE" };
    case "MULTIPLE_CHOICE":
      return { type: "CUSTOM", key: q.label.toLowerCase().replace(/\s+/g, "_").slice(0, 60), label: q.label, options: (q.options ?? []).map((o) => ({ value: o, key: o.toLowerCase().replace(/\s+/g, "_").slice(0, 60) })) };
    default:
      return { type: "CUSTOM", key: q.label.toLowerCase().replace(/\s+/g, "_").slice(0, 60) || "custom", label: q.label, input_type: "SHORT_ANSWER" };
  }
}

async function createLeadGenForm(pageId: string, pageToken: string, lf: any): Promise<string> {
  if (!lf?.privacyUrl) throw new Error("Creating lead form: A Privacy Policy URL is required. Add one in the Lead Form section.");
  const questions = (lf.questions ?? []).map(mapLeadQuestion);
  if (questions.length === 0) throw new Error("Creating lead form: Add at least one question before launching.");
  const body: Record<string, any> = {
    name: lf.name || "Lead Form",
    follow_up_action_url: lf.followUpUrl || lf.privacyUrl,
    privacy_policy: { url: lf.privacyUrl, link_text: "Privacy Policy" },
    questions,
    locale: "en_US",
    context_card: lf.intro ? { title: lf.name || "Learn more", content: [lf.intro], style: "PARAGRAPH_STYLE", button_text: "Continue" } : undefined,
    thank_you_page: { title: "Thanks!", body: lf.thankYou || "We'll be in touch shortly.", button_type: "VIEW_WEBSITE", website_url: lf.privacyUrl, button_text: "View website" },
  };
  const r = await metaPost(`${pageId}/leadgen_forms`, body, pageToken, "Creating lead form");
  if (!r.id) throw new Error("Creating lead form: Meta accepted the request but returned no form ID. Try again.");
  return r.id as string;
}

async function uploadImageFromUrl(actId: string, imageUrl: string, token: string): Promise<string> {
  const r = await metaPost(`${actId}/adimages`, { url: imageUrl }, token, "Uploading creative image");
  const images = r.images || {};
  const first: any = Object.values(images)[0];
  if (!first?.hash) throw new Error("Uploading creative image: Meta accepted the image but didn't return a reference. Try a different image.");
  return first.hash;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const { workspaceId, draftId, state } = await req.json();
    if (!workspaceId || !state) return json({ error: "workspaceId, state required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: conn } = await admin.from("meta_connections")
      .select("access_token").eq("workspace_id", workspaceId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!conn) return json({ error: "No active Meta connection" }, 400);
    const token = conn.access_token;

    const actId = state.adAccountId;
    if (!actId) return json({ error: "Ad account not selected" }, 400);
    const pageId = state.pageId;
    if (!pageId) return json({ error: "Facebook Page not selected" }, 400);

    if (draftId) {
      await admin.from("ad_drafts").update({ status: "launching", launch_error: null }).eq("id", draftId);
    }

    const log = await admin.from("ad_action_log").insert({
      workspace_id: workspaceId, channel: "meta", action: "launch_campaign",
      performed_by: userData.user.id, status: "pending",
      meta: { objective: state.objective, special: state.specialAdCategory, draftId },
    }).select("id").single();

    try {
      const { objective, optimization_goal } = objectiveMap(state.objective);
      const specialCategories = specialCategoryMap(state.specialAdCategory);

      // 1. Campaign
      const campaign = await metaPost(`${actId}/campaigns`, {
        name: state.campaignName || `${state.objective} campaign`,
        objective,
        status: "PAUSED",
        special_ad_categories: specialCategories,
      }, token, "Creating campaign");

      // 2. Ad Set
      const optimizeForMe = !!state.optimizeForMe;
      const targeting: any = {
        geo_locations: { countries: state.countries },
      };
      // Advantage+ Placements: omit publisher_platforms so Meta chooses; Manual: pin FB+IG
      if (!optimizeForMe && state.placements !== "advantage_plus") {
        targeting.publisher_platforms = ["facebook", "instagram"];
      }
      if (specialCategories.length === 0) {
        targeting.age_min = state.ageMin;
        targeting.age_max = state.ageMax;
        if (state.genders?.length && !state.genders.includes("all")) {
          targeting.genders = state.genders.includes("male") ? [1] : state.genders.includes("female") ? [2] : undefined;
        }
      }
      if (state.interests?.length) {
        targeting.flexible_spec = [{ interests: state.interests.map((i: any) => ({ id: i.id, name: i.name })) }];
      }
      if (optimizeForMe || state.placements === "advantage_plus") {
        targeting.targeting_automation = { advantage_audience: 1 };
      }

      const adsetBody: any = {
        name: `${state.campaignName || "Ad Set"} – Ad Set 1`,
        campaign_id: campaign.id,
        status: "PAUSED",
        optimization_goal,
        billing_event: state.objective === "awareness" ? "IMPRESSIONS" : "LINK_CLICKS",
        targeting,
      };
      if (state.budgetType === "daily") adsetBody.daily_budget = Math.round(state.budgetAmount * 100);
      else adsetBody.lifetime_budget = Math.round(state.budgetAmount * 100);

      if (state.objective === "leads") adsetBody.destination_type = "ON_AD";
      const adset = await metaPost(`${actId}/adsets`, adsetBody, token, "Creating ad set");

      // 3. Upload images & build creative
      const allImages = [...(state.media ?? []), ...(state.bankImages ?? [])].filter((m: any) => m.type === "image");
      const imageHashes: string[] = [];
      for (const img of allImages) {
        try {
          const h = await uploadImageFromUrl(actId, img.url, token);
          imageHashes.push(h);
        } catch (e) {
          console.error("image upload failed", e);
        }
      }
      if (imageHashes.length === 0) throw new Error("Uploading creative image: None of your images could be uploaded to Meta. Try a different image (JPG/PNG, under 30MB, at least 600px wide).");

      const linkUrl = state.websiteUrl || `https://facebook.com/${pageId}`;
      const utm = state.utmParameters ? `?${state.utmParameters}` : "";
      const allTexts = [...(state.primaryTexts ?? []).filter(Boolean), ...(state.bankCopy ?? [])];
      const allHeadlines = (state.headlines ?? []).filter(Boolean);

      // For Leads objective: create (or reuse) a leadgen form and build a link_data creative
      // attached to that form. asset_feed_spec doesn't support lead_gen_form_id reliably.
      const createdAdIds: string[] = [];
      let creative: any = null;
      let leadFormId: string | null = null;

      if (state.objective === "leads") {
        const pageToken = await getPageAccessToken(pageId, token);
        if (state.leadForm?.mode === "existing" && state.leadForm?.existingFormId) {
          leadFormId = state.leadForm.existingFormId;
        } else {
          leadFormId = await createLeadGenForm(pageId, pageToken, state.leadForm);
        }

        // When Optimize For Me is on, rotate creatives: one ad per (image × text) combo (cap 5).
        const rotate = optimizeForMe;
        const imgList = rotate ? imageHashes.slice(0, 5) : imageHashes.slice(0, 1);
        const textList = rotate && allTexts.length > 1 ? allTexts.slice(0, 5) : [allTexts[0] || "Learn more about our offer."];

        for (let i = 0; i < imgList.length; i++) {
          const message = textList[i % textList.length];
          const cBody = {
            name: `${state.campaignName || "Creative"} – v${i + 1} – ${Date.now()}`,
            object_story_spec: {
              page_id: pageId,
              instagram_actor_id: state.igAccountId || undefined,
              link_data: {
                image_hash: imgList[i],
                link: `https://fb.me/${leadFormId}`,
                message,
                name: allHeadlines[i % Math.max(1, allHeadlines.length)] || undefined,
                description: state.description || undefined,
                call_to_action: {
                  type: state.cta || "SIGN_UP",
                  value: { lead_gen_form_id: leadFormId },
                },
              },
            },
          };
          const c = await metaPost(`${actId}/adcreatives`, cBody, token, "Creating ad creative");
          const a = await metaPost(`${actId}/ads`, {
            name: `${state.campaignName || "Ad"} – v${i + 1}`,
            adset_id: adset.id,
            creative: { creative_id: c.id },
            status: "PAUSED",
          }, token, "Creating ad");
          createdAdIds.push(a.id);
          if (!creative) creative = c;
        }
      } else {
        const asset_feed_spec: any = {
          images: imageHashes.map((h) => ({ hash: h })),
          bodies: allTexts.length ? allTexts.map((t: string) => ({ text: t })) : [{ text: "Learn more about our offer." }],
          titles: allHeadlines.length ? allHeadlines.map((t: string) => ({ text: t })) : undefined,
          descriptions: state.description ? [{ text: state.description }] : undefined,
          link_urls: [{ website_url: linkUrl + utm, display_url: state.displayLink || undefined }],
          call_to_action_types: [state.cta || "LEARN_MORE"],
          ad_formats: ["SINGLE_IMAGE"],
        };
        const creativeBody = {
          name: `${state.campaignName || "Creative"} – ${Date.now()}`,
          object_story_spec: { page_id: pageId, instagram_actor_id: state.igAccountId || undefined },
          asset_feed_spec,
        };
        creative = await metaPost(`${actId}/adcreatives`, creativeBody, token, "Creating ad creative");
        const a = await metaPost(`${actId}/ads`, {
          name: `${state.campaignName || "Ad"} – Ad 1`,
          adset_id: adset.id,
          creative: { creative_id: creative.id },
          status: "PAUSED",
        }, token, "Creating ad");
        createdAdIds.push(a.id);
      }
      const primaryAdId = createdAdIds[0];

      // Update draft
      if (draftId) {
        await admin.from("ad_drafts").update({
          status: "launched",
          meta_campaign_id: campaign.id,
          meta_adset_id: adset.id,
          meta_ad_id: primaryAdId,
        }).eq("id", draftId);
      }

      await admin.from("ad_action_log").update({
        status: "success", result_object_id: primaryAdId,
        meta: { campaign_id: campaign.id, adset_id: adset.id, creative_id: creative?.id, ad_ids: createdAdIds, lead_form_id: leadFormId, optimize_for_me: optimizeForMe },
      }).eq("id", log.data!.id);

      return json({ ok: true, campaignId: campaign.id, adsetId: adset.id, adId: primaryAdId, adIds: createdAdIds, leadFormId });
    } catch (e: any) {
      if (draftId) await admin.from("ad_drafts").update({ status: "failed", launch_error: e.message }).eq("id", draftId);
      await admin.from("ad_action_log").update({ status: "failed", error_message: e.message }).eq("id", log.data!.id);
      return json({ error: e.message }, 400);
    }
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});
