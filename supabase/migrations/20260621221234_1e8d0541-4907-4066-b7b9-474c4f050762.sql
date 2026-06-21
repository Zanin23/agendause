ALTER TABLE public.trainings 
  ADD COLUMN IF NOT EXISTS confirmed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid;