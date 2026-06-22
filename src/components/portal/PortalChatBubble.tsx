import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMessages, useSendMessage, useMarkConversationRead } from "@/hooks/useMessages";
import { usePortalThread } from "@/hooks/usePortalChat";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const fmtTime = (s: string) =>
  new Date(s).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * Floating chat bubble for the client portal. The portal user types here and
 * the message is delivered to their client's point of contact. Each portal user
 * has their own dedicated thread (provisioned by the portal-chat edge function),
 * so the conversation syncs to just them.
 */
export function PortalChatBubble() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Only provision the thread once the user opens the bubble.
  const thread = usePortalThread(open);
  const conversationId = thread.data?.conversation_id ?? null;

  const { data: messages = [] } = useMessages(conversationId);
  const send = useSendMessage();
  const markRead = useMarkConversationRead();

  // Mark read on open and whenever new messages arrive while open.
  useEffect(() => {
    if (open && conversationId) markRead.mutate(conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversationId, messages.length]);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, open]);

  const onSend = async () => {
    if (!conversationId || !draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    try {
      await send.mutateAsync({ conversationId, body });
    } catch (e: any) {
      toast.error(e.message || "Failed to send");
      setDraft(body);
    }
  };

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Open chat"}
        className={cn(
          "fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-colors",
          "bottom-20 md:bottom-6", // clear the mobile bottom nav
          "bg-[hsl(var(--primary))] text-primary-foreground hover:bg-[hsl(var(--primary))]/90",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Panel */}
      {open && (
        <div
          className={cn(
            "fixed right-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl",
            "bottom-36 md:bottom-24",
            "w-[min(22rem,calc(100vw-2rem))] h-[28rem] max-h-[calc(100vh-10rem)]",
          )}
        >
          <header className="flex items-center gap-3 border-b border-border bg-[hsl(var(--primary))] px-4 py-3 text-primary-foreground">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Chat with your team</p>
              <p className="text-[11px] text-white/70">We typically reply within a few hours</p>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {thread.isLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : thread.isError ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                Couldn't start the chat. Please try again in a moment.
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                Send us a message — your account manager will get it right away.
              </div>
            ) : (
              messages.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                        mine
                          ? "rounded-br-sm bg-[hsl(var(--primary))] text-primary-foreground"
                          : "rounded-bl-sm bg-accent text-accent-foreground",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className="mt-1 text-[10px] opacity-70">{fmtTime(m.created_at)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSend();
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message…"
              disabled={!conversationId}
              className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!conversationId || !draft.trim() || send.isPending}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[hsl(var(--primary))] text-primary-foreground hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50"
            >
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
