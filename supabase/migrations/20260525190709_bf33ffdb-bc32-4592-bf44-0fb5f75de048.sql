
CREATE TABLE public.ai_action_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id integer,
  event text NOT NULL CHECK (event IN ('proposed','approved','executed','failed','cancelled','status_changed')),
  action_type text NOT NULL,
  payload jsonb,
  reasoning text,
  result jsonb,
  error_message text,
  prev_status text,
  new_status text,
  actor_id uuid,
  actor_kind text NOT NULL DEFAULT 'system' CHECK (actor_kind IN ('ai','user','system','schedule')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_audit_ws_time ON public.ai_action_audit_log (workspace_id, occurred_at DESC);
CREATE INDEX idx_ai_audit_client_time ON public.ai_action_audit_log (client_id, occurred_at DESC);
CREATE INDEX idx_ai_audit_action ON public.ai_action_audit_log (action_id, occurred_at);

ALTER TABLE public.ai_action_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members view audit log" ON public.ai_action_audit_log
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "system can insert audit log" ON public.ai_action_audit_log
  FOR INSERT WITH CHECK (true);
-- No UPDATE or DELETE policies → append-only.

-- Trigger function
CREATE OR REPLACE FUNCTION public.audit_ai_pending_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event text;
  _actor_id uuid;
  _actor_kind text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := 'proposed';
    _actor_id := NEW.proposed_by;
    _actor_kind := 'ai';
    INSERT INTO public.ai_action_audit_log (
      action_id, workspace_id, client_id, event, action_type,
      payload, reasoning, prev_status, new_status, actor_id, actor_kind, occurred_at
    ) VALUES (
      NEW.id, NEW.workspace_id, NEW.client_id, _event, NEW.action_type,
      NEW.payload, NEW.reasoning, NULL, NEW.status, _actor_id, _actor_kind, NEW.created_at
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    _event := CASE NEW.status
      WHEN 'approved' THEN 'approved'
      WHEN 'executed' THEN 'executed'
      WHEN 'failed' THEN 'failed'
      WHEN 'cancelled' THEN 'cancelled'
      ELSE 'status_changed'
    END;
    _actor_id := COALESCE(NEW.approved_by, NEW.proposed_by);
    _actor_kind := CASE WHEN NEW.approved_by IS NOT NULL AND NEW.approved_by <> NEW.proposed_by
                        THEN 'user' ELSE 'ai' END;
    INSERT INTO public.ai_action_audit_log (
      action_id, workspace_id, client_id, event, action_type,
      payload, reasoning, result, error_message,
      prev_status, new_status, actor_id, actor_kind,
      occurred_at
    ) VALUES (
      NEW.id, NEW.workspace_id, NEW.client_id, _event, NEW.action_type,
      NEW.payload, NEW.reasoning, NEW.result, NEW.error_message,
      OLD.status, NEW.status, _actor_id, _actor_kind,
      COALESCE(NEW.executed_at, NEW.approved_at, now())
    );
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_audit_ai_pending_insert
  AFTER INSERT ON public.ai_pending_actions
  FOR EACH ROW EXECUTE FUNCTION public.audit_ai_pending_action();

CREATE TRIGGER trg_audit_ai_pending_update
  AFTER UPDATE ON public.ai_pending_actions
  FOR EACH ROW EXECUTE FUNCTION public.audit_ai_pending_action();

-- Backfill existing actions
INSERT INTO public.ai_action_audit_log
  (action_id, workspace_id, client_id, event, action_type, payload, reasoning, prev_status, new_status, actor_id, actor_kind, occurred_at)
SELECT id, workspace_id, client_id, 'proposed', action_type, payload, reasoning, NULL, 'pending', proposed_by, 'ai', created_at
FROM public.ai_pending_actions;

INSERT INTO public.ai_action_audit_log
  (action_id, workspace_id, client_id, event, action_type, payload, reasoning, result, error_message, prev_status, new_status, actor_id, actor_kind, occurred_at)
SELECT id, workspace_id, client_id,
  CASE status WHEN 'executed' THEN 'executed' WHEN 'failed' THEN 'failed' WHEN 'cancelled' THEN 'cancelled' WHEN 'approved' THEN 'approved' ELSE 'status_changed' END,
  action_type, payload, reasoning, result, error_message, 'pending', status,
  COALESCE(approved_by, proposed_by), 'ai',
  COALESCE(executed_at, approved_at, created_at)
FROM public.ai_pending_actions
WHERE status <> 'pending';
