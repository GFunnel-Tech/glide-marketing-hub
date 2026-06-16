// Parse a plain-English optimization rule into a structured spec.
// Body: { prompt: string, clientId: number, ruleId?: string }
// Returns: { spec, explanation, warnings }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const SYSTEM_PROMPT = `You convert plain-English ad-account optimization rules into a strict JSON spec.

Allowed action types:
- "pause_ads"        -> pause one or more ads
- "unpause_ads"      -> resume ads
- "adjust_budget"    -> change adset daily budget (percent +/-)
- "swap_creative"    -> rotate to a different creative
- "flag_only"        -> just notify, never touch Meta

Allowed metrics: cpl, cpm, ctr, frequency, leads, spend, roas.
Allowed operators: gt, gte, lt, lte, eq.
Allowed windows: "1d","3d","7d","14d","30d".

Return ONLY valid JSON in this shape:
{
  "conditions": [
    { "metric": "cpl", "op": "gt", "value": 80, "window": "3d", "min_spend": 50 }
  ],
  "logic": "all",           // "all" or "any"
  "action": "pause_ads",    // one of the allowed action types
  "action_params": {
    "scope": "worst_ad",    // worst_ad | all_underperformers | adset | campaign
    "budget_percent": -25,  // only for adjust_budget
    "notify_severity": "warn" // info | warn | critical, for flag_only
  },
  "explanation": "Plain-English restatement.",
  "warnings": ["..."]
}

If the user's prompt is ambiguous, fill in safe defaults and add a warning. Never invent metrics or actions outside the allowed lists.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const { prompt, clientId, ruleId } = await req.json().catch(() => ({}));
    if (!prompt || typeof prompt !== "string" || prompt.length > 2000)
      return json({ error: "prompt required (max 2000 chars)" }, 400);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (aiRes.status === 429) return json({ error: "AI rate limit, try again shortly" }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted" }, 402);
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return json({ error: `AI gateway error: ${txt.slice(0, 200)}` }, 500);
    }

    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content;
    if (!content) return json({ error: "Empty AI response" }, 500);

    let spec: any;
    try {
      spec = JSON.parse(content);
    } catch {
      return json({ error: "AI returned invalid JSON", raw: content }, 500);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    if (ruleId) {
      await admin
        .from("client_ai_rules")
        .update({
          parsed_spec: spec,
          last_parsed_at: new Date().toISOString(),
          parse_error: null,
        })
        .eq("id", ruleId);
    }

    return json({ ok: true, spec });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
