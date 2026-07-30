import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Send, Bot, User, Loader2, Check, Zap, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { ThreadHistoryMenu } from "./ThreadHistoryMenu";
import { useAiThreadMutations, type AiThread } from "@/hooks/useAiThreads";

interface ToolEvent {
  tool: string;
  args: any;
  status: "ok" | "error";
  result?: any;
  error?: string;
  queued?: boolean;
  pendingActionId?: string;
}
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolEvents?: ToolEvent[];
}

interface AgentChatProps {
  workspaceId: string;
  /** Active client the agent acts on. May be null on the workspace-wide page. */
  clientId: number | null;
  /** Placeholder + empty-state copy hint, usually the client name. */
  contextLabel?: string;
  suggestions?: string[];
  /** Fires when the agent auto-switches the client based on the message text. */
  onClientDetected?: (clientId: number) => void;
  /** Optional resolver used to detect a client name inside the user's message. */
  detectClient?: (text: string) => number | undefined;
  /** Edge function to invoke. Defaults to "ai-agent" (per-client). Use "ai-ops-chat" for portfolio. */
  endpoint?: string;
  className?: string;
}

const DEFAULT_SUGGESTIONS = [
  "Audit this account's ad performance",
  "Pause the 10 worst-performing ads to lower CPM",
  "Which ad sets should I scale up?",
  "Generate this month's report",
  "Compare my top creatives against my other clients",
  "What's killing my CPL right now?",
];

export function AgentChat({
  workspaceId,
  clientId,
  contextLabel,
  suggestions = DEFAULT_SUGGESTIONS,
  onClientDetected,
  detectClient,
  endpoint = "ai-agent",
  className,
}: AgentChatProps) {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !workspaceId || loading) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    let effectiveClientId = clientId;
    const detected = detectClient?.(text);
    if (detected && detected !== clientId) {
      effectiveClientId = detected;
      onClientDetected?.(detected);
    }

    try {
      const { data, error } = await supabase.functions.invoke(endpoint, {
        body: {
          workspaceId,
          clientId: effectiveClientId,
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const reply = (data as any).reply || "(no reply)";
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: reply, toolEvents: (data as any).toolEvents ?? [] },
      ]);
      qc.invalidateQueries({ queryKey: ["ai-pending"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    } catch (e: any) {
      toast.error(e.message ?? "AI request failed");
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: `⚠️ ${e.message ?? "Error"}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className={cn("flex flex-col rounded-lg border border-border bg-card overflow-hidden", className)}>
      <div className="flex-1 overflow-auto p-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Sparkles className="h-10 w-10 text-primary mb-4" />
            <p className="text-muted-foreground mb-2 text-center max-w-md text-sm">
              {contextLabel
                ? `Ask me to audit, optimize, report on, or act on ${contextLabel}. I pull the live data first, then queue changes for approval or run them on Meta.`
                : "Tell me what you want to do. I can read every client's data, pull and compare ads, generate reports, research the web, and act on Meta."}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mt-4 w-full">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-accent hover:border-primary/40 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
                <div
                  className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-accent text-foreground",
                  )}
                >
                  {msg.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div
                  className={cn(
                    "rounded-lg px-4 py-3 max-w-[85%] text-sm space-y-2",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-accent border border-border text-foreground",
                  )}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:w-full [&_table]:text-xs [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:border-b [&_th]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:border-b [&_td]:border-border [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                  {msg.toolEvents && msg.toolEvents.length > 0 && (
                    <div className="border-t border-border/60 pt-2 space-y-1">
                      {msg.toolEvents.map((t, i) => (
                        <div key={i} className="text-xs flex items-start gap-1.5 text-muted-foreground">
                          {t.status === "error" ? (
                            <AlertCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                          ) : t.queued ? (
                            <Check className="h-3 w-3 text-warning mt-0.5 shrink-0" />
                          ) : (
                            <Zap className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                          )}
                          <span>
                            <code className="text-foreground">{t.tool}</code>
                            {t.queued
                              ? " — queued for approval"
                              : t.status === "error"
                                ? ` — ${t.error}`
                                : " — done"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="rounded-lg bg-accent border border-border px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.2s]" />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              contextLabel ? `Ask the agent about ${contextLabel}…` : "Ask the agent to audit, optimize, or report…"
            }
            className="flex-1 resize-none rounded-lg border border-border bg-accent px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            rows={1}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading || !workspaceId}
            className="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
