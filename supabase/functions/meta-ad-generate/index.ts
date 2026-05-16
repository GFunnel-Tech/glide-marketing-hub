// AI-powered ad creative generator. Body: { prompt, objective, generateImages?: boolean }
// Returns { primaryTexts, headlines, description, cta, images?: string[] }
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { prompt, objective = "leads", generateImages = false } = await req.json();
    if (!prompt || typeof prompt !== "string") return json({ error: "prompt required" }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI gateway not configured" }, 500);

    // 1) Generate copy with gemini-2.5-flash
    const systemPrompt = `You are an expert Meta ad copywriter. Generate compelling ad copy for a ${objective} campaign.
Output strict JSON: {"primaryTexts":[3 variants, each 80-125 chars, hook-driven],"headlines":[3 variants, each 25-40 chars],"description":"~25 chars","cta":"one of LEARN_MORE|SIGN_UP|GET_QUOTE|APPLY_NOW|CONTACT_US|SHOP_NOW|DOWNLOAD|GET_STARTED|BOOK_NOW|SUBSCRIBE"}`;

    const copyRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (copyRes.status === 429) return json({ error: "Rate limit exceeded. Try again shortly." }, 429);
    if (copyRes.status === 402) return json({ error: "AI credits exhausted. Add credits in workspace settings." }, 402);
    if (!copyRes.ok) return json({ error: `AI error: ${await copyRes.text()}` }, 500);
    const copyJson = await copyRes.json();
    const content = copyJson.choices?.[0]?.message?.content ?? "{}";
    let copy: any;
    try { copy = JSON.parse(content); } catch { copy = { primaryTexts: [content], headlines: [], cta: "LEARN_MORE" }; }

    // 2) Optionally generate images
    let images: string[] = [];
    if (generateImages) {
      const imgRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: `Generate a professional ad creative image: ${prompt}` }],
          modalities: ["image", "text"],
        }),
      });
      if (imgRes.ok) {
        const imgJson = await imgRes.json();
        const url = imgJson.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (url) images.push(url);
      }
    }

    return json({
      primaryTexts: copy.primaryTexts ?? [],
      headlines: copy.headlines ?? [],
      description: copy.description ?? "",
      cta: copy.cta ?? "LEARN_MORE",
      images,
    });
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});
