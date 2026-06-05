-- Unified outbound webhooks: a single endpoint can subscribe to any number of
-- events (status indicators, signals, custom-KPI alerts, or custom keys) and the
-- payload is delivered to external software (n8n, Slack relays, Zapier, etc.).

-- ---------------------------------------------------------------------------
-- 1. Endpoints table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  description text,
  -- Event keys this endpoint listens to. Empty array OR '*' means "all events".
  events text[] NOT NULL DEFAULT '{}',
  -- Optional shared secret, delivered as the X-Webhook-Secret header so the
  -- receiver can verify authenticity.
  secret text,
  -- Optional extra headers merged into every request (e.g. Authorization).
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_status text,
  last_error text,
  last_fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_ws
  ON public.webhook_endpoints (workspace_id);

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view webhook_endpoints" ON public.webhook_endpoints
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners/admins insert webhook_endpoints" ON public.webhook_endpoints
  FOR INSERT WITH CHECK (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins update webhook_endpoints" ON public.webhook_endpoints
  FOR UPDATE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));
CREATE POLICY "Owners/admins delete webhook_endpoints" ON public.webhook_endpoints
  FOR DELETE USING (public.workspace_role_of(auth.uid(), workspace_id) IN ('owner','admin'));

DROP TRIGGER IF EXISTS update_webhook_endpoints_updated_at ON public.webhook_endpoints;
CREATE TRIGGER update_webhook_endpoints_updated_at
  BEFORE UPDATE ON public.webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Delivery log (so the UI can show recent fires + debugging)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint
  ON public.webhook_deliveries (endpoint_id, created_at DESC);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view webhook_deliveries" ON public.webhook_deliveries
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));

-- ---------------------------------------------------------------------------
-- 3. Central dispatcher. Fans an event out to every matching endpoint.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_webhook_event(
  _workspace_id uuid,
  _event text,
  _payload jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ep RECORD;
  _body jsonb;
  _headers jsonb;
BEGIN
  IF _workspace_id IS NULL OR _event IS NULL THEN RETURN; END IF;

  FOR _ep IN
    SELECT * FROM public.webhook_endpoints
    WHERE workspace_id = _workspace_id
      AND enabled = true
      AND url IS NOT NULL AND length(url) > 0
      AND (
        events IS NULL
        OR array_length(events, 1) IS NULL  -- empty => all events
        OR '*' = ANY(events)
        OR _event = ANY(events)
      )
  LOOP
    _body := jsonb_build_object(
      'event', _event,
      'workspace_id', _workspace_id,
      'timestamp', now(),
      'data', COALESCE(_payload, '{}'::jsonb)
    );

    _headers := '{"Content-Type":"application/json"}'::jsonb
      || COALESCE(_ep.headers, '{}'::jsonb)
      || jsonb_build_object('X-Webhook-Event', _event);
    IF _ep.secret IS NOT NULL AND length(_ep.secret) > 0 THEN
      _headers := _headers || jsonb_build_object('X-Webhook-Secret', _ep.secret);
    END IF;

    BEGIN
      PERFORM net.http_post(url := _ep.url, headers := _headers, body := _body);
      UPDATE public.webhook_endpoints
        SET last_status = 'sent', last_error = NULL, last_fired_at = now()
        WHERE id = _ep.id;
      INSERT INTO public.webhook_deliveries (workspace_id, endpoint_id, event, payload, status)
        VALUES (_workspace_id, _ep.id, _event, _body, 'sent');
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.webhook_endpoints
        SET last_status = 'error', last_error = SQLERRM, last_fired_at = now()
        WHERE id = _ep.id;
      INSERT INTO public.webhook_deliveries (workspace_id, endpoint_id, event, payload, status, error)
        VALUES (_workspace_id, _ep.id, _event, _body, 'error', SQLERRM);
    END;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_webhook_event(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
-- Allow edge functions (service role) to fan out events explicitly, e.g. custom-KPI alerts.
GRANT EXECUTE ON FUNCTION public.dispatch_webhook_event(uuid, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Indicators: extend the status-change trigger to fan out to endpoints.
--    (Keeps the legacy per-phase webhook_url firing for backward compatibility.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_status_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _url text; _payload jsonb;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Stamp launched_at the first time a client enters LAUNCHING
    IF NEW.status::text = 'LAUNCHING' AND NEW.launched_at IS NULL THEN
      NEW.launched_at := now();
    END IF;

    _payload := jsonb_build_object(
      'client_id', NEW.id,
      'client_name', NEW.name,
      'brand', NEW.brand,
      'old_status', OLD.status,
      'new_status', NEW.status
    );

    -- Legacy: per-phase webhook URL configured on the status row.
    SELECT webhook_url INTO _url
      FROM public.client_status_phases
      WHERE workspace_id = NEW.workspace_id
        AND status_key = NEW.status::text
        AND enabled = true;

    IF _url IS NOT NULL AND length(_url) > 0 THEN
      PERFORM net.http_post(
        url := _url,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object('event','client.status_changed','timestamp',now()) || _payload
      );
    END IF;

    -- Unified endpoints: fire both the generic "any status change" event and
    -- the specific "entered <STATUS>" event so subscribers can target either.
    PERFORM public.dispatch_webhook_event(NEW.workspace_id, 'status.changed', _payload);
    PERFORM public.dispatch_webhook_event(NEW.workspace_id, 'status.' || NEW.status::text, _payload);
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Signals: any notification row fans out to subscribed endpoints. A single
--    logical signal inserts one notification row per workspace member, so we
--    use a STATEMENT-level trigger with the NEW transition table and collapse
--    duplicates by (workspace_id, type, meta) to fire each webhook just once.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_notification_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row RECORD;
BEGIN
  FOR _row IN
    SELECT DISTINCT ON (workspace_id, type, COALESCE(meta, '{}'::jsonb))
      workspace_id, type, title, body, link, meta
    FROM newrows
    WHERE workspace_id IS NOT NULL
  LOOP
    PERFORM public.dispatch_webhook_event(
      _row.workspace_id,
      _row.type,
      jsonb_build_object(
        'type', _row.type,
        'title', _row.title,
        'body', _row.body,
        'link', _row.link,
        'meta', _row.meta
      )
    );
  END LOOP;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS notifications_dispatch_webhook ON public.notifications;
CREATE TRIGGER notifications_dispatch_webhook
  AFTER INSERT ON public.notifications
  REFERENCING NEW TABLE AS newrows
  FOR EACH STATEMENT EXECUTE FUNCTION public.dispatch_notification_webhook();
