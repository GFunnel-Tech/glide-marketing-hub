import { useState, useRef, useEffect } from "react";
import { clients } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { Send, Bot, User, ExternalLink, Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Link } from "react-router-dom";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

const suggestions = [
  "🔍 Audit Richard Weinberg's account",
  "📊 Which accounts need form swaps?",
  "💰 Agency blended CPL this week",
  "📋 Generate report for Dan Nguyen",
  "⚡ Show double-counting issues",
  "📈 Which accounts should we scale?",
];

const mockResponses: Record<string, string> = {
  "audit": "**Richard Weinberg — Audit Summary**\n\n| Metric | Value | Status |\n|--------|-------|--------|\n| True CPL | $50.07 | 🔴 Fix |\n| Form CVR | 3.92% | 🔴 Fix |\n| Double Count | Yes | ⚠️ |\n| Active Ads | 4 | — |\n\n**Key Issues:**\n1. Form CVR at 3.92% — disqualifier form blocking leads\n2. Double-counting confirmed on Lead pixel\n3. Credit exit logic broken\n\n**Recommended Actions:**\n- Swap to simplified 3-question form\n- Remove Lead pixel from redirect page\n- Build 4 GHL CAPI workflows",
  "form swap": "**Accounts Needing Form Swaps:**\n\n1. **Richard Weinberg** (Rich Capital) — Form CVR 3.92% 🔴\n2. **Dean Onwumere** (Part 2 Lending) — Form CVR 2.04% 🔴\n3. **Shaun Woods** (Opus Grenero) — Form CVR 2.70% 🔴\n\nAll three have multi-step disqualifier forms causing high drop-off. Recommend switching to the simplified 3-question structure.",
  "double": "**Double-Counting Issues Detected:**\n\n| Client | Reported Leads | True Leads | Inflation |\n|--------|---------------|------------|----------|\n| Richard Weinberg | 96 | 67 | +43% |\n| Jason Gilmore | 112 | 47 | +138% |\n| Matt Tixier | 8 | 5 | +60% |\n| Karpata Finance | 11 | 9 | +22% |\n\n**Root Cause:** Lead pixel fires on both the form submit AND the redirect/thank-you page.\n\n**Fix:** Remove the Lead event from the post-form redirect page on all affected accounts.",
  "default": "I've analyzed the portfolio data. Here's what I found:\n\n- **32 active clients** with a blended CPL of $38.42\n- **4 accounts** flagged for double-counting\n- **3 accounts** need form swaps (CVR < 5%)\n- **2 accounts** ready to scale (CPL < $15, stable frequency)\n\nWould you like me to drill into any specific area?",
};

function getResponse(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("audit") || lower.includes("weinberg") || lower.includes("richard")) return mockResponses.audit;
  if (lower.includes("form") || lower.includes("swap")) return mockResponses["form swap"];
  if (lower.includes("double") || lower.includes("counting")) return mockResponses.double;
  return mockResponses.default;
}

function detectClient(input: string) {
  const lower = input.toLowerCase();
  return clients.find(c => lower.includes(c.name.toLowerCase()) || lower.includes(c.brand.toLowerCase()));
}

export default function AiAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [detectedClient, setDetectedClient] = useState<typeof clients[0] | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const detected = detectClient(text);
    if (detected) setDetectedClient(detected);

    await new Promise(r => setTimeout(r, 1500));
    const aiMsg: Message = { id: (Date.now() + 1).toString(), role: "ai", content: getResponse(text), timestamp: new Date() };
    setMessages(prev => [...prev, aiMsg]);
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const recentActions = [
    { time: "2:32 PM", action: "Audit triggered for Rich Capital" },
    { time: "11:15 AM", action: "Tracking audit started" },
    { time: "9:00 AM", action: "Budget scaled for Win Capital" },
  ];

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Chat Panel (65%) */}
      <div className="flex-[65] flex flex-col rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <Bot className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">AI Operations Assistant</h2>
            <p className="text-xs text-muted-foreground">Powered by Claude + n8n <span className="inline-block h-1.5 w-1.5 rounded-full bg-success ml-1" /></p>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Bot className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-6">Ask me anything about your campaigns, clients, or performance</p>
              <div className="grid grid-cols-2 gap-2 max-w-md">
                {suggestions.map(s => (
                  <button key={s} onClick={() => sendMessage(s)} className="rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-accent hover:border-primary/40 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
                  <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0", msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-accent text-foreground")}>
                    {msg.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                  </div>
                  <div className={cn("rounded-lg px-4 py-3 max-w-[80%] text-sm", msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-accent border border-border text-foreground")}>
                    {msg.role === "ai" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:w-full [&_table]:text-xs [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:border-b [&_th]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:border-b [&_td]:border-border">
                        {msg.content.split("\n").map((line, i) => {
                          if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="font-semibold">{line.replace(/\*\*/g, "")}</p>;
                          if (line.startsWith("| ")) {
                            return null; // Simplified - render as text
                          }
                          if (line.startsWith("- ") || line.startsWith("1.")) return <p key={i} className="ml-2">{line}</p>;
                          return <p key={i}>{line.replace(/\*\*/g, "")}</p>;
                        })}
                      </div>
                    ) : msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center"><Bot className="h-3.5 w-3.5" /></div>
                  <div className="rounded-lg bg-accent border border-border px-4 py-3">
                    <div className="flex gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" /><span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.2s]" /><span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.4s]" /></div>
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
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about campaigns, clients, performance..."
              className="flex-1 resize-none rounded-lg border border-border bg-accent px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              rows={1}
            />
            <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Context Panel (35%) */}
      <div className="flex-[35] space-y-4">
        {detectedClient ? (
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Current Context</h3>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-semibold text-foreground">{detectedClient.name}</p>
              <StatusBadge status={detectedClient.status} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">CPL</span><p className="font-semibold">${detectedClient.cpl.toFixed(2)}</p></div>
              <div><span className="text-muted-foreground">Leads</span><p className="font-semibold">{detectedClient.leads}</p></div>
              <div><span className="text-muted-foreground">Form CVR</span><p className="font-semibold">{detectedClient.formCvr}%</p></div>
              <div><span className="text-muted-foreground">Double Count</span><p className="font-semibold">{detectedClient.doubleCount ? "Yes ⚠" : "No"}</p></div>
              <div className="col-span-2"><span className="text-muted-foreground">Last Audit</span><p className="font-semibold">{detectedClient.lastAudit}</p></div>
            </div>
            <Link to={`/client/${detectedClient.id}`} className="text-xs text-primary hover:underline mt-3 inline-flex items-center gap-1">
              Open Client Profile <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card p-5 text-center">
            <p className="text-xs text-muted-foreground">Mention a client name to see context here</p>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Recent AI Actions</h3>
          <div className="space-y-2">
            {recentActions.map((a, i) => (
              <div key={i} className="text-xs">
                <span className="text-muted-foreground">{a.time}</span>
                <p className="text-foreground">{a.action}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Quick Actions</h3>
          <div className="space-y-2">
            {["Run Audit", "Create Tasks", "Generate Report", "Scale Budget"].map(a => (
              <button key={a} onClick={() => toast.info(`${a} — connect n8n webhook in Settings`)} className="w-full rounded bg-accent px-3 py-2 text-xs font-medium text-foreground hover:bg-accent/80 text-left transition-colors">
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
