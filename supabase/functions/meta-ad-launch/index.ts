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

function specialCategoryMap(cat: string | null): string[] {
  if (!cat) return [];
  if (cat === "housing") return ["HOUSING"];
  if (cat === "credit") return ["CREDIT"];
  if (cat === "employment") return ["EMPLOYMENT"];
  return [];
}

async function metaPost(path: string, body: Record<string, any>, token: string) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    params.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  params.set("access_token", token);
  const r = await fetch(`https://graph.facebook.com/${META_VER}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `Meta ${path} error`);
  return j;
}

async function uploadImageFromUrl(actId: string, imageUrl: string, token: string): Promise<string> {
  // Meta /adimages accepts a `url` parameter to fetch the image server-side.
  const r = await metaPost(`${actId}/adimages`, { url: imageUrl }, token);
  const images = r.images || {};
  const first: any = Object.values(images)[0];
  if (!first?.hash) throw new Error("Image upload returned no hash");
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
      }, token);

      // 2. Ad Set
      const targeting: any = {
        geo_locations: { countries: state.countries },
        publisher_platforms: ["facebook", "instagram"],
      };
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
      if (state.placements === "advantage_plus") {
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
      const adset = await metaPost(`${actId}/adsets`, adsetBody, token);

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
      if (imageHashes.length === 0) throw new Error("No images uploaded successfully. Add at least one image creative.");

      const linkUrl = state.websiteUrl || `https://facebook.com/${pageId}`;
      const utm = state.utmParameters ? `?${state.utmParameters}` : "";
      const allTexts = [...(state.primaryTexts ?? []).filter(Boolean), ...(state.bankCopy ?? [])];
      const allHeadlines = (state.headlines ?? []).filter(Boolean);

      // Asset feed spec for dynamic creative
      const asset_feed_spec: any = {
        images: imageHashes.map((h) => ({ hash: h })),
        bodies: allTexts.length ? allTexts.map((t: string) => ({ text: t })) : [{ text: "Learn more about our offer." }],
        titles: allHeadlines.length ? allHeadlines.map((t: string) => ({ text: t })) : undefined,
        descriptions: state.description ? [{ text: state.description }] : undefined,
        link_urls: [{ website_url: linkUrl + utm, display_url: state.displayLink || undefined }],
        call_to_action_types: [state.cta || "LEARN_MORE"],
        ad_formats: ["SINGLE_IMAGE"],
      };

      const creativeBody: any = {
        name: `${state.campaignName || "Creative"} – ${Date.now()}`,
        object_story_spec: { page_id: pageId },
        asset_feed_spec,
      };
      const creative = await metaPost(`${actId}/adcreatives`, creativeBody, token);

      // 4. Ad
      const ad = await metaPost(`${actId}/ads`, {
        name: `${state.campaignName || "Ad"} – Ad 1`,
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status: "PAUSED",
      }, token);

      // Update draft
      if (draftId) {
        await admin.from("ad_drafts").update({
          status: "launched",
          meta_campaign_id: campaign.id,
          meta_adset_id: adset.id,
          meta_ad_id: ad.id,
        }).eq("id", draftId);
      }

      await admin.from("ad_action_log").update({
        status: "success", result_object_id: ad.id,
        meta: { campaign_id: campaign.id, adset_id: adset.id, creative_id: creative.id, ad_id: ad.id },
      }).eq("id", log.data!.id);

      return json({ ok: true, campaignId: campaign.id, adsetId: adset.id, adId: ad.id });
    } catch (e: any) {
      if (draftId) await admin.from("ad_drafts").update({ status: "failed", launch_error: e.message }).eq("id", draftId);
      await admin.from("ad_action_log").update({ status: "failed", error_message: e.message }).eq("id", log.data!.id);
      return json({ error: e.message }, 400);
    }
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});
