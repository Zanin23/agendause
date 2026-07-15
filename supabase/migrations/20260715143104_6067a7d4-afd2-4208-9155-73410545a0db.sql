DROP POLICY IF EXISTS "Trainings update by owner" ON public.trainings;
CREATE POLICY "Trainings update by workspace member"
ON public.trainings FOR UPDATE
USING (workspace_id = public.current_workspace())
WITH CHECK (workspace_id = public.current_workspace());