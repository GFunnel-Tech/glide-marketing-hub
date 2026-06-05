-- Add contact fields to team_members so the Team settings section can capture
-- email and phone for each staff member (mirrors the staff directory UI).
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS phone TEXT;
