ALTER TABLE public.implementation_schedules
  ADD COLUMN IF NOT EXISTS paused_at date,
  ADD COLUMN IF NOT EXISTS pause_reason text;