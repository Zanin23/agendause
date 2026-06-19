
CREATE TABLE public.guest_acceptances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  training_id UUID NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX guest_acceptances_training_idx ON public.guest_acceptances(training_id);

GRANT SELECT, INSERT ON public.guest_acceptances TO anon;
GRANT SELECT, INSERT, DELETE ON public.guest_acceptances TO authenticated;
GRANT ALL ON public.guest_acceptances TO service_role;

ALTER TABLE public.guest_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert guest acceptance"
  ON public.guest_acceptances FOR INSERT
  TO anon, authenticated
  WITH CHECK (length(trim(full_name)) > 0);

CREATE POLICY "Guest acceptances readable by authenticated"
  ON public.guest_acceptances FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can delete guest acceptances"
  ON public.guest_acceptances FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Allow anonymous read of trainings (only the public link page needs basic info)
GRANT SELECT ON public.trainings TO anon;
CREATE POLICY "Trainings readable by anon for public acceptance"
  ON public.trainings FOR SELECT
  TO anon
  USING (true);
