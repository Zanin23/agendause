DROP POLICY IF EXISTS "Guest acceptances readable by authenticated" ON public.guest_acceptances;
DROP POLICY IF EXISTS "Authenticated can delete guest acceptances" ON public.guest_acceptances;

DROP POLICY IF EXISTS "Authenticated can view handoff terms" ON public.handoff_terms;
DROP POLICY IF EXISTS "Authenticated can insert handoff terms" ON public.handoff_terms;
DROP POLICY IF EXISTS "Authenticated can update handoff terms" ON public.handoff_terms;
DROP POLICY IF EXISTS "Authenticated can delete handoff terms" ON public.handoff_terms;

CREATE POLICY "ws_isolation_read" ON public.handoff_terms FOR SELECT TO authenticated USING (workspace_id = current_workspace());
CREATE POLICY "ws_isolation_insert" ON public.handoff_terms FOR INSERT TO authenticated WITH CHECK (workspace_id = current_workspace() AND auth.uid() IS NOT NULL);
CREATE POLICY "ws_isolation_update" ON public.handoff_terms FOR UPDATE TO authenticated USING (workspace_id = current_workspace()) WITH CHECK (workspace_id = current_workspace());
CREATE POLICY "ws_isolation_delete" ON public.handoff_terms FOR DELETE TO authenticated USING (workspace_id = current_workspace());