-- =========================================================
-- Controle de bases de dados (workspaces) em Configurações
-- =========================================================
-- O que este arquivo faz:
--   1. marca como PROTEGIDAS todas as bases que já existem;
--   2. cria funções (RPC) para listar, criar, renomear e excluir bases.
--
-- Regras de segurança:
--   * renomear muda SOMENTE a coluna `name` (nome de exibição). O `slug`,
--     os vínculos e todos os registros continuam exatamente como estão;
--   * excluir só é permitido para bases criadas DEPOIS desta migração
--     (`is_protected = false`), que estejam VAZIAS (nenhuma linha em nenhuma
--     tabela com workspace_id) e que não sejam a base ativa de ninguém;
--   * toda operação exige administrador autenticado (user_roles 'admin').
--     Quem não é admin recebe "Acesso restrito a administradores".
--
-- Rode este arquivo no SQL Editor do Supabase. Rodar de novo não altera
-- nenhum dado: as funções são recriadas e as colunas usam IF NOT EXISTS.
-- =========================================================


-- =========================================================
-- 1. Proteção das bases já existentes
-- =========================================================
-- `DEFAULT true` marca todas as linhas que já existem como protegidas.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT true;

-- Bases criadas a partir de agora nascem desprotegidas (podem ser excluídas
-- enquanto estiverem vazias).
ALTER TABLE public.workspaces
  ALTER COLUMN is_protected SET DEFAULT false;

-- Garantia extra: as bases originais nunca ficam protegidas por engano,
-- mesmo se alguém já tiver mexido na coluna.
UPDATE public.workspaces
   SET is_protected = true
 WHERE slug IN ('implantacao', 'waldemar');

COMMENT ON COLUMN public.workspaces.is_protected IS
  'true = base anterior ao controle de bases: não pode ser excluída pelo app.';


-- =========================================================
-- 2. Slug amigável (sem acentos, minúsculo, com hífens)
-- =========================================================
CREATE OR REPLACE FUNCTION public.workspace_slug(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(
      trim(both '-' from regexp_replace(
        lower(translate(
          COALESCE(_name, ''),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
          'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'
        )),
        '[^a-z0-9]+', '-', 'g'
      )),
      ''
    ),
    'base'
  );
$$;

REVOKE ALL ON FUNCTION public.workspace_slug(text) FROM PUBLIC, anon, authenticated;


