// Claude-powered Meta ads optimization agent.
// Body: { messages: {role, content}[], workspaceId, clientId?, autoExecute?: boolean }
// Returns: { reply: string, toolEvents: {tool, args, status, result|error, pendingActionId?}[] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MODEL = "claude-sonnet-4-5";

// Tool definitions exposed to Claude
const TOOLS = [
  {
    name: "list_ads",
    description:
      "Fetch all ads for a client with their performance metrics. Returns ad_id, adset_id, adset_name, campaign_name, name, status, spend, leads, cpl, ctr, impressions, days_active. Call this first to understand performance before proposing changes.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "number", description: "Internal client id" },
        only_active: { type: "boolean", description: "If true, only ads with effective_status=ACTIVE" },
      },
      required: ["client_id"],
    },
  },
  {
    name: "pause_ads",
    description: "Pause one or more ads on Meta. Provide their ad_ids.",
    input_schema: {
      type: "object",
      properties: {
        ad_ids: { type: "array", items: { type: "string" } },
        reason: { type: "string", description: "Why these ads are being paused (shown to the human)" },
      },
      required: ["ad_ids", "reason"],
    },
  },
  {
    name: "resume_ads",
    description: "Resume (set ACTIVE) one or more paused ads.",
    input_schema: {
      type: "object",
      properties: {
        ad_ids: { type: "array", items: { type: "string" } },
        reason: { type: "string" },
      },
      required: ["ad_ids", "reason"],
    },
  },
  {
    name: "update_adset_budget",
    description:
      "Change an ad set's daily or lifetime budget on Meta. Provide either percent (e.g. -50 to halve, +25 to scale up) OR daily_budget (in account currency major units, e.g. 50.00).",
    input_schema: {
      type: "object",
      properties: {
        adset_id: { type: "string" },
        percent: { type: "number" },
        daily_budget: { type: "number" },
        reason: { type: "string" },
      },
      required: ["adset_id", "reason"],
    },
  },
  {
    name: "duplicate_ad",
    description: "Duplicate a winning ad (Meta /copies). New ad starts PAUSED unless overridden.",
    input_schema: {
      type: "object",
      properties: {
        ad_id: { type: "string" },
        new_name_suffix: { type: "string" },
        target_adset_id: { type: "string", description: "Optional: clone into a different ad set" },
        reason: { type: "string" },
      },
      required: ["ad_id", "reason"],
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const body = await req.json().catch(() => ({}));
    const { messages, workspaceId, clientId, scheduled } = body as {
      messages: { role: "user" | "assistant"; content: string }[];
      workspaceId: string;
      clientId?: number;
      scheduled?: boolean;
    };
    if (!workspaceId || !Array.isArray(messages) || !messages.length)
      return json({ error: "workspaceId and messages required" }, 400);

    const isSystem = scheduled === true && authHeader === `Bearer ${SERVICE_KEY}`;
    let userId: string;
    if (isSystem) {
      userId = "00000000-0000-0000-0000-000000000000";
    } else {
      const userClient = createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      userId = userData.user.id;
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve client + autonomous flag
    let clientCtx: any = null;
    let autonomous = false;
    if (clientId) {
      const { data: c } = await admin
        .from("clients")
        .select("id,name,brand,workspace_id,cpl,leads,spend,form_cvr,frequency,status,autonomous_optimization")
        .eq("id", clientId)
        .maybeSingle();
      if (!c || c.workspace_id !== workspaceId) return json({ error: "Client not in workspace" }, 403);
      clientCtx = c;
      autonomous = !!c.autonomous_optimization;
    }

    const systemPrompt = buildSystemPrompt(clientCtx, autonomous);

    // Convert messages to Anthropic format
    const aMessages: any[] = messages.map((m) => ({ role: m.role, content: m.content }));

    const toolEvents: any[] = [];
    let finalText = "";

    // Agent loop: max 6 tool turns
    for (let turn = 0; turn < 6; turn++) {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          tools: TOOLS,
          messages: aMessages,
        }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        console.error("Claude error", resp.status, t);
        return json({ error: `Claude API error ${resp.status}: ${t}` }, 500);
      }
      const data = await resp.json();
      const content = data.content || [];

      // Collect text + tool_use blocks
      const textParts = content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      const toolUses = content.filter((b: any) => b.type === "tool_use");

      if (textParts) finalText = textParts;

      if (data.stop_reason !== "tool_use" || toolUses.length === 0) {
        break;
      }

      // Append assistant content + execute tools
      aMessages.push({ role: "assistant", content });
      const toolResults: any[] = [];
      for (const tu of toolUses) {
        const evt: any = { tool: tu.name, args: tu.input, status: "ok" };
        try {
          const out = await executeTool(admin, {
            tool: tu.name,
            args: tu.input,
            workspaceId,
            clientId,
            userId,
            autonomous,
            authHeader,
          });
          evt.result = out.result;
          if (out.pendingActionId) evt.pendingActionId = out.pendingActionId;
          if (out.queued) evt.queued = true;
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(out.result ?? { queued: out.queued, pendingActionId: out.pendingActionId }),
          });
        } catch (e: any) {
          evt.status = "error";
          evt.error = e?.message || String(e);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify({ error: evt.error }),
            is_error: true,
          });
        }
        toolEvents.push(evt);
      }
      aMessages.push({ role: "user", content: toolResults });
    }

    return json({ reply: finalText, toolEvents, autonomous });
  } catch (e: any) {
    console.error("ai-agent fatal", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});

function buildSystemPrompt(client: any, autonomous: boolean): string {
  const today = new Date().toISOString().slice(0, 10);
  const mode = autonomous
    ? "AUTONOMOUS MODE: when you call an action tool (pause_ads, resume_ads, update_adset_budget, duplicate_ad), it will execute on Meta IMMEDIATELY. Be conservative and explain your reasoning before each call."
    : "REVIEW MODE: action tool calls will be QUEUED for human approval (not executed). State clearly what you're queueing and why.";
  const ctx = client
    ? `Active client: ${client.name} (${client.brand}) — client_id=${client.id}. Always pass client_id=${client.id} to tools that require it. Current rollups — CPL: $${(client.cpl ?? 0).toFixed?.(2) ?? client.cpl}, Leads: ${client.leads ?? 0}, Spend: $${client.spend ?? 0}, Form CVR: ${client.form_cvr ?? "—"}%, Frequency: ${client.frequency ?? "—"}, Status: ${client.status}.`
    : "No active client selected. Ask the user to pick one in the client dropdown before taking actions.";
  return `You are the Meta Ads Optimization Agent for an agency dashboard. Today is ${today}.
${ctx}
${mode}

Operating rules:
- Always call list_ads first when proposing changes so your decisions are grounded in real performance.
- A "low performer" is an ad that EITHER (a) has CPL ≥ 1.5× the client's blended CPL with ≥ 5 leads of data, OR (b) has spent ≥ $50 with < 2 leads, OR (c) has CTR < 0.8% AND impressions ≥ 3000. Use account context to refine.
- Never pause an ad with < $20 spend unless the user explicitly asks.
- For "lower CPM by reducing combinations": rank ads by CPL desc, pause the worst N until the target combination count is reached. Show your ranking.
- Always finish with a concise markdown summary table of what you proposed/executed.
- Be honest about uncertainty. If data is missing, say so.`;
}

async function executeTool(
  admin: any,
  ctx: {
    tool: string;
    args: any;
    workspaceId: string;
    clientId?: number;
    userId: string;
    autonomous: boolean;
    authHeader: string;
  },
): Promise<{ result?: any; queued?: boolean; pendingActionId?: string }> {
  const { tool, args, workspaceId, clientId, userId, autonomous, authHeader } = ctx;

  // list_ads is always safe to execute
  if (tool === "list_ads") {
    // Auto-fill client_id from active client context when Claude omits it
    const cid = args.client_id ?? clientId;
    if (!cid) throw new Error("client_id required — no active client selected. Pick a client in the dropdown.");
    let q = admin
      .from("meta_ads")
      .select("id,adset_id,adset_name,campaign_name,name,effective_status,spend,impressions,clicks,leads,ctr,cpl,days_active")
      .eq("workspace_id", workspaceId)
      .eq("client_id", cid)
      .order("spend", { ascending: false })
      .limit(200);
    if (args.only_active) q = q.eq("effective_status", "ACTIVE");
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { result: { ads: data ?? [], client_id: cid } };
  }

  // Action tools: queue or execute
  if (!autonomous) {
    const { data: pa, error } = await admin
      .from("ai_pending_actions")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId ?? null,
        proposed_by: userId,
        action_type: tool,
        payload: args,
        reasoning: args.reason ?? null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { queued: true, pendingActionId: pa.id };
  }

  // Autonomous: invoke the actual edge function
  return { result: await invokeAction(tool, args, workspaceId, authHeader) };
}

async function invokeAction(tool: string, args: any, workspaceId: string, authHeader: string) {
  const base = `${SUPABASE_URL}/functions/v1`;
  let url = "";
  let body: any = { workspaceId };
  if (tool === "pause_ads" || tool === "resume_ads") {
    url = `${base}/meta-ad-status`;
    body = { workspaceId, adIds: args.ad_ids, status: tool === "pause_ads" ? "PAUSED" : "ACTIVE" };
  } else if (tool === "update_adset_budget") {
    url = `${base}/meta-ad-budget`;
    body = { workspaceId, adsetId: args.adset_id, percent: args.percent, dailyBudget: args.daily_budget };
  } else if (tool === "duplicate_ad") {
    url = `${base}/meta-ad-duplicate`;
    body = { workspaceId, adId: args.ad_id, newName: args.new_name_suffix, targetAdsetId: args.target_adset_id };
  } else {
    throw new Error(`Unknown tool ${tool}`);
  }
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || `Action ${tool} failed`);
  return j;
}
