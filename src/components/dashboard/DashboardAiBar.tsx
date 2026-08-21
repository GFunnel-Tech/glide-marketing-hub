import { useState } from "react";
import { ArrowUp, Sparkles, X, Plus } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AgentChat } from "@/components/ai/AgentChat";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const CHIPS = [
  "Which clients need attention today?",
  "Top 5 worst CPL this week",
  "Summarize spend vs leads for the last 7 days",
];

/**
 * Compact AI launcher that sits above Daily Focus. Typing a question opens an
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
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-4">
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                launch(value);
              }
            }}
            placeholder="Ask MetaHub about your portfolio…"
            className="w-full bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
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
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Powered by your AI operator
              </span>
            </div>
            <button
              type="button"
              onClick={() => launch(value)}
              disabled={!value.trim() || !workspaceId}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!open && (
          <div className="mt-3 flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => launch(c)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {open && workspaceId && (
        <div className="border-t border-border">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI conversation</span>
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
          <AgentChat
            key={seed}
            workspaceId={workspaceId}
            clientId={null}
            endpoint="ai-ops-chat"
            initialPrompt={seed}
            className={cn("h-[420px] border-0 rounded-none")}
          />
        </div>
      )}
    </div>
  );
}
