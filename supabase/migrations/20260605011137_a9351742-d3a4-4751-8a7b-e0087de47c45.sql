ALTER TABLE public.workspace_kpi_settings
  ADD COLUMN IF NOT EXISTS default_window_days integer NOT NULL DEFAULT 30;