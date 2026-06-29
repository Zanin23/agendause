ALTER TABLE public.billing_requests
  ADD COLUMN IF NOT EXISTS carried_over_to date,
  ADD COLUMN IF NOT EXISTS carried_over_from_id uuid REFERENCES public.billing_requests(id) ON DELETE SET NULL;