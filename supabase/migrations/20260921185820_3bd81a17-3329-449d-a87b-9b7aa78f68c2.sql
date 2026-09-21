CREATE TABLE public.process_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.implementation_schedules(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Levantamento de Processos',
  intro text,
  status text NOT NULL DEFAULT 'draft',
  public_token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  respondent_name text,
  respondent_email text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.survey_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.process_surveys(id) ON DELETE CASCADE,
  section text,
  position integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  help_text text,
  type text NOT NULL DEFAULT 'text',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.survey_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.process_surveys(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.survey_questions(id) ON DELETE CASCADE,
  value text,
  value_json jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (survey_id, question_id)
);

CREATE TABLE public.survey_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.process_surveys(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.survey_questions(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  mime_type text,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_process_surveys_schedule ON public.process_surveys(schedule_id);
CREATE INDEX idx_survey_questions_survey ON public.survey_questions(survey_id, position);
CREATE INDEX idx_survey_answers_survey ON public.survey_answers(survey_id);
CREATE INDEX idx_survey_files_survey ON public.survey_files(survey_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_surveys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_answers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_files TO authenticated;
GRANT ALL ON public.process_surveys TO service_role;
GRANT ALL ON public.survey_questions TO service_role;
GRANT ALL ON public.survey_answers TO service_role;
GRANT ALL ON public.survey_files TO service_role;

ALTER TABLE public.process_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view surveys" ON public.process_surveys FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert surveys" ON public.process_surveys FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update surveys" ON public.process_surveys FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth delete surveys" ON public.process_surveys FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "auth view survey questions" ON public.survey_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert survey questions" ON public.survey_questions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update survey questions" ON public.survey_questions FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth delete survey questions" ON public.survey_questions FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "auth view survey answers" ON public.survey_answers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write survey answers" ON public.survey_answers FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update survey answers" ON public.survey_answers FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth delete survey answers" ON public.survey_answers FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "auth view survey files" ON public.survey_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert survey files" ON public.survey_files FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth delete survey files" ON public.survey_files FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_process_surveys_updated_at BEFORE UPDATE ON public.process_surveys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.set_survey_workspace_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.implementation_schedules WHERE id = NEW.schedule_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER set_survey_workspace_id_trg BEFORE INSERT ON public.process_surveys
  FOR EACH ROW EXECUTE FUNCTION public.set_survey_workspace_id();

CREATE OR REPLACE FUNCTION public.get_survey_by_token(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', sv.id,
    'title', sv.title,
    'intro', sv.intro,
    'status', sv.status,
    'respondent_name', sv.respondent_name,
    'respondent_email', sv.respondent_email,
    'submitted_at', sv.submitted_at,
    'client_name', s.client_name,
    'questions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id, 'section', q.section, 'position', q.position, 'label', q.label,
        'help_text', q.help_text, 'type', q.type, 'options', q.options, 'required', q.required,
        'answer', (SELECT jsonb_build_object('value', a.value, 'value_json', a.value_json)
                   FROM public.survey_answers a WHERE a.question_id = q.id)
      ) ORDER BY q.position)
      FROM public.survey_questions q WHERE q.survey_id = sv.id
    ), '[]'::jsonb),
    'files', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', f.id, 'question_id', f.question_id,
        'file_path', f.file_path, 'file_name', f.file_name, 'file_size', f.file_size,
        'created_at', f.created_at) ORDER BY f.created_at)
      FROM public.survey_files f WHERE f.survey_id = sv.id
    ), '[]'::jsonb)
  ) INTO result
  FROM public.process_surveys sv
  JOIN public.implementation_schedules s ON s.id = sv.schedule_id
  WHERE sv.public_token = _token;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.save_survey_answers(
  _token text, _respondent_name text, _respondent_email text,
  _answers jsonb, _finalize boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sv public.process_surveys;
  a jsonb;
BEGIN
  SELECT * INTO sv FROM public.process_surveys WHERE public_token = _token;
  IF sv.id IS NULL THEN RAISE EXCEPTION 'Questionário não encontrado'; END IF;
  IF sv.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Questionário já finalizado'; END IF;

  FOR a IN SELECT * FROM jsonb_array_elements(COALESCE(_answers, '[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.survey_questions q
                   WHERE q.id = (a->>'question_id')::uuid AND q.survey_id = sv.id) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.survey_answers (survey_id, question_id, value, value_json, updated_at)
    VALUES (sv.id, (a->>'question_id')::uuid, a->>'value', a->'value_json', now())
    ON CONFLICT (survey_id, question_id)
      DO UPDATE SET value = EXCLUDED.value, value_json = EXCLUDED.value_json, updated_at = now();
  END LOOP;

  UPDATE public.process_surveys SET
    respondent_name = COALESCE(NULLIF(_respondent_name, ''), respondent_name),
    respondent_email = COALESCE(NULLIF(_respondent_email, ''), respondent_email),
    status = CASE WHEN _finalize THEN 'submitted' ELSE 'sent' END,
    submitted_at = CASE WHEN _finalize THEN now() ELSE submitted_at END,
    updated_at = now()
  WHERE id = sv.id;

  RETURN jsonb_build_object('ok', true, 'finalized', _finalize);
END; $$;

CREATE OR REPLACE FUNCTION public.register_survey_file(
  _token text, _question_id uuid, _file_path text, _file_name text,
  _file_size bigint, _mime_type text, _uploaded_by_name text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sv_id uuid; new_id uuid;
BEGIN
  SELECT id INTO sv_id FROM public.process_surveys WHERE public_token = _token AND submitted_at IS NULL;
  IF sv_id IS NULL THEN RAISE EXCEPTION 'Questionário não encontrado ou já finalizado'; END IF;
  INSERT INTO public.survey_files (survey_id, question_id, file_path, file_name, file_size, mime_type, uploaded_by_name)
  VALUES (sv_id, _question_id, _file_path, _file_name, _file_size, _mime_type, _uploaded_by_name)
  RETURNING id INTO new_id;
  RETURN new_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_survey_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_survey_answers(text, text, text, jsonb, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_survey_file(text, uuid, text, text, bigint, text, text) TO anon, authenticated;

CREATE POLICY "Anyone can upload survey files" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'survey-files');
CREATE POLICY "Team can read survey files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'survey-files');
CREATE POLICY "Team can delete survey files" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'survey-files');