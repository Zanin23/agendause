-- ============================================================================
-- CONTROLE DE ACESSOS — correção do erro 500 em contas criadas pela tela
-- + exclusão de conta.
--
-- 1. Erro 500: a versão anterior de admin_create_user gravava em auth.users sem
--    preencher as colunas de token do GoTrue (confirmation_token, recovery_token,
--    email_change, email_change_token_new, email_change_token_current,
--    phone_change, phone_change_token, reauthentication_token). Elas ficavam
--    NULL. O GoTrue não consegue ler NULL nessas colunas, então a conta criada
--    pela tela não conseguia entrar (erro 500). Conta criada pelo painel do
--    Supabase funciona porque o GoTrue preenche essas colunas com texto vazio.
--    → Esta migração (a) grava '' nessas colunas ao criar, (b) conserta as
--    contas que já ficaram com NULL.
--
-- 2. Exclusão: nova função admin_delete_user. Apaga a conta de login e os dados
--    pessoais (perfil, papéis, permissões, vínculos com as bases, identidade,
--    aceites e demais registros ligados à conta por ON DELETE CASCADE).
--    Cronogramas, modelos e treinamentos que a conta criou NÃO somem: passam
--    para o administrador que apagou a conta.
--
-- Publicação: SQL Editor do projeto pnaupodddxrbqbjilhft → cole este arquivo
-- inteiro → Run. É idempotente (pode rodar de novo sem estragar nada).
-- Depende da migração 20261013140000_admin_contas_sem_edge_function.sql.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Conserta contas que já ficaram com token NULL (criadas pela versão antiga)
--    Só mexe nas colunas que existirem neste projeto.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _coluna text;
BEGIN
  FOREACH _coluna IN ARRAY ARRAY[
    'confirmation_token',
    'recovery_token',
    'email_change_token_new',
    'email_change',
    'email_change_token_current',
    'phone_change',
    'phone_change_token',
    'reauthentication_token'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = _coluna
    ) THEN
      EXECUTE pg_catalog.format(
        'UPDATE auth.users SET %I = %L WHERE %I IS NULL', _coluna, '', _coluna
      );
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Criar conta (mesma assinatura da migração anterior) — agora preenche os
--    tokens do GoTrue com texto vazio, igual ao painel do Supabase.
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

  -- 2.3 conta no Auth + identidade de e-mail. Os tokens vão como texto vazio:
  --     NULL nessas colunas faz o login responder 500.
  BEGIN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
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
      pg_catalog.now(),
      '', '', '', '', '', '', '', ''
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

-- ---------------------------------------------------------------------------
-- 3. Apagar conta (equivalente ao action `delete_user` da Edge Function)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _email text;
BEGIN
  -- 3.1 só administrador autenticado
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Saia e entre novamente.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;

  -- 3.2 validações
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id é obrigatório' USING ERRCODE = '22023';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode apagar a sua própria conta. Peça a outro administrador.' USING ERRCODE = '22023';
  END IF;

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada neste banco.' USING ERRCODE = 'P0002';
  END IF;

  -- 3.3 trabalho compartilhado não some junto com a conta: passa para quem apagou
  UPDATE public.implementation_schedules SET owner_id = auth.uid() WHERE owner_id = _user_id;
  UPDATE public.implementation_templates SET owner_id = auth.uid() WHERE owner_id = _user_id;
  UPDATE public.trainings SET created_by = auth.uid() WHERE created_by = _user_id;

  -- 3.4 vínculos com as bases (não têm FK para auth.users)
  DELETE FROM public.workspace_members WHERE user_id = _user_id;

  -- 3.5 a conta em si. Identidades, sessões, perfil, papéis e os dados
  --     pessoais ligados por ON DELETE CASCADE vão junto.
  BEGIN
    DELETE FROM auth.users WHERE id = _user_id;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'Este banco não autoriza apagar contas a partir do SQL. Apague pelo painel (Authentication → Users) ou publique a Edge Function admin-users.'
        USING ERRCODE = '42501';
  END;

  RETURN pg_catalog.jsonb_build_object('success', true, 'email', _email);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_delete_user(uuid) IS
  'Apaga a conta (auth.users e dados pessoais em cascata). Somente admin autenticado; ninguém apaga a própria conta; cronogramas/treinamentos da conta passam para quem apagou.';

COMMIT;
