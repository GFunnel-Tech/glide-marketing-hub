// DeepSeek adapter with an Anthropic-shaped request/response surface.
//
// All AI functions in this project were written against the Anthropic Messages
// API. Rather than rewriting every call site, this shim accepts the same body
// (system / messages / tools / tool_choice / max_tokens) and translates it to
// DeepSeek's OpenAI-compatible chat-completions endpoint, then translates the
// response back into Anthropic content blocks + stop_reason.
//
// The key is read from DEEPSEEK_API_KEY first, falling back to
// ANTHROPIC_API_KEY so an existing secret slot can hold the DeepSeek key.

export const DEEPSEEK_BASE_URL = Deno.env.get("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com/v1";

export function getDeepseekKey(): string | undefined {
  return Deno.env.get("DEEPSEEK_API_KEY") ?? Deno.env.get("ANTHROPIC_API_KEY") ?? undefined;
}

/** Map any legacy Claude model id (or empty) onto a DeepSeek model. */
export function deepseekModel(model?: string | null): string {
  const m = (model ?? "").trim();
  if (!m || /^claude/i.test(m)) {
    return Deno.env.get("DEEPSEEK_MODEL") ?? "deepseek-chat";
  }
  return m;
}

type AnthropicBlock = { type: string; [k: string]: any };

function textOf(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b?.type === "text" || typeof b === "string")
      .map((b: any) => (typeof b === "string" ? b : b.text ?? ""))
      .join("\n");
  }
  return "";
}

/** Anthropic messages[] -> OpenAI messages[] */
function toOpenAIMessages(system: string | undefined, messages: any[]): any[] {
  const out: any[] = [];
  if (system) out.push({ role: "system", content: system });

  for (const m of messages ?? []) {
    const content = m?.content;

    // Tool results come back as a user message with tool_result blocks.
    if (Array.isArray(content) && content.some((b: any) => b?.type === "tool_result")) {
      for (const b of content) {
        if (b?.type !== "tool_result") continue;
        out.push({
          role: "tool",
          tool_call_id: b.tool_use_id,
          content: typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? ""),
        });
      }
      const leftover = textOf(content);
      if (leftover.trim()) out.push({ role: "user", content: leftover });
      continue;
    }

    // Assistant turn possibly containing tool_use blocks.
    if (m?.role === "assistant" && Array.isArray(content)) {
      const toolUses = content.filter((b: any) => b?.type === "tool_use");
      const msg: any = { role: "assistant", content: textOf(content) || "" };
      if (toolUses.length) {
        msg.tool_calls = toolUses.map((b: any) => ({
          id: b.id,
          type: "function",
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        }));
      }
      out.push(msg);
      continue;
    }

    out.push({ role: m?.role ?? "user", content: textOf(content) });
  }
  return out;
}

function toOpenAITools(tools: any[] | undefined) {
  if (!tools?.length) return undefined;
  return tools
    .filter((t) => t?.name && t.name !== "web_search" && !t.type) // server-side Anthropic tools are unsupported
    .map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description ?? "",
        parameters: t.input_schema ?? { type: "object", properties: {} },
      },
    }));
}

/**
 * Anthropic-compatible call against DeepSeek.
 * Returns `{ ok, status, data }` where `data` mirrors an Anthropic Messages response.
 */
export async function anthropicCompatMessages(body: {
  model?: string;
  system?: string;
  messages: any[];
  tools?: any[];
  tool_choice?: any;
  max_tokens?: number;
  temperature?: number;
}): Promise<{ ok: boolean; status: number; data: any }> {
  const key = getDeepseekKey();
  if (!key) return { ok: false, status: 500, data: { error: { message: "DEEPSEEK_API_KEY not configured" } } };

  const tools = toOpenAITools(body.tools);
  const payload: any = {
    model: deepseekModel(body.model),
    messages: toOpenAIMessages(body.system, body.messages),
    max_tokens: body.max_tokens ?? 4096,
  };
  if (typeof body.temperature === "number") payload.temperature = body.temperature;
  if (tools?.length) {
    payload.tools = tools;
    const forced = body.tool_choice;
    if (forced?.type === "tool" && forced.name) {
      payload.tool_choice = { type: "function", function: { name: forced.name } };
    } else if (forced?.type === "any") {
      payload.tool_choice = "required";
    }
  }

  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let j: any = null;
  try {
    j = JSON.parse(raw);
  } catch {
    j = { error: { message: raw.slice(0, 500) } };
  }
  if (!res.ok) return { ok: false, status: res.status, data: j };

  const choice = j?.choices?.[0];
  const msg = choice?.message ?? {};
  const blocks: AnthropicBlock[] = [];
  if (msg.content) blocks.push({ type: "text", text: String(msg.content) });
  for (const tc of msg.tool_calls ?? []) {
    let input: any = {};
    try {
      input = JSON.parse(tc.function?.arguments ?? "{}");
    } catch {
      input = {};
    }
    blocks.push({ type: "tool_use", id: tc.id, name: tc.function?.name, input });
  }

  const stop_reason = blocks.some((b) => b.type === "tool_use")
    ? "tool_use"
    : choice?.finish_reason === "length"
      ? "max_tokens"
      : "end_turn";

  return { ok: true, status: res.status, data: { content: blocks, stop_reason, usage: j?.usage, model: j?.model } };
}
