DROP POLICY IF EXISTS "ws_isolation" ON public.guest_acceptances;

CREATE POLICY "ws_isolation_read" ON public.guest_acceptances
FOR SELECT TO authenticated
USING (workspace_id = public.current_workspace());

CREATE POLICY "ws_isolation_delete" ON public.guest_acceptances
FOR DELETE TO authenticated
USING (workspace_id = public.current_workspace());

GRANT INSERT ON public.guest_acceptances TO anon;
GRANT SELECT, INSERT, DELETE ON public.guest_acceptances TO authenticated;
GRANT ALL ON public.guest_acceptances TO service_role;