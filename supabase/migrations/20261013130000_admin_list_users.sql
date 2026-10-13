-- A leitura administrativa não depende do deploy das Edge Functions.
-- Não libera SELECT em auth.users: somente esta resposta limitada, para admins.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'full_name', COALESCE(p.full_name, u.raw_user_meta_data ->> 'full_name'),
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'email_confirmed', u.email_confirmed_at IS NOT NULL,
        'workspace', w.name,
        'roles', COALESCE((
          SELECT jsonb_agg(r.role ORDER BY r.role)
          FROM public.user_roles r WHERE r.user_id = u.id
        ), '[]'::jsonb),
        'screen_permissions', COALESCE(perms.screen_permissions, '[]'::jsonb),
        'schedule_permissions', COALESCE(perms.schedule_permissions, '{}'::jsonb)
      ) ORDER BY u.created_at DESC, u.id)
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.id = u.id
      LEFT JOIN public.workspaces w ON w.id = p.active_workspace_id
      LEFT JOIN public.user_roles perms ON perms.user_id = u.id AND perms.role = 'member'
    ), '[]'::jsonb),
    'all_schedules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'client_name', s.client_name)
                       ORDER BY s.client_name, s.id)
      FROM public.implementation_schedules s
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
COMMENT ON FUNCTION public.admin_list_users() IS
  'Lista contas e permissões somente para admins autenticados; nunca retorna senhas, tokens ou identidades.';

COMMIT;
