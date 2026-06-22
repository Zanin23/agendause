
-- Allow all authenticated users to read schedules and their nested data
CREATE POLICY "Authenticated read schedules" ON public.implementation_schedules
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated read phases" ON public.schedule_phases
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated read items" ON public.schedule_items
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated read comments" ON public.schedule_comments
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
