CREATE TABLE public.company_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company text NOT NULL,
  note_date date NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_notes TO authenticated;
GRANT ALL ON public.company_notes TO service_role;

ALTER TABLE public.company_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view all company notes"
  ON public.company_notes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own company notes"
  ON public.company_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own company notes"
  ON public.company_notes FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own company notes"
  ON public.company_notes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_company_notes_company ON public.company_notes(company);
CREATE INDEX idx_company_notes_date ON public.company_notes(note_date DESC);

CREATE TRIGGER update_company_notes_updated_at
  BEFORE UPDATE ON public.company_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();