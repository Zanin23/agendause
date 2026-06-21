-- training_reschedules
CREATE TABLE public.training_reschedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id uuid NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  previous_scheduled_at timestamptz NOT NULL,
  new_scheduled_at timestamptz NOT NULL,
  previous_duration_minutes integer NOT NULL,
  new_duration_minutes integer NOT NULL,
  reason text NOT NULL,
  changed_by uuid,
  changed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.training_reschedules TO authenticated;
GRANT ALL ON public.training_reschedules TO service_role;

ALTER TABLE public.training_reschedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reschedules viewable by authenticated"
  ON public.training_reschedules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Reschedules insert by authenticated"
  ON public.training_reschedules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_training_reschedules_training ON public.training_reschedules(training_id, created_at DESC);


-- training_attachments
CREATE TABLE public.training_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id uuid NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.training_attachments TO anon;
GRANT SELECT, INSERT, DELETE ON public.training_attachments TO authenticated;
GRANT ALL ON public.training_attachments TO service_role;

ALTER TABLE public.training_attachments ENABLE ROW LEVEL SECURITY;

-- Public read so the guest accept page can list them (storage path still requires signed URL)
CREATE POLICY "Attachments readable by anyone"
  ON public.training_attachments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Attachments insert by authenticated"
  ON public.training_attachments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Attachments delete by authenticated"
  ON public.training_attachments FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE INDEX idx_training_attachments_training ON public.training_attachments(training_id, created_at DESC);
