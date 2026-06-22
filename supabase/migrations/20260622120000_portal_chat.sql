-- Portal chat
-- ------------------------------------------------------------------
-- Each portal user gets a single dedicated conversation thread per client,
-- routed to that client's point of contact. We reuse the existing
-- conversations / messages / conversation_participants infrastructure and just
-- add the linkage columns the portal flow needs.

-- Point of contact for a client (e.g. the account manager "Tim"). Nullable:
-- when unset the portal-chat edge function falls back to the workspace owner.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS point_of_contact_user_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Link a conversation to the client + the specific portal user it belongs to.
-- These stay NULL for ordinary internal (agency) conversations.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS client_id integer
    REFERENCES public.clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS portal_user_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

-- One dedicated portal thread per (portal user, client) — lets the edge
-- function find-or-create idempotently.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_portal_thread
  ON public.conversations (portal_user_id, client_id)
  WHERE portal_user_id IS NOT NULL AND client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_client
  ON public.conversations (client_id);

-- Access note: portal users and the resolved point of contact are added as
-- conversation participants by the portal-chat function, so the existing
-- participant-based RLS policies on conversations/messages already grant both
-- sides read + send. No additional policies are required here.
