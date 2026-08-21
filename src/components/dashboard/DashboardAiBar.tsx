import { useState } from "react";
import { ArrowUp, X, Plus, MessageSquareText } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AgentChat } from "@/components/ai/AgentChat";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const CHIPS = [
  "Which clients need attention today?",
  "Top 5 worst CPL this week",
  "Summarize spend vs leads for the last 7 days",
  "Which ad sets should I scale up?",
];

/**
 * Prominent AI launcher that sits above Daily Focus. Typing a question opens an
 * inline portfolio-aware chat (ai-ops-chat) seeded with that question.
 */
export function DashboardAiBar() {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<string | undefined>();

  const launch = (text: string) => {
    const q = text.trim();
    if (!q || !workspaceId) return;
    setSeed(q);
    setOpen(true);
    setValue("");
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {!open ? (
        <div className="relative px-5 py-8 sm:px-8 sm:py-10">
          {/* Header */}
          <div className="mx-auto mb-6 max-w-2xl text-center">
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              How may we help you today?
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Audit a client, pause bad ads, pull a report, or scale a winner — your AI operator has the live data.
            </p>
          </div>

          {/* Prompt box */}
          <div className="mx-auto max-w-2xl">
            <div className="rounded-2xl border border-border bg-muted/40 p-2 shadow-sm transition-colors focus-within:border-primary/50">
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    launch(value);
                  }
                }}
                placeholder="Ask MetaHub about your portfolio…"
                rows={2}
                className="w-full resize-none bg-transparent px-3 py-2 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <div className="flex items-center justify-between gap-3 px-1 pb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate("/ai")}
                    title="Open full AI assistant"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                    <MessageSquareText className="h-3.5 w-3.5 text-primary" />
                    Powered by your AI operator
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => launch(value)}
                  disabled={!value.trim() || !workspaceId}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_0_3px_hsl(var(--primary)/0.18)] transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Suggestion chips */}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => launch(c)}
                  className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                <MessageSquareText className="h-3.5 w-3.5" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                AI conversation
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSeed(undefined);
              }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Close
            </button>
          </div>
          {workspaceId && (
            <AgentChat
              key={seed}
              workspaceId={workspaceId}
              clientId={null}
              endpoint="ai-ops-chat"
              initialPrompt={seed}
              className={cn("h-[460px] border-0 rounded-none")}
            />
          )}
        </div>
      )}
    </div>
  );
}
