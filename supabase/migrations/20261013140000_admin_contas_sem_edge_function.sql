-- ============================================================================
-- CONTROLE DE ACESSOS — criar conta, definir senha e mexer em permissões
-- sem depender do deploy da Edge Function `admin-users`.
--
-- Por que existe: a listagem de contas já usa a RPC admin_list_users
-- (20261013130000), então a tela abre mesmo sem a Edge Function publicada.
-- Criar conta, definir senha, tornar admin e salvar permissões continuavam
-- chamando `admin-users` — e quem não publicou a função não consegue criar
-- usuários ("Failed to send a request to the Edge Function" / 404).
--
-- Estas funções fazem o mesmo trabalho dentro do banco, com as mesmas regras:
--   * exigem sessão autenticada (auth.uid()) E role 'admin' na tabela user_roles;
--   * não abrem SELECT em auth.users para ninguém (nem para admin): apenas
--     gravam o necessário por dentro de funções SECURITY DEFINER;
--   * nunca devolvem senha, hash ou token.
--
-- A Edge Function continua válida: se ela estiver publicada, o app usa a RPC
-- primeiro e só cai nela quando a RPC ainda não existe no banco.
--
-- Publicação: SQL Editor do projeto psgekwifthuzduhpreay → cole este arquivo.
-- É idempotente (pode rodar de novo sem estragar nada).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Hash de senha igual ao do GoTrue (bcrypt via pgcrypto)
--    No Supabase o pgcrypto fica no schema `extensions`; em outros bancos pode
--    estar em `public`. Descobrimos onde está em vez de supor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_password_hash(_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _schema text;
  _hash text;
BEGIN
  SELECT n.nspname INTO _schema
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'crypt'
     AND p.pronargs = 2
   ORDER BY (n.nspname = 'extensions') DESC, n.nspname
   LIMIT 1;

  IF _schema IS NULL THEN
    RAISE EXCEPTION 'Este banco não tem o pgcrypto (crypt/gen_salt) instalado; publique a Edge Function admin-users para criar contas'
      USING ERRCODE = '0A000';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf''))', _schema, _schema)
     INTO _hash
    USING _password;

  RETURN _hash;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_password_hash(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Criar conta (equivalente ao action `create_user` da Edge Function)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_user(
  _email text,
  _password text,
  _full_name text DEFAULT NULL,
  _role public.app_role DEFAULT 'member',
  _screen_permissions jsonb DEFAULT '[]'::jsonb,
  _schedule_permissions jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _email_norm text;
  _nome text;
  _user_id uuid := pg_catalog.gen_random_uuid();
  _base_impl uuid;
BEGIN
  -- 2.1 só administrador autenticado
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Saia e entre novamente.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;

  -- 2.2 validações (as mesmas mensagens que a tela mostra)
  _email_norm := pg_catalog.lower(pg_catalog.btrim(coalesce(_email, '')));
  _nome := nullif(pg_catalog.btrim(coalesce(_full_name, '')), '');

  IF _email_norm = '' OR _email_norm !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Informe um e-mail válido.' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(coalesce(_password, '')) < 6 THEN
    RAISE EXCEPTION 'A senha deve ter pelo menos 6 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(_password) > 72 THEN
    RAISE EXCEPTION 'A senha deve ter no máximo 72 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users u WHERE pg_catalog.lower(u.email) = _email_norm) THEN
    RAISE EXCEPTION 'Já existe uma conta com o e-mail %. Para dar acesso a ela use "Definir senha" (ou "Enviar redefinição").', _email_norm
      USING ERRCODE = '23505';
  END IF;

  _nome := COALESCE(_nome, pg_catalog.split_part(_email_norm, '@', 1));

  -- 2.3 conta no Auth. Sem a linha em auth.identities o login responde
  --     "Invalid login credentials" mesmo com a senha certa.
  --     O bloco de exceção cobre SÓ estas duas gravações: se uma falhar, a
  --     outra é desfeita junto (nada de conta pela metade).
  BEGIN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      _user_id,
      'authenticated',
      'authenticated',
      _email_norm,
      public.admin_password_hash(_password),
      pg_catalog.now(),
      pg_catalog.jsonb_build_object('provider', 'email', 'providers', pg_catalog.jsonb_build_array('email')),
      pg_catalog.jsonb_build_object('full_name', _nome),
      pg_catalog.now(),
      pg_catalog.now()
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) VALUES (
      pg_catalog.gen_random_uuid(),
      _user_id,
      _user_id::text,
      'email',
      pg_catalog.jsonb_build_object('sub', _user_id::text, 'email', _email_norm, 'email_verified', true),
      pg_catalog.now(),
      pg_catalog.now(),
      pg_catalog.now()
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'Este banco não autoriza gravar em auth.users a partir do SQL. Publique a Edge Function admin-users (ou rode scripts/criar-usuario.mjs com a chave service_role) para criar contas'
        USING ERRCODE = '42501';
  END;

  -- 2.4 perfil (o trigger handle_new_user normalmente já cria; aqui é garantia)
  IF pg_catalog.to_regclass('public.workspaces') IS NOT NULL THEN
    SELECT w.id INTO _base_impl FROM public.workspaces w WHERE w.slug = 'implantacao' LIMIT 1;
  END IF;

  IF pg_catalog.to_regclass('public.profiles') IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, full_name, active_workspace_id)
    VALUES (_user_id, _email_norm, _nome, _base_impl)
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
          active_workspace_id = COALESCE(public.profiles.active_workspace_id, EXCLUDED.active_workspace_id);
  END IF;

  -- 2.5 vínculo com as bases (o trigger também faz; reforço idempotente)
  IF pg_catalog.to_regclass('public.workspace_members') IS NOT NULL
     AND pg_catalog.to_regclass('public.workspaces') IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    SELECT w.id, _user_id, 'member' FROM public.workspaces w
    ON CONFLICT DO NOTHING;
  END IF;

  -- 2.6 papel e permissões
  INSERT INTO public.user_roles (user_id, role, screen_permissions, schedule_permissions)
  VALUES (
    _user_id,
    COALESCE(_role, 'member'::public.app_role),
    CASE WHEN _role = 'admin' THEN '[]'::jsonb ELSE COALESCE(_screen_permissions, '[]'::jsonb) END,
    CASE WHEN _role = 'admin' THEN '{}'::jsonb ELSE COALESCE(_schedule_permissions, '{}'::jsonb) END
  )
  ON CONFLICT (user_id, role) DO UPDATE
    SET screen_permissions = EXCLUDED.screen_permissions,
        schedule_permissions = EXCLUDED.schedule_permissions;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'user_id', _user_id,
    'email', _email_norm,
    'full_name', _nome
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user(text, text, text, public.app_role, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, public.app_role, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.admin_create_user(text, text, text, public.app_role, jsonb, jsonb) IS
  'Cria conta (auth.users + identity + perfil + papel). Somente admin autenticado; nunca devolve senha/hash.';

-- ---------------------------------------------------------------------------
-- 3. Definir senha (equivalente ao action `set_password`)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_password(_user_id uuid, _password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Saia e entre novamente.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id é obrigatório' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(coalesce(_password, '')) < 6 THEN
    RAISE EXCEPTION 'A senha deve ter pelo menos 6 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(_password) > 72 THEN
    RAISE EXCEPTION 'A senha deve ter no máximo 72 caracteres.' USING ERRCODE = '22023';
  END IF;

  -- email_confirmed_at: aproveita para liberar conta que ficou sem confirmação
  BEGIN
    UPDATE auth.users
       SET encrypted_password = public.admin_password_hash(_password),
           email_confirmed_at = COALESCE(email_confirmed_at, pg_catalog.now()),
           updated_at = pg_catalog.now()
     WHERE id = _user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conta não encontrada neste banco.' USING ERRCODE = 'P0002';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'Este banco não autoriza alterar a senha a partir do SQL. Publique a Edge Function admin-users (ou rode scripts/criar-usuario.mjs com a chave service_role).'
        USING ERRCODE = '42501';
  END;

  RETURN pg_catalog.jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_password(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.admin_set_password(uuid, text) IS
  'Troca a senha de uma conta (hash bcrypt do GoTrue). Somente admin autenticado.';

-- ---------------------------------------------------------------------------
-- 4. Tornar/remover administrador (equivalente ao action `set_admin`)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_admin(_user_id uuid, _admin boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Saia e entre novamente.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id é obrigatório' USING ERRCODE = '22023';
  END IF;
  IF _user_id = auth.uid() AND NOT COALESCE(_admin, false) THEN
    RAISE EXCEPTION 'Você não pode remover o seu próprio acesso de administrador' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(_admin, false) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'admin';
  END IF;

  RETURN pg_catalog.jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_admin(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_admin(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.admin_set_admin(uuid, boolean) IS
  'Liga/desliga o papel admin de uma conta. Somente admin autenticado; ninguém remove o próprio acesso.';

-- ---------------------------------------------------------------------------
-- 5. Salvar permissões (equivalente ao action `set_permissions`)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_permissions(
  _user_id uuid,
  _screen_permissions jsonb DEFAULT '[]'::jsonb,
  _schedule_permissions jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Saia e entre novamente.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id é obrigatório' USING ERRCODE = '22023';
  END IF;

  -- A linha 'member' guarda as permissões; o papel 'admin' (se existir) fica intacto.
  INSERT INTO public.user_roles (user_id, role, screen_permissions, schedule_permissions)
  VALUES (_user_id, 'member', COALESCE(_screen_permissions, '[]'::jsonb), COALESCE(_schedule_permissions, '{}'::jsonb))
  ON CONFLICT (user_id, role) DO UPDATE
    SET screen_permissions = EXCLUDED.screen_permissions,
        schedule_permissions = EXCLUDED.schedule_permissions;

  RETURN pg_catalog.jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_permissions(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_permissions(uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.admin_set_permissions(uuid, jsonb, jsonb) IS
  'Salva telas/cronogramas permitidos de uma conta. Somente admin autenticado.';

COMMIT;
