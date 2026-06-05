// Claude-powered Meta ads optimization + account intelligence agent.
// Body: { messages: {role, content}[], workspaceId, clientId?, scheduled?: boolean }
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

// Most capable model by default; override with AI_AGENT_MODEL (e.g. claude-sonnet-4-6) to trade cost for speed.
const MODEL = Deno.env.get("AI_AGENT_MODEL") ?? "claude-opus-4-8";
// Anthropic server-side web search lets the agent pull external context (competitor ads, benchmarks, news).
const ENABLE_WEB_SEARCH = (Deno.env.get("AI_AGENT_ENABLE_WEB_SEARCH") ?? "true") !== "false";
const WEB_SEARCH_TOOL = { type: "web_search_20260209", name: "web_search" };

// Custom (client-side) tools exposed to Claude. Read tools always execute; action tools queue or execute on Meta.
const TOOLS = [
  {
    name: "list_clients",
    description:
      "List every client in the current workspace with their rollup metrics (cpl, cpm, leads, spend, form_cvr, frequency, true_cpl, status, autonomous flag). Use this to answer cross-account questions, rank clients, or pick which client to compare.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_client",
    description: "Fetch a single client's full record and current rollup metrics.",
    input_schema: {
      type: "object",
      properties: { client_id: { type: "number" } },
      required: ["client_id"],
    },
  },
  {
    name: "list_campaigns",
    description: "List a client's campaigns with spend, leads, cpl, cpm, frequency, ad set and ad counts.",
    input_schema: {
      type: "object",
      properties: { client_id: { type: "number" } },
      required: ["client_id"],
    },
  },
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
    name: "compare_ads",
    description:
      "Pull ads across one or more clients to compare them side by side (e.g. find the cheapest CPL creatives across the whole book, or benchmark one client against another). Returns ads sorted by CPL ascending.",
    input_schema: {
      type: "object",
      properties: {
        client_ids: { type: "array", items: { type: "number" }, description: "Clients to include. Defaults to the active client." },
        only_active: { type: "boolean" },
      },
    },
  },
  {
    name: "list_reports",
    description: "List existing monthly reports for the workspace (optionally filtered to a client), with status and headline metrics.",
    input_schema: {
      type: "object",
      properties: { client_id: { type: "number" } },
    },
  },
  {
    name: "generate_report",
    description:
      "Generate a monthly report draft for a client from the latest rollup metrics. Creates a 'ready' report row the user can review in the Reports page. Safe and reversible — executes immediately.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "number" },
        month: { type: "string", description: "e.g. 'March 2026'. Defaults to the current month." },
      },
      required: ["client_id"],
    },
  },
  {
    name: "search_knowledge_base",
    description:
      "Search the workspace knowledge base for SOPs, playbooks, client context, and notes. Use this before answering account-specific questions so your advice matches how this agency operates.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords to search titles and content." },
        client_id: { type: "number", description: "Limit to this client plus workspace-wide entries." },
      },
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
    let useWeb = ENABLE_WEB_SEARCH;

    const callClaude = async (): Promise<any> => {
      const tools = useWeb ? [...TOOLS, WEB_SEARCH_TOOL] : TOOLS;
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: systemPrompt, tools, messages: aMessages }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        // If web search isn't enabled on this account, drop it and retry once.
        if (useWeb && /web_search|web search|not.*enabled|unsupported tool/i.test(t)) {
          console.warn("web_search unavailable, retrying without it:", t);
          useWeb = false;
          return callClaude();
        }
        throw new Error(`Claude API error ${resp.status}: ${t}`);
      }
      return resp.json();
    };

    // Agent loop: bounded tool turns (web search may add server-side pauses)
    for (let turn = 0; turn < 10; turn++) {
      const data = await callClaude();
      const content = data.content || [];

      const textParts = content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      const toolUses = content.filter((b: any) => b.type === "tool_use");
      if (textParts) finalText = textParts;

      // Server-side tool (web search) paused mid-turn — resend to let Anthropic resume.
      if (data.stop_reason === "pause_turn") {
        aMessages.push({ role: "assistant", content });
        continue;
      }

      if (data.stop_reason !== "tool_use" || toolUses.length === 0) break;

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
            authHeader: authHeader!,
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
    ? `Active client: ${client.name} (${client.brand}) — client_id=${client.id}. Default to this client_id for tools that need one. Current rollups — CPL: $${(client.cpl ?? 0).toFixed?.(2) ?? client.cpl}, Leads: ${client.leads ?? 0}, Spend: $${client.spend ?? 0}, Form CVR: ${client.form_cvr ?? "—"}%, Frequency: ${client.frequency ?? "—"}, Status: ${client.status}.`
    : "No active client selected. Use list_clients to see the book, and ask the user to pick one before taking Meta actions.";
  return `You are the Meta Ads & Account Intelligence Agent for an agency dashboard. Today is ${today}.
${ctx}
${mode}

What you can do:
- Read account data: list_clients, get_client, list_campaigns, list_ads, compare_ads (across clients), list_reports, search_knowledge_base.
- Produce work: generate_report (creates a report draft from current rollups).
- Act on Meta: pause_ads, resume_ads, update_adset_budget, duplicate_ad (queued in review mode, live in autonomous mode).
- Research the web (when available) for competitor creatives, benchmarks, and current best practices — cite what you find.

Operating rules:
- Always pull the relevant data (list_ads / compare_ads / list_campaigns) before proposing changes so decisions are grounded in real performance.
- Check search_knowledge_base for account-specific context before giving account-specific advice.
- A "low performer" is an ad that EITHER (a) has CPL ≥ 1.5× the client's blended CPL with ≥ 5 leads of data, OR (b) has spent ≥ $50 with < 2 leads, OR (c) has CTR < 0.8% AND impressions ≥ 3000. Use account context to refine.
- Never pause an ad with < $20 spend unless the user explicitly asks.
- For "lower CPM by reducing combinations": rank ads by CPL desc, pause the worst N until the target combination count is reached. Show your ranking.
- Always finish with a concise markdown summary table of what you found / proposed / executed.
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

  // ---- Read / safe tools (always execute) ----
  if (tool === "list_clients") {
    const { data, error } = await admin
      .from("clients")
      .select("id,name,brand,status,cpl,cpm,leads,spend,form_cvr,frequency,true_cpl,double_count,autonomous_optimization")
      .eq("workspace_id", workspaceId)
      .order("spend", { ascending: false });
    if (error) throw new Error(error.message);
    return { result: { clients: data ?? [], count: data?.length ?? 0 } };
  }

  if (tool === "get_client") {
    const cid = args.client_id ?? clientId;
    if (!cid) throw new Error("client_id required");
    const { data, error } = await admin
      .from("clients")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", cid)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Client not found in this workspace");
    return { result: { client: data } };
  }

  if (tool === "list_campaigns") {
    const cid = args.client_id ?? clientId;
    if (!cid) throw new Error("client_id required");
    const { data, error } = await admin
      .from("campaigns")
      .select("id,name,status,spend,leads,true_leads,cpl,true_cpl,cpm,frequency,ad_sets,ads,double_count,issues_status")
      .eq("workspace_id", workspaceId)
      .eq("client_id", cid)
      .order("spend", { ascending: false });
    if (error) throw new Error(error.message);
    return { result: { campaigns: data ?? [], client_id: cid } };
  }

  if (tool === "list_ads") {
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

  if (tool === "compare_ads") {
    const ids: number[] = Array.isArray(args.client_ids) && args.client_ids.length
      ? args.client_ids
      : clientId
        ? [clientId]
        : [];
    if (!ids.length) throw new Error("Provide client_ids to compare (or select an active client).");
    let q = admin
      .from("meta_ads")
      .select("id,client_id,adset_name,campaign_name,name,effective_status,spend,impressions,leads,ctr,cpl,days_active")
      .eq("workspace_id", workspaceId)
      .in("client_id", ids)
      .order("cpl", { ascending: true })
      .limit(300);
    if (args.only_active) q = q.eq("effective_status", "ACTIVE");
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { result: { ads: data ?? [], client_ids: ids } };
  }

  if (tool === "list_reports") {
    let q = admin
      .from("reports")
      .select("id,client_id,client_name,brand,month,status,delivered_date,client_reviewed,metric_spend,metric_leads,metric_cpl")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (args.client_id) q = q.eq("client_id", args.client_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { result: { reports: data ?? [] } };
  }

  if (tool === "generate_report") {
    const cid = args.client_id ?? clientId;
    if (!cid) throw new Error("client_id required");
    const { data: c, error: cErr } = await admin
      .from("clients")
      .select("id,name,brand,spend,leads,cpl,workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("id", cid)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!c) throw new Error("Client not found in this workspace");
    const month =
      args.month ?? new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
    const { data: rep, error } = await admin
      .from("reports")
      .insert({
        workspace_id: workspaceId,
        client_id: cid,
        client_name: c.name,
        brand: c.brand,
        month,
        status: "ready",
        metric_spend: c.spend ?? 0,
        metric_leads: c.leads ?? 0,
        metric_cpl: c.cpl ?? 0,
        metric_appointments: 0,
        metric_applications: 0,
        metric_closed_deals: 0,
        metric_pipeline_value: 0,
      })
      .select("id,month,status,client_name")
      .single();
    if (error) throw new Error(error.message);
    return { result: { report: rep, note: "Draft report created from current rollups; review it in the Reports page." } };
  }

  if (tool === "search_knowledge_base") {
    let q = admin
      .from("ai_knowledge_base")
      .select("id,title,content,tags,client_id,created_at")
      .eq("workspace_id", workspaceId);
    if (args.query) {
      const safe = String(args.query).replace(/[,%()]/g, " ").trim();
      if (safe) q = q.or(`title.ilike.%${safe}%,content.ilike.%${safe}%`);
    }
    const { data, error } = await q.order("created_at", { ascending: false }).limit(20);
    if (error) throw new Error(error.message);
    let rows = data ?? [];
    if (args.client_id) rows = rows.filter((r: any) => r.client_id == null || r.client_id === args.client_id);
    return { result: { entries: rows, count: rows.length } };
  }

  // ---- Action tools: queue (review mode) or execute on Meta (autonomous) ----
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
