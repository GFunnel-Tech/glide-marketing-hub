import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useClients } from "@/hooks/useDatabase";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Send, Bot, User, ExternalLink, Loader2, Check, X, Zap, AlertCircle, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { OptimizationRulesPanel } from "@/components/ai/OptimizationRulesPanel";
import { OptimizationSchedulePanel } from "@/components/ai/OptimizationSchedulePanel";
import { NotificationSettingsPanel } from "@/components/ai/NotificationSettingsPanel";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolEvents?: ToolEvent[];
}
interface ToolEvent {
  tool: string;
  args: any;
  status: "ok" | "error";
  result?: any;
  error?: string;
  queued?: boolean;
  pendingActionId?: string;
}

const suggestions = [
  "Audit this account's ad performance",
  "Pause the 10 worst-performing ads to lower CPM",
  "We have 160 combinations — get it down to ~46 by pausing the worst",
  "Which ad sets should I scale up?",
  "Duplicate my top 3 ads into a new test",
  "What's killing my CPL right now?",
];

export default function AiAssistant() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;
  const { data: clients = [] } = useClients();
  const qc = useQueryClient();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  // Pending actions for this workspace (and client if selected)
  const { data: pending = [] } = useQuery({
    queryKey: ["ai-pending", workspaceId, selectedClientId],
    queryFn: async () => {
      if (!workspaceId) return [];
      let q = supabase
        .from("ai_pending_actions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      if (selectedClientId) q = q.eq("client_id", selectedClientId);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!workspaceId,
    refetchInterval: 5000,
  });

  // Autonomous toggle
  const toggleAutonomous = useMutation({
    mutationFn: async (next: boolean) => {
      if (!selectedClient) return;
      const { error } = await supabase
        .from("clients")
        .update({ autonomous_optimization: next })
        .eq("id", selectedClient.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Updated optimization mode");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "approve" | "reject" }) => {
      const { data, error } = await supabase.functions.invoke("ai-pending-execute", {
        body: { actionId: id, decision },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(data?.status === "executed" ? "Executed on Meta" : "Updated");
      qc.invalidateQueries({ queryKey: ["ai-pending"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const detectClient = (text: string) => {
    const lower = text.toLowerCase();
    return clients.find(
      (c) => lower.includes(c.name.toLowerCase()) || (c.brand && lower.includes(c.brand.toLowerCase())),
    );
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || !workspaceId) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    const detected = detectClient(text);
    let effectiveClientId = selectedClientId;
    if (detected && detected.id !== selectedClientId) {
      setSelectedClientId(detected.id);
      effectiveClientId = detected.id;
    }

    try {
      const { data, error } = await supabase.functions.invoke("ai-agent", {
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
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Chat column */}
      <div className="flex-[65] flex flex-col rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Meta Ads AI Agent</h2>
              <p className="text-xs text-muted-foreground">
                Powered by Claude · can pause, scale, and duplicate ads
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-success ml-2" />
              </p>
            </div>
          </div>
          <select
            value={selectedClientId ?? ""}
            onChange={(e) => setSelectedClientId(e.target.value ? Number(e.target.value) : null)}
            className="text-xs rounded border border-border bg-background px-2 py-1.5 max-w-[180px]"
          >
            <option value="">Select client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Sparkles className="h-12 w-12 text-primary mb-4" />
              <p className="text-muted-foreground mb-2 text-center max-w-md">
                Tell me what you want to optimize. I'll pull the ad data, decide what to do, and either queue it for
                your approval or execute it on Meta.
              </p>
              <div className="grid grid-cols-2 gap-2 max-w-xl mt-4">
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
                              {t.queued ? " — queued for approval" : t.status === "error" ? ` — ${t.error}` : " — executed"}
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
                selectedClient
                  ? `Ask the agent to optimize ${selectedClient.name}…`
                  : "Pick a client above, then ask the agent to optimize…"
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

      {/* Right rail */}
      <div className="flex-[35] space-y-4 overflow-auto">
        {selectedClient ? (
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Active Client
            </h3>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-semibold text-foreground">{selectedClient.name}</p>
              <StatusBadge status={selectedClient.status} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              <div>
                <span className="text-muted-foreground">CPL</span>
                <p className="font-semibold">${(selectedClient.cpl ?? 0).toFixed(2)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Leads</span>
                <p className="font-semibold">{selectedClient.leads ?? 0}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Form CVR</span>
                <p className="font-semibold">{(selectedClient.formCvr ?? 0).toFixed(2)}%</p>
              </div>
              <div>
                <span className="text-muted-foreground">Spend</span>
                <p className="font-semibold">${(selectedClient.spend ?? 0).toLocaleString()}</p>
              </div>
            </div>

            <div className="rounded-md border border-border bg-background p-3 mb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-warning" />
                    Autonomous optimization
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {(selectedClient as any).autonomousOptimization
                      ? "AI executes changes immediately on Meta"
                      : "AI proposals queue for your approval"}
                  </p>
                </div>
                <Switch
                  checked={!!(selectedClient as any).autonomousOptimization}
                  onCheckedChange={(v) => toggleAutonomous.mutate(v)}
                />
              </div>
            </div>

            <Link
              to={`/client/${selectedClient.id}`}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              Open Client Profile <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card p-5 text-center">
            <p className="text-xs text-muted-foreground">Pick a client to enable optimization</p>
          </div>
        )}

        {selectedClient && workspaceId && (
          <>
            <OptimizationRulesPanel clientId={selectedClient.id} workspaceId={workspaceId} />
            <OptimizationSchedulePanel clientId={selectedClient.id} workspaceId={workspaceId} />
          </>
        )}

        {workspaceId && <NotificationSettingsPanel workspaceId={workspaceId} />}

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Pending AI Actions
            </h3>
            <span className="text-xs text-muted-foreground">{pending.length}</span>
          </div>
          {pending.length === 0 ? (
            <p className="text-xs text-muted-foreground">No actions awaiting approval.</p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-auto">
              {pending.map((p: any) => (
                <div key={p.id} className="rounded-md border border-border bg-background p-3">
                  <div className="flex items-center justify-between mb-1">
                    <code className="text-xs font-semibold text-primary">{p.action_type}</code>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(p.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-foreground mb-1.5">{p.reasoning || "—"}</p>
                  <details className="text-[11px] text-muted-foreground mb-2">
                    <summary className="cursor-pointer">payload</summary>
                    <pre className="mt-1 overflow-auto bg-accent p-1.5 rounded">
                      {JSON.stringify(p.payload, null, 2)}
                    </pre>
                  </details>
                  <div className="flex gap-2">
                    <button
                      onClick={() => decide.mutate({ id: p.id, decision: "approve" })}
                      disabled={decide.isPending}
                      className="flex-1 rounded bg-success/20 text-success border border-success/40 px-2 py-1 text-xs font-medium hover:bg-success/30 flex items-center justify-center gap-1"
                    >
                      <Check className="h-3 w-3" /> Approve
                    </button>
                    <button
                      onClick={() => decide.mutate({ id: p.id, decision: "reject" })}
                      disabled={decide.isPending}
                      className="flex-1 rounded bg-destructive/20 text-destructive border border-destructive/40 px-2 py-1 text-xs font-medium hover:bg-destructive/30 flex items-center justify-center gap-1"
                    >
                      <X className="h-3 w-3" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
