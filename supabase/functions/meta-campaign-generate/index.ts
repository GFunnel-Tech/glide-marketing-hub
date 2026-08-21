// AI full-campaign generator.
// Body: { prompt, objective, budget, adSetCount, adsPerSet, specialAdCategory?, generateImages?, businessName? }
// Returns { campaignName, strategy, adSets: [{ name, rationale, interests, ageMin, ageMax, genders, budgetType, budgetAmount, ads: [{ name, primaryTexts, headlines, descriptions, cta, imagePrompt, imageUrl? }] }] }
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const prompt: string = body?.prompt ?? "";
    const objective: string = body?.objective ?? "leads";
    const budget: number = Number(body?.budget) > 0 ? Number(body.budget) : 50;
    const adSetCount = clamp(Number(body?.adSetCount) || 2, 1, 4);
    const adsPerSet = clamp(Number(body?.adsPerSet) || 2, 1, 4);
    const special: string[] = Array.isArray(body?.specialAdCategory) ? body.specialAdCategory : [];
    const generateImages: boolean = !!body?.generateImages;
    const businessName: string = body?.businessName ?? "";

    if (!prompt || typeof prompt !== "string") return json({ error: "prompt required" }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI gateway not configured" }, 500);

    const specialNote = special.length
      ? `This campaign runs under Meta Special Ad Categories: ${special.join(", ")}. Targeting MUST avoid age, gender, ZIP and detailed demographic restrictions — use ages 18-65+, all genders, and only broad, compliant interests.`
      : "";

    const system = `You are a senior Meta media buyer. Design a complete, launch-ready campaign structure.
Return STRICT JSON only, shaped exactly:
{
 "campaignName": string,
 "strategy": string (2-3 sentences on the testing approach),
 "adSets": [
   {
     "name": string,
     "rationale": string (1 sentence why this audience),
     "interests": [string, ...] (3-6 real Meta interest names, [] if broad),
     "ageMin": number, "ageMax": number,
     "genders": "all" | "male" | "female",
     "budgetType": "daily",
     "budgetAmount": number,
     "ads": [
       {
         "name": string,
         "primaryTexts": [3 strings, 80-125 chars each, hook-driven],
         "headlines": [3 strings, 25-40 chars each],
         "descriptions": [2 short strings, ~25 chars],
         "cta": "LEARN_MORE"|"SIGN_UP"|"GET_QUOTE"|"APPLY_NOW"|"CONTACT_US"|"SHOP_NOW"|"DOWNLOAD"|"GET_STARTED"|"BOOK_NOW"|"SUBSCRIBE",
         "imagePrompt": string (a vivid photographic ad-creative brief, no text overlays)
       }
     ]
   }
 ]
}
Produce exactly ${adSetCount} ad sets and exactly ${adsPerSet} ads per ad set. Each ad set must test a distinct audience angle; each ad a distinct creative angle.
Objective: ${objective}. Total daily budget across all ad sets should be about $${budget} (split it sensibly). ${specialNote}
No markdown, no commentary — JSON only.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: businessName ? `Business: ${businessName}\n\n${prompt}` : prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) return json({ error: "Rate limit exceeded. Try again shortly." }, 429);
    if (res.status === 402) return json({ error: "AI credits exhausted. Add credits in workspace settings." }, 402);
    if (!res.ok) return json({ error: `AI error: ${await res.text()}` }, 500);

    const out = await res.json();
    const content = out.choices?.[0]?.message?.content ?? "{}";
    let plan: any;
    try { plan = JSON.parse(content); } catch { return json({ error: "AI returned malformed plan. Try again." }, 502); }

    const adSets = Array.isArray(plan.adSets) ? plan.adSets.slice(0, adSetCount) : [];
    if (!adSets.length) return json({ error: "AI returned no ad sets. Try a more specific prompt." }, 502);

    // Normalise
    const perSetBudget = Math.max(5, Math.round(budget / adSets.length));
    const normalised = adSets.map((s: any, i: number) => ({
      name: String(s?.name || `Ad Set ${i + 1}`),
      rationale: String(s?.rationale || ""),
      interests: (Array.isArray(s?.interests) ? s.interests : []).slice(0, 8).map((n: any) => String(n)),
      ageMin: special.length ? 18 : clamp(Number(s?.ageMin) || 25, 18, 65),
      ageMax: special.length ? 65 : clamp(Number(s?.ageMax) || 65, 18, 65),
      genders: special.length ? "all" : (["all", "male", "female"].includes(s?.genders) ? s.genders : "all"),
      budgetType: "daily",
      budgetAmount: Number(s?.budgetAmount) > 0 ? Math.round(Number(s.budgetAmount)) : perSetBudget,
      ads: (Array.isArray(s?.ads) ? s.ads : []).slice(0, adsPerSet).map((a: any, j: number) => ({
        name: String(a?.name || `Ad ${j + 1}`),
        primaryTexts: (Array.isArray(a?.primaryTexts) ? a.primaryTexts : []).map(String).slice(0, 3),
        headlines: (Array.isArray(a?.headlines) ? a.headlines : []).map(String).slice(0, 3),
        descriptions: (Array.isArray(a?.descriptions) ? a.descriptions : []).map(String).slice(0, 2),
        cta: String(a?.cta || (objective === "leads" ? "APPLY_NOW" : "LEARN_MORE")),
        imagePrompt: String(a?.imagePrompt || prompt),
        imageUrl: null as string | null,
      })),
    }));

    // Optional image generation (one per ad, capped to keep latency sane)
    if (generateImages) {
      const targets: any[] = [];
      for (const s of normalised) for (const a of s.ads) targets.push(a);
      const capped = targets.slice(0, 6);
      await Promise.all(capped.map(async (a) => {
        try {
          const imgRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-image",
              messages: [{ role: "user", content: `Professional Meta ad creative photo, square, no text overlay: ${a.imagePrompt}` }],
              modalities: ["image", "text"],
            }),
          });
          if (!imgRes.ok) return;
          const ij = await imgRes.json();
          const url = ij.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (url) a.imageUrl = url;
        } catch (_e) { /* image is optional */ }
      }));
    }

    return json({
      campaignName: String(plan.campaignName || `${businessName || "New"} — ${objective} campaign`),
      strategy: String(plan.strategy || ""),
      adSets: normalised,
    });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
