ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS vertical text;
CREATE INDEX IF NOT EXISTS idx_clients_country ON public.clients(country);
CREATE INDEX IF NOT EXISTS idx_clients_vertical ON public.clients(vertical);