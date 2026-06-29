ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS brief_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS brief_recipients TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS brief_seasonal_context TEXT;

ALTER TABLE public.workspace_kpi_settings
  ADD COLUMN IF NOT EXISTS brief_cpm_spike_pct NUMERIC NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS brief_cpl_spike_pct NUMERIC NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS brief_leads_drop_pct NUMERIC NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS brief_weekly_digest_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS brief_auto_detect_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.client_trend_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('cpm_spike','cpl_spike','leads_drop','weekly_digest','manual','seasonal')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  seasonal_context TEXT,
  subject TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  body_html TEXT,
  recipients TEXT[] NOT NULL DEFAULT '{}'::text[],
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected','sent','failed')),
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_notes TEXT,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error TEXT,
  dedupe_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_trend_briefs_ws_status ON public.client_trend_briefs(workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_trend_briefs_client ON public.client_trend_briefs(client_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_trend_briefs_dedupe ON public.client_trend_briefs(client_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_trend_briefs TO authenticated;
GRANT ALL ON public.client_trend_briefs TO service_role;

ALTER TABLE public.client_trend_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view briefs"
  ON public.client_trend_briefs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = client_trend_briefs.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "Workspace members can insert briefs"
  ON public.client_trend_briefs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = client_trend_briefs.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "Workspace members can update briefs"
  ON public.client_trend_briefs FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = client_trend_briefs.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "Workspace members can delete briefs"
  ON public.client_trend_briefs FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = client_trend_briefs.workspace_id AND wm.user_id = auth.uid()));

CREATE TRIGGER set_client_trend_briefs_updated_at
  BEFORE UPDATE ON public.client_trend_briefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();