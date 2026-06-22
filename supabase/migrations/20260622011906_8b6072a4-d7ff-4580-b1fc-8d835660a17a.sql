
-- 1) trainings: tighten update/delete, remove anon select
DROP POLICY IF EXISTS "Trainings update by authenticated" ON public.trainings;
DROP POLICY IF EXISTS "Trainings delete by authenticated" ON public.trainings;
CREATE POLICY "Trainings update by owner" ON public.trainings
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Trainings delete by owner" ON public.trainings
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by);
DROP POLICY IF EXISTS "Trainings readable by anon for public acceptance" ON public.trainings;

-- 2) training_attachments
DROP POLICY IF EXISTS "Attachments readable by anyone" ON public.training_attachments;
CREATE POLICY "Attachments readable by authenticated" ON public.training_attachments
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Attachments delete by authenticated" ON public.training_attachments;
CREATE POLICY "Attachments delete by uploader or training owner" ON public.training_attachments
  FOR DELETE TO authenticated
  USING (
    auth.uid() = uploaded_by
    OR EXISTS (SELECT 1 FROM public.trainings t WHERE t.id = training_id AND t.created_by = auth.uid())
  );

-- 3) training_reschedules
DROP POLICY IF EXISTS "Reschedules viewable by authenticated" ON public.training_reschedules;
CREATE POLICY "Reschedules viewable by training owner" ON public.training_reschedules
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.trainings t WHERE t.id = training_id AND t.created_by = auth.uid()));
DROP POLICY IF EXISTS "Reschedules insert by authenticated" ON public.training_reschedules;
CREATE POLICY "Reschedules insert by training owner" ON public.training_reschedules
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.trainings t WHERE t.id = training_id AND t.created_by = auth.uid()));

-- 4) training_acceptances
DROP POLICY IF EXISTS "Acceptances viewable by authenticated" ON public.training_acceptances;
CREATE POLICY "Acceptances viewable by self or training owner" ON public.training_acceptances
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.trainings t WHERE t.id = training_id AND t.created_by = auth.uid())
  );

-- 5) profiles
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Profiles viewable by self" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- 6) Public RPCs for guest acceptance flow (replace anon SELECT on trainings/attachments)
CREATE OR REPLACE FUNCTION public.get_public_training(_id uuid)
RETURNS TABLE(id uuid, title text, client text, description text, scheduled_at timestamptz, duration_minutes int, location text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.title, t.client, t.description, t.scheduled_at, t.duration_minutes, t.location
  FROM public.trainings t
  WHERE t.id = _id;
$$;
REVOKE ALL ON FUNCTION public.get_public_training(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_training(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_training_attachments(_training_id uuid)
RETURNS TABLE(id uuid, file_name text, mime_type text, size_bytes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.file_name, a.mime_type, a.size_bytes
  FROM public.training_attachments a
  WHERE a.training_id = _training_id;
$$;
REVOKE ALL ON FUNCTION public.get_public_training_attachments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_training_attachments(uuid) TO anon, authenticated;

-- 7) Controlled participant listing for signed-in users (replaces direct profiles join)
CREATE OR REPLACE FUNCTION public.get_training_user_acceptances(_training_id uuid)
RETURNS TABLE(id uuid, user_id uuid, accepted_at timestamptz, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ta.id, ta.user_id, ta.accepted_at, p.full_name, p.email
  FROM public.training_acceptances ta
  LEFT JOIN public.profiles p ON p.id = ta.user_id
  WHERE ta.training_id = _training_id
    AND auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_training_user_acceptances(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_training_user_acceptances(uuid) TO authenticated;
