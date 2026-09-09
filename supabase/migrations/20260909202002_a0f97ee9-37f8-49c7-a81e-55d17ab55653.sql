-- Allow any authenticated user to update schedules/phases/items (mirrors the global read policies).
CREATE POLICY "Authenticated update schedules" ON public.implementation_schedules
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated update phases" ON public.schedule_phases
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated update items" ON public.schedule_items
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);