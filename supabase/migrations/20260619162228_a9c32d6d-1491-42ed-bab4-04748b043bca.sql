
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Trainings update by authenticated" ON public.trainings;
DROP POLICY IF EXISTS "Trainings delete by authenticated" ON public.trainings;
CREATE POLICY "Trainings update by authenticated" ON public.trainings FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Trainings delete by authenticated" ON public.trainings FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
