DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT ON public.profiles TO authenticated;