GRANT INSERT ON public.guest_acceptances TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_acceptances TO authenticated;
GRANT ALL ON public.guest_acceptances TO service_role;