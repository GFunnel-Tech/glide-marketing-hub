import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, MessageSquare, Plus, Send } from "lucide-react";
import {
  useConversations, useMessages, useSendMessage, useCreateConversation,
  useMarkConversationRead,
} from "@/hooks/useMessages";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const fmtTime = (s: string) => {
  const d = new Date(s);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function Messages() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = searchParams.get("c");
  const { data: conversations = [], isLoading } = useConversations();
  const { data: messages = [] } = useMessages(activeId);
  const send = useSendMessage();
  const create = useCreateConversation();
  const markRead = useMarkConversationRead();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-select first conversation if none selected
  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setSearchParams({ c: conversations[0].id }, { replace: true });
    }
  }, [activeId, conversations, setSearchParams]);

  // Mark conversation as read on open / new message
  useEffect(() => {
    if (activeId) markRead.mutate(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, messages.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, activeId]);

  const onSend = async () => {
    if (!activeId || !draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    try {
      await send.mutateAsync({ conversationId: activeId, body });
    } catch (e: any) {
      toast.error(e.message || "Failed to send");
      setDraft(body);
    }
  };

  const onNewConversation = async () => {
    const subject = window.prompt("Subject for the new conversation?");
    if (subject === null) return;
    try {
      const conv = await create.mutateAsync(subject);
      setSearchParams({ c: conv.id });
    } catch (e: any) {
      toast.error(e.message || "Failed to create conversation");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Messages</h1>
          <p className="text-sm text-muted-foreground">
            Conversations with your team and (soon) support.
          </p>
        </div>
        <button
          onClick={onNewConversation}
          disabled={create.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          New conversation
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[480px]">
        {/* Conversation list */}
        <div className="rounded-lg border border-border bg-card overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No conversations yet</p>
              <button
                onClick={onNewConversation}
                className="text-xs text-primary hover:underline"
              >
                Start one
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSearchParams({ c: c.id })}
                    className={cn(
                      "w-full text-left px-3 py-3 hover:bg-accent/50 transition-colors",
                      activeId === c.id && "bg-accent"
                    )}
                  >
                    <p className="text-sm font-medium text-foreground truncate">{c.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{fmtTime(c.last_message_at)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Active conversation */}
        <div className="rounded-lg border border-border bg-card flex flex-col overflow-hidden">
          {!activeId ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a conversation
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    No messages yet — say hello.
                  </div>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_id === user?.id;
                    return (
                      <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                            mine
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-accent text-foreground rounded-bl-sm"
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <p className={cn("text-[10px] mt-1 opacity-70")}>
                            {new Date(m.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); onSend(); }}
                className="border-t border-border p-3 flex items-center gap-2"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1 h-10 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || send.isPending}
                  className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