-- =========================================================
-- 3. Uso da base (quantos registros existem nela)
-- =========================================================
-- Percorre TODAS as tabelas que têm workspace_id (inclusive as que forem
-- criadas no futuro), então nenhuma tabela nova fica de fora da proteção.
CREATE OR REPLACE FUNCTION public.admin_workspace_usage(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tabela  record;
  _qtd     bigint;
  _total   bigint := 0;
  _detalhe jsonb  := '{}'::jsonb;
  _ativos  bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;

  FOR _tabela IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name   = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name  = 'workspace_id'
       AND t.table_type   = 'BASE TABLE'
       AND c.table_name  <> 'workspace_members'
     ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id = $1', _tabela.table_name)
      INTO _qtd USING _workspace_id;
    IF _qtd > 0 THEN
      _total   := _total + _qtd;
      _detalhe := _detalhe || jsonb_build_object(_tabela.table_name, _qtd);
    END IF;
  END LOOP;

  SELECT count(*) INTO _ativos
    FROM public.profiles
   WHERE active_workspace_id = _workspace_id;

  RETURN jsonb_build_object(
    'total', _total,
    'tables', _detalhe,
    'active_users', _ativos
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_workspace_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_workspace_usage(uuid) TO authenticated;


-- =========================================================
-- 4. Listar bases com metadados de gestão
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_list_workspaces()
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  is_protected boolean,
  created_at timestamptz,
  members_count bigint,
  active_users bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT w.id,
           w.slug,
           w.name,
           w.is_protected,
           w.created_at,
           (SELECT count(*) FROM public.workspace_members m WHERE m.workspace_id = w.id),
           (SELECT count(*) FROM public.profiles p WHERE p.active_workspace_id = w.id)
      FROM public.workspaces w
     ORDER BY w.is_protected DESC, w.name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_workspaces() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_workspaces() TO authenticated;


-- =========================================================
-- 5. Criar base nova (nasce vazia)
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_create_workspace(_name text)
RETURNS TABLE (id uuid, slug text, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _nome      text := btrim(COALESCE(_name, ''));
  _slug      text;
  _raiz      text;
  _tentativa int  := 1;
  _novo_id   uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;

  IF length(_nome) < 2 THEN
    RAISE EXCEPTION 'Informe um nome com pelo menos 2 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF length(_nome) > 60 THEN
    RAISE EXCEPTION 'O nome da base deve ter no máximo 60 caracteres.' USING ERRCODE = '22023';
  END IF;

  _raiz := left(public.workspace_slug(_nome), 48);
  _slug := _raiz;
  WHILE EXISTS (SELECT 1 FROM public.workspaces w WHERE w.slug = _slug) LOOP
    _tentativa := _tentativa + 1;
    _slug := _raiz || '-' || _tentativa;
  END LOOP;

  INSERT INTO public.workspaces (slug, name, is_protected)
  VALUES (_slug, _nome, false)
  RETURNING workspaces.id INTO _novo_id;

  -- Todos os usuários existentes passam a enxergar a base nova, igual ao
  -- comportamento que já existe para contas recém-criadas.
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  SELECT _novo_id, p.id, 'member'
    FROM public.profiles p
  ON CONFLICT DO NOTHING;

  RETURN QUERY
    SELECT w.id, w.slug, w.name
      FROM public.workspaces w
     WHERE w.id = _novo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_workspace(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_workspace(text) TO authenticated;


-- =========================================================
-- 6. Renomear base — muda SÓ o nome de exibição
-- =========================================================
-- O slug é o identificador estável da base (usado por relatórios e rotinas)
-- e nunca é alterado aqui. Nenhuma tabela de dados é tocada.
CREATE OR REPLACE FUNCTION public.admin_rename_workspace(_workspace_id uuid, _name text)
RETURNS TABLE (id uuid, slug text, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _nome text := btrim(COALESCE(_name, ''));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;

  IF length(_nome) < 2 THEN
    RAISE EXCEPTION 'Informe um nome com pelo menos 2 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF length(_nome) > 60 THEN
    RAISE EXCEPTION 'O nome da base deve ter no máximo 60 caracteres.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.workspaces w WHERE w.id = _workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Base não encontrada.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.workspaces w
     SET name = _nome
   WHERE w.id = _workspace_id;

  RETURN QUERY
    SELECT w.id, w.slug, w.name
      FROM public.workspaces w
     WHERE w.id = _workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rename_workspace(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rename_workspace(uuid, text) TO authenticated;


-- =========================================================
-- 7. Excluir base — com travas de segurança
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_delete_workspace(_workspace_id uuid, _confirm_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ws      public.workspaces%ROWTYPE;
  _tabela  record;
  _qtd     bigint;
  _total   bigint := 0;
  _detalhe text   := '';
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _ws
    FROM public.workspaces w
   WHERE w.id = _workspace_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Base não encontrada.' USING ERRCODE = '22023';
  END IF;

  -- Trava 1: bases que já existiam antes deste recurso nunca são excluídas.
  IF _ws.is_protected THEN
    RAISE EXCEPTION
      'A base "%" já existia antes do controle de bases e está protegida. Nenhum dado foi alterado.',
      _ws.name
      USING ERRCODE = '22023';
  END IF;

  -- Trava 2: confirmação pelo nome exato.
  IF btrim(COALESCE(_confirm_name, '')) IS DISTINCT FROM _ws.name THEN
    RAISE EXCEPTION
      'Digite o nome exato da base ("%") para confirmar a exclusão.',
      _ws.name
      USING ERRCODE = '22023';
  END IF;

  -- Trava 3: ninguém pode estar usando a base como base ativa.
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.active_workspace_id = _workspace_id) THEN
    RAISE EXCEPTION
      'A base "%" está ativa para pelo menos um usuário. Troque a base ativa antes de excluir.',
      _ws.name
      USING ERRCODE = '22023';
  END IF;

  -- Trava 4: a base precisa estar completamente vazia.
  FOR _tabela IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name   = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name  = 'workspace_id'
       AND t.table_type   = 'BASE TABLE'
       AND c.table_name  <> 'workspace_members'
     ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id = $1', _tabela.table_name)
      INTO _qtd USING _workspace_id;
    IF _qtd > 0 THEN
      _total   := _total + _qtd;
      _detalhe := _detalhe
        || CASE WHEN _detalhe = '' THEN '' ELSE ', ' END
        || _tabela.table_name || ': ' || _qtd;
    END IF;
  END LOOP;

  IF _total > 0 THEN
    RAISE EXCEPTION
      'A base "%" ainda tem % registro(s) (%). Nada foi apagado: esvazie ou mova esses registros antes de excluir.',
      _ws.name, _total, left(_detalhe, 300)
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.workspace_members m WHERE m.workspace_id = _workspace_id;
  DELETE FROM public.workspaces w WHERE w.id = _workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_workspace(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_workspace(uuid, text) TO authenticated;


-- =========================================================
-- 8. Comentários (documentação dentro do banco)
-- =========================================================
COMMENT ON FUNCTION public.admin_list_workspaces() IS
  'Lista as bases com proteção e contagens. Somente administrador.';
COMMENT ON FUNCTION public.admin_create_workspace(text) IS
  'Cria uma base vazia e dá acesso a todos os usuários. Somente administrador.';
COMMENT ON FUNCTION public.admin_rename_workspace(uuid, text) IS
  'Renomeia apenas o nome de exibição; slug e dados não mudam. Somente administrador.';
COMMENT ON FUNCTION public.admin_delete_workspace(uuid, text) IS
  'Exclui base criada pelo app, somente se vazia, não protegida e sem usuários ativos.';

-- Recarrega o cache do PostgREST para as RPCs novas aparecerem na hora.
NOTIFY pgrst, 'reload schema';
