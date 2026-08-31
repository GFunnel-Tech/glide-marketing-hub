import { useState } from "react";
import { ArrowUp, X, Plus, MessageSquareText } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AgentChat } from "@/components/ai/AgentChat";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const CHIPS = [
  "Which clients need attention today?",
  "Top 5 worst CPL this week",
  "Summarize spend vs leads for 7 days",
];

/**
 * Gradient banner with the AI prompt centered inside — no card container.
 * Typing a question opens an inline portfolio-aware chat (ai-ops-chat).
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

  if (open) {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
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
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#0b1026]">
      {/* gradient sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(120% 120% at 85% -10%, rgba(168,85,247,0.45) 0%, rgba(60,102,245,0.28) 35%, rgba(11,16,38,0) 70%)",
        }}
      />
      <div className="relative flex flex-col items-center px-5 py-6 text-center sm:py-8">
        <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
          How may we help you today?
        </h2>
        <p className="mt-1 max-w-xl text-xs text-white/70 sm:text-sm">
          Audit a client, pause bad ads, pull a report, or scale a winner — your AI operator has the live data.
        </p>

        {/* compact prompt box */}
        <div className="mt-4 flex w-full max-w-xl items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-2.5 py-1.5 backdrop-blur-sm transition-colors focus-within:border-white/35">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                launch(value);
              }
            }}
            placeholder="Ask Glide Media about your portfolio…"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/55 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => navigate("/ai")}
            title="Open full AI assistant"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 text-white/70 hover:bg-white/10"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => launch(value)}
            disabled={!value.trim() || !workspaceId}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-primary-foreground shadow-[0_0_0_3px_hsl(var(--primary)/0.25)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* chips */}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => launch(c)}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 transition-colors hover:border-white/35 hover:text-white"
            >
              {c}
            </button>
          ))}
        </div>

        <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-white/55">
          <MessageSquareText className="h-3 w-3" />
          Powered by your AI operator
        </span>
      </div>
    </div>
  );
}
