-- ============================================================================
-- Responsáveis pelos atendimentos (treinamentos e visitas) — cadastro na
-- configuração do aplicativo, gerenciado apenas por administradores.
--
-- 1. Nova tabela `workspace_responsibles`: pessoas cadastradas por base ativa.
--    Cada pessoa pode estar vinculada a um usuário da base (profile_id)
--    ou ser um nome livre (profile_id NULL, sem login no sistema).
-- 2. `training_responsibles` passa a aceitar pessoas sem login via a coluna
--    `workspace_responsible_id`, mantendo `responsible_user_id` para usuários.
-- 3. `list_workspace_training_responsibles()` devolve a lista padrão do sistema
--    (Matheus Zanin, Pablo Cassiano, João Pedro, Claudinei — quando pertencem
--    à base ativa) MAIS o cadastro da base, inclusive arquivados, com a coluna
--    `archived` para o app decidir quem pode ser atribuído.
-- 4. `create_training_with_responsibles` e `set_training_responsibles` passam a
--    aceitar os dois tipos de id no mesmo array (o app envia ids opacos).
-- 5. RPCs `admin_*`/de cadastro exigem `has_role(..., 'admin')`.
--
-- Publicação: SQL Editor do projeto pnaupodddxrbqbjilhft → cole este arquivo
-- inteiro → Run. É idempotente (pode rodar de novo sem estragar nada).
-- Depois de rodar, o app mostra o card "Responsáveis pelos atendimentos"
-- nas Configurações. Até lá, o app avisa que a migração está pendente.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Nome "de fábrica" (lista padrão do sistema)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.responsible_is_factory_name(_full_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(regexp_replace(btrim(coalesce(_full_name, '')), '[[:space:]]+', ' ', 'g')) IN (
    'matheus zanin', 'pablo cassiano', 'el pablon',
    'joao pedro', 'joão pedro', 'joao pedro de souza gois',
    'claudinei'
  );
$$;

REVOKE ALL ON FUNCTION public.responsible_is_factory_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.responsible_is_factory_name(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. Cadastro por base ativa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_responsibles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  profile_id uuid NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  archived_at timestamptz NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_responsibles_nome_tam CHECK (length(btrim(display_name)) BETWEEN 2 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_responsibles_ws_profile_ux
  ON public.workspace_responsibles (workspace_id, profile_id)
  WHERE profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workspace_responsibles_ws_nome_ux
  ON public.workspace_responsibles (workspace_id, lower(btrim(display_name)));

CREATE INDEX IF NOT EXISTS workspace_responsibles_ws_idx
  ON public.workspace_responsibles (workspace_id);

COMMENT ON TABLE public.workspace_responsibles IS
  'Pessoas cadastradas pelos administradores como responsáveis pelos atendimentos (treinamentos e visitas) da base ativa. profile_id vinculado = usuário da base; NULL = nome livre sem login.';

REVOKE ALL ON public.workspace_responsibles FROM PUBLIC, anon;
GRANT SELECT ON public.workspace_responsibles TO authenticated;
GRANT ALL ON public.workspace_responsibles TO service_role;
ALTER TABLE public.workspace_responsibles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_responsibles_member_read ON public.workspace_responsibles;
CREATE POLICY workspace_responsibles_member_read ON public.workspace_responsibles
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS ws_isolation ON public.workspace_responsibles;
CREATE POLICY ws_isolation ON public.workspace_responsibles AS RESTRICTIVE FOR ALL TO authenticated
  USING (workspace_id = public.current_workspace())
  WITH CHECK (workspace_id = public.current_workspace());

-- ---------------------------------------------------------------------------
-- 2. training_responsibles: uma ou outra forma de responsável por linha
-- ---------------------------------------------------------------------------
ALTER TABLE public.training_responsibles DROP CONSTRAINT IF EXISTS training_responsibles_pkey;
ALTER TABLE public.training_responsibles ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.training_responsibles ADD CONSTRAINT training_responsibles_pkey PRIMARY KEY (id);

ALTER TABLE public.training_responsibles ADD COLUMN IF NOT EXISTS workspace_responsible_id uuid NULL
  REFERENCES public.workspace_responsibles(id) ON DELETE CASCADE;

ALTER TABLE public.training_responsibles ALTER COLUMN responsible_user_id DROP NOT NULL;

ALTER TABLE public.training_responsibles DROP CONSTRAINT IF EXISTS training_responsibles_exatamente_um;
ALTER TABLE public.training_responsibles ADD CONSTRAINT training_responsibles_exatamente_um
  CHECK (num_nonnulls(responsible_user_id, workspace_responsible_id) = 1);

CREATE UNIQUE INDEX IF NOT EXISTS training_responsibles_user_ux
  ON public.training_responsibles (training_id, responsible_user_id)
  WHERE responsible_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS training_responsibles_person_ux
  ON public.training_responsibles (training_id, workspace_responsible_id)
  WHERE workspace_responsible_id IS NOT NULL;

COMMENT ON COLUMN public.training_responsibles.workspace_responsible_id IS
  'Pessoa cadastrada em workspace_responsibles (pode não ter login). responsible_user_id passa a ser NULL para essas linhas.';

-- ---------------------------------------------------------------------------
-- 3. RPCs de administração do cadastro (somente administradores)
-- ---------------------------------------------------------------------------

-- 3.1 Lista o cadastro da base ativa (ativos e arquivados).
CREATE OR REPLACE FUNCTION public.list_workspace_responsibles()
RETURNS TABLE (
  id uuid,
  profile_id uuid,
  display_name text,
  email text,
  archived boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _workspace_id uuid := public.current_workspace();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Saia e entre novamente.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.id,
         r.profile_id,
         r.display_name,
         p.email,
         (r.archived_at IS NOT NULL) AS archived,
         r.created_at
  FROM public.workspace_responsibles r
  LEFT JOIN public.profiles p ON p.id = r.profile_id
  WHERE r.workspace_id = _workspace_id
  ORDER BY (r.archived_at IS NOT NULL), lower(r.display_name);
END;
$$;

REVOKE ALL ON FUNCTION public.list_workspace_responsibles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_workspace_responsibles() TO authenticated;

-- 3.2 Usuários da base que podem ser vinculados (fora da lista padrão e ainda
--     não cadastrados). Ativos apenas.
CREATE OR REPLACE FUNCTION public.list_workspace_responsible_candidates()
RETURNS TABLE (user_id uuid, full_name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _workspace_id uuid := public.current_workspace();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Saia e entre novamente.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT wm.user_id,
         COALESCE(NULLIF(btrim(p.full_name), ''), p.email, wm.user_id::text) AS full_name,
         p.email
  FROM public.workspace_members wm
  JOIN public.profiles p ON p.id = wm.user_id
  WHERE wm.workspace_id = _workspace_id
    AND NOT public.responsible_is_factory_name(p.full_name)
    AND NOT EXISTS (
      SELECT 1 FROM public.workspace_responsibles r
      WHERE r.workspace_id = wm.workspace_id
        AND r.profile_id = wm.user_id
    )
  ORDER BY lower(COALESCE(NULLIF(btrim(p.full_name), ''), p.email, wm.user_id::text));
END;
$$;

REVOKE ALL ON FUNCTION public.list_workspace_responsible_candidates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_workspace_responsible_candidates() TO authenticated;

-- 3.3 Cadastrar (vincular usuário da base OU nome livre).
CREATE OR REPLACE FUNCTION public.create_workspace_responsible(
  _display_name text DEFAULT NULL,
  _profile_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _workspace_id uuid := public.current_workspace();
  _nome text := nullif(regexp_replace(btrim(coalesce(_display_name, '')), '\s+', ' ', 'g'), '');
  _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Saia e entre novamente.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;
  IF _workspace_id IS NULL OR NOT public.is_workspace_member(_workspace_id) THEN
    RAISE EXCEPTION 'Selecione uma base válida antes de cadastrar.' USING ERRCODE = '42501';
  END IF;

  IF _profile_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = _workspace_id AND wm.user_id = _profile_id
    ) THEN
      RAISE EXCEPTION 'Esse usuário não pertence a esta base.' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _profile_id AND public.responsible_is_factory_name(p.full_name)
    ) THEN
      RAISE EXCEPTION 'Essa pessoa já faz parte da lista padrão do sistema.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.workspace_responsibles r
      WHERE r.workspace_id = _workspace_id AND r.profile_id = _profile_id AND r.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Essa pessoa já está cadastrada como responsável.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.workspace_responsibles r
      WHERE r.workspace_id = _workspace_id AND r.profile_id = _profile_id AND r.archived_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Essa pessoa está arquivada. Restaure-a na lista em vez de recriar.';
    END IF;
    IF _nome IS NULL THEN
      SELECT COALESCE(
               NULLIF(regexp_replace(btrim(p.full_name), '\s+', ' ', 'g'), ''),
               p.email,
               p.id::text
             )
        INTO _nome
        FROM public.profiles p
       WHERE p.id = _profile_id;
    END IF;
  END IF;

  IF _nome IS NULL OR length(_nome) < 2 THEN
    RAISE EXCEPTION 'Informe um nome com pelo menos 2 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF length(_nome) > 80 THEN
    RAISE EXCEPTION 'O nome deve ter no máximo 80 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_responsibles r
    WHERE r.workspace_id = _workspace_id
      AND lower(btrim(r.display_name)) = lower(_nome)
  ) THEN
    RAISE EXCEPTION 'Já existe uma pessoa com esse nome na lista.';
  END IF;

  INSERT INTO public.workspace_responsibles (workspace_id, profile_id, display_name, created_by)
  VALUES (_workspace_id, _profile_id, _nome, auth.uid())
  RETURNING id INTO _id;

  RETURN _id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe uma pessoa com esse nome na lista.' USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace_responsible(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace_responsible(text, uuid) TO authenticated;

-- 3.4 Renomear (mantém o vínculo, muda só o rótulo).
CREATE OR REPLACE FUNCTION public.rename_workspace_responsible(
  _id uuid,
  _display_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _workspace_id uuid := public.current_workspace();
  _nome text := nullif(regexp_replace(btrim(coalesce(_display_name, '')), '\s+', ' ', 'g'), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Saia e entre novamente.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;

  IF _nome IS NULL OR length(_nome) < 2 THEN
    RAISE EXCEPTION 'Informe um nome com pelo menos 2 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF length(_nome) > 80 THEN
    RAISE EXCEPTION 'O nome deve ter no máximo 80 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_responsibles r WHERE r.id = _id AND r.workspace_id = _workspace_id
  ) THEN
    RAISE EXCEPTION 'Pessoa não encontrada nesta base.' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workspace_responsibles r
    WHERE r.workspace_id = _workspace_id
      AND r.id <> _id
      AND lower(btrim(r.display_name)) = lower(_nome)
  ) THEN
    RAISE EXCEPTION 'Já existe uma pessoa com esse nome na lista.';
  END IF;

  UPDATE public.workspace_responsibles r
     SET display_name = _nome
   WHERE r.id = _id AND r.workspace_id = _workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rename_workspace_responsible(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_workspace_responsible(uuid, text) TO authenticated;

-- 3.5 Arquivar / restaurar (arquivar remove das novas atribuições;
--     o histórico continua exibindo o nome).
CREATE OR REPLACE FUNCTION public.set_workspace_responsible_archived(
  _id uuid,
  _archived boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _workspace_id uuid := public.current_workspace();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Saia e entre novamente.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspace_responsibles r
     SET archived_at = CASE WHEN _archived THEN now() ELSE NULL END
   WHERE r.id = _id AND r.workspace_id = _workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa não encontrada nesta base.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_responsible_archived(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_workspace_responsible_archived(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Lista oferecida nos agendamentos: padrão do sistema + cadastro da base
--    (ativos e arquivados, com `archived` para o app filtrar quem pode
--    ser atribuído). Disponível a todos os membros autenticados.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_workspace_training_responsibles();

CREATE FUNCTION public.list_workspace_training_responsibles()
RETURNS TABLE (user_id uuid, full_name text, email text, archived boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH candidates AS (
    SELECT
      p.id AS user_id,
      CASE normalized.name
        WHEN 'matheus zanin' THEN 'Matheus Zanin'
        WHEN 'pablo cassiano' THEN 'Pablo Cassiano'
        WHEN 'el pablon' THEN 'Pablo Cassiano'
        WHEN 'joao pedro' THEN 'João Pedro'
        WHEN 'joão pedro' THEN 'João Pedro'
        WHEN 'joao pedro de souza gois' THEN 'João Pedro'
        WHEN 'claudinei' THEN 'Claudinei'
      END AS display_name,
      p.email,
      CASE normalized.name
        WHEN 'matheus zanin' THEN 0
        WHEN 'pablo cassiano' THEN 0
        WHEN 'el pablon' THEN 1
        WHEN 'joao pedro' THEN 0
        WHEN 'joão pedro' THEN 0
        WHEN 'joao pedro de souza gois' THEN 1
        WHEN 'claudinei' THEN 0
      END AS alias_priority
    FROM public.workspace_members AS wm
    JOIN public.profiles AS p ON p.id = wm.user_id
    CROSS JOIN LATERAL (
      SELECT lower(regexp_replace(btrim(coalesce(p.full_name, '')), '[[:space:]]+', ' ', 'g')) AS name
    ) AS normalized
    WHERE auth.uid() IS NOT NULL
      AND wm.workspace_id = public.current_workspace()
      AND public.is_workspace_member(wm.workspace_id)
      AND normalized.name IN (
        'matheus zanin', 'pablo cassiano', 'el pablon',
        'joao pedro', 'joão pedro', 'joao pedro de souza gois',
        'claudinei'
      )
  ),
  fixed AS (
    SELECT DISTINCT ON (display_name)
      user_id,
      display_name AS full_name,
      email
    FROM candidates
    ORDER BY display_name, alias_priority, user_id
  ),
  combined AS (
    SELECT user_id, full_name, email, false AS archived FROM fixed
    UNION ALL
    SELECT r.id AS user_id,
           r.display_name AS full_name,
           p.email,
           (r.archived_at IS NOT NULL) AS archived
    FROM public.workspace_responsibles r
    LEFT JOIN public.profiles p ON p.id = r.profile_id
    WHERE r.workspace_id = public.current_workspace()
  )
  SELECT user_id, full_name, email, archived
  FROM combined
  ORDER BY archived, full_name;
$$;

REVOKE ALL ON FUNCTION public.list_workspace_training_responsibles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_workspace_training_responsibles() TO authenticated;
COMMENT ON FUNCTION public.list_workspace_training_responsibles() IS
  'Lista os responsáveis atribuíveis aos atendimentos da base ativa: a lista padrão do sistema mais os cadastros da base (ativos e arquivados, ver `archived`).';

-- ---------------------------------------------------------------------------
-- 5. Criar treinamento com responsáveis (aceitando usuários e cadastros)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_training_with_responsibles(
  _title text,
  _client text,
  _description text,
  _scheduled_at timestamptz,
  _duration_minutes integer,
  _location text,
  _internal_notes text,
  _visit_type text,
  _requires_acceptance boolean,
  _responsible_user_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_training_id uuid;
  v_workspace_id uuid := public.current_workspace();
  v_profile_ids uuid[];
  v_person_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário entrar na conta para criar o treinamento.' USING ERRCODE = '42501';
  END IF;
  IF v_workspace_id IS NULL OR NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Selecione uma base válida antes de criar o treinamento.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(_title), '') IS NULL OR _scheduled_at IS NULL THEN
    RAISE EXCEPTION 'Informe o título e a data do treinamento.' USING ERRCODE = '22023';
  END IF;

  -- Ids que correspondem a perfis (usuários), na ordem informada, sem repetir.
  SELECT coalesce(array_agg(requested.user_id ORDER BY requested.ord), ARRAY[]::uuid[])
  INTO v_profile_ids
  FROM (
    SELECT u.user_id, min(u.position) AS ord
    FROM unnest(coalesce(_responsible_user_ids, ARRAY[]::uuid[]))
      WITH ORDINALITY AS u(user_id, position)
    WHERE u.user_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.user_id)
    GROUP BY u.user_id
  ) AS requested;

  -- Os demais ids são tratados como pessoas do cadastro da base.
  SELECT coalesce(array_agg(requested.user_id ORDER BY requested.ord), ARRAY[]::uuid[])
  INTO v_person_ids
  FROM (
    SELECT u.user_id, min(u.position) AS ord
    FROM unnest(coalesce(_responsible_user_ids, ARRAY[]::uuid[]))
      WITH ORDINALITY AS u(user_id, position)
    WHERE u.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.user_id)
    GROUP BY u.user_id
  ) AS requested;

  IF cardinality(v_profile_ids) + cardinality(v_person_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione pelo menos uma pessoa responsável pelo treinamento.' USING ERRCODE = '22023';
  END IF;

  -- Usuários: precisam pertencer à base e estar na lista padrão ou no cadastro ativo.
  IF EXISTS (
    SELECT 1
    FROM unnest(v_profile_ids) AS requested(user_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.workspace_members AS wm
      JOIN public.profiles AS p ON p.id = wm.user_id
      WHERE wm.workspace_id = v_workspace_id
        AND wm.user_id = requested.user_id
        AND (
          public.responsible_is_factory_name(p.full_name)
          OR EXISTS (
            SELECT 1 FROM public.workspace_responsibles wr
            WHERE wr.workspace_id = v_workspace_id
              AND wr.profile_id = requested.user_id
              AND wr.archived_at IS NULL
          )
        )
    )
  ) THEN
    RAISE EXCEPTION 'Selecione apenas os responsáveis autorizados que pertencem à base ativa.'
      USING ERRCODE = '23514';
  END IF;

  -- Pessoas livres: precisam existir no cadastro ativo da base.
  IF EXISTS (
    SELECT 1
    FROM unnest(v_person_ids) AS requested(user_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.workspace_responsibles wr
      WHERE wr.id = requested.user_id
        AND wr.workspace_id = v_workspace_id
        AND wr.archived_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Selecione apenas pessoas cadastradas e ativas nesta base.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.trainings (
    title,
    client,
    description,
    scheduled_at,
    duration_minutes,
    location,
    internal_notes,
    visit_type,
    requires_acceptance,
    created_by,
    responsible_user_id,
    workspace_id
  )
  VALUES (
    btrim(_title),
    _client,
    _description,
    _scheduled_at,
    coalesce(_duration_minutes, 60),
    _location,
    _internal_notes,
    _visit_type,
    coalesce(_requires_acceptance, true),
    auth.uid(),
    v_profile_ids[1],
    v_workspace_id
  )
  RETURNING id INTO v_training_id;

  INSERT INTO public.training_responsibles (training_id, responsible_user_id, workspace_id)
  SELECT v_training_id, requested.user_id, v_workspace_id
  FROM unnest(v_profile_ids) AS requested(user_id);

  INSERT INTO public.training_responsibles (training_id, workspace_responsible_id, workspace_id)
  SELECT v_training_id, requested.user_id, v_workspace_id
  FROM unnest(v_person_ids) AS requested(user_id);

  RETURN v_training_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_training_with_responsibles(text, text, text, timestamptz, integer, text, text, text, boolean, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_training_with_responsibles(text, text, text, timestamptz, integer, text, text, text, boolean, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Substituir responsáveis de um treinamento (aceita os dois tipos)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_training_responsibles(
  _training_id uuid,
  _responsible_user_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_workspace_id uuid;
  v_profile_ids uuid[];
  v_person_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário entrar na conta para alterar os responsáveis.' USING ERRCODE = '42501';
  END IF;

  SELECT t.workspace_id INTO v_workspace_id
  FROM public.trainings AS t
  WHERE t.id = _training_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Treinamento não encontrado nesta base.' USING ERRCODE = 'P0002';
  END IF;
  IF v_workspace_id IS DISTINCT FROM public.current_workspace()
    OR NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'O treinamento não pertence à base ativa.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(requested.user_id ORDER BY requested.ord), ARRAY[]::uuid[])
  INTO v_profile_ids
  FROM (
    SELECT u.user_id, min(u.position) AS ord
    FROM unnest(coalesce(_responsible_user_ids, ARRAY[]::uuid[]))
      WITH ORDINALITY AS u(user_id, position)
    WHERE u.user_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.user_id)
    GROUP BY u.user_id
  ) AS requested;

  SELECT coalesce(array_agg(requested.user_id ORDER BY requested.ord), ARRAY[]::uuid[])
  INTO v_person_ids
  FROM (
    SELECT u.user_id, min(u.position) AS ord
    FROM unnest(coalesce(_responsible_user_ids, ARRAY[]::uuid[]))
      WITH ORDINALITY AS u(user_id, position)
    WHERE u.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.user_id)
    GROUP BY u.user_id
  ) AS requested;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_profile_ids) AS requested(user_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.workspace_members AS wm
      JOIN public.profiles AS p ON p.id = wm.user_id
      WHERE wm.workspace_id = v_workspace_id
        AND wm.user_id = requested.user_id
        AND (
          public.responsible_is_factory_name(p.full_name)
          OR EXISTS (
            SELECT 1 FROM public.workspace_responsibles wr
            WHERE wr.workspace_id = v_workspace_id
              AND wr.profile_id = requested.user_id
              AND wr.archived_at IS NULL
          )
        )
    )
  ) THEN
    RAISE EXCEPTION 'Selecione apenas os responsáveis autorizados que pertencem à base ativa.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_person_ids) AS requested(user_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.workspace_responsibles wr
      WHERE wr.id = requested.user_id
        AND wr.workspace_id = v_workspace_id
        AND wr.archived_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Selecione apenas pessoas cadastradas e ativas nesta base.' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.training_responsibles AS tr
  WHERE tr.training_id = _training_id;

  INSERT INTO public.training_responsibles (training_id, responsible_user_id, workspace_id)
  SELECT _training_id, requested.user_id, v_workspace_id
  FROM unnest(v_profile_ids) AS requested(user_id);

  INSERT INTO public.training_responsibles (training_id, workspace_responsible_id, workspace_id)
  SELECT _training_id, requested.user_id, v_workspace_id
  FROM unnest(v_person_ids) AS requested(user_id);

  UPDATE public.trainings AS t
  SET responsible_user_id = v_profile_ids[1]
  WHERE t.id = _training_id AND t.workspace_id = v_workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível atualizar os responsáveis do treinamento.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_training_responsibles(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_training_responsibles(uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Gatilhos de validação (camada extra, fora da interface)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_training_responsible_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.responsible_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.workspace_id IS NULL THEN
    NEW.workspace_id := public.current_workspace();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members AS wm
    JOIN public.profiles AS p ON p.id = wm.user_id
    WHERE wm.workspace_id = NEW.workspace_id
      AND wm.user_id = NEW.responsible_user_id
      AND (
        public.responsible_is_factory_name(p.full_name)
        OR EXISTS (
          SELECT 1 FROM public.workspace_responsibles wr
          WHERE wr.workspace_id = NEW.workspace_id
            AND wr.profile_id = NEW.responsible_user_id
            AND wr.archived_at IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'Selecione apenas responsáveis autorizados que pertencem à base deste treinamento.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_training_responsible_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  SELECT t.workspace_id INTO v_workspace_id
  FROM public.trainings AS t
  WHERE t.id = NEW.training_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O treinamento e os responsáveis precisam pertencer à mesma base.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.workspace_id IS NULL THEN
    NEW.workspace_id := v_workspace_id;
  ELSIF NEW.workspace_id IS DISTINCT FROM v_workspace_id THEN
    RAISE EXCEPTION 'O treinamento e os responsáveis precisam pertencer à mesma base.'
      USING ERRCODE = '23514';
  END IF;

  IF (NEW.responsible_user_id IS NULL) = (NEW.workspace_responsible_id IS NULL) THEN
    RAISE EXCEPTION 'Informe exatamente um tipo de responsável por linha.' USING ERRCODE = '23514';
  END IF;

  IF NEW.responsible_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.workspace_members AS wm
      JOIN public.profiles AS p ON p.id = wm.user_id
      WHERE wm.workspace_id = NEW.workspace_id
        AND wm.user_id = NEW.responsible_user_id
        AND (
          public.responsible_is_factory_name(p.full_name)
          OR EXISTS (
            SELECT 1 FROM public.workspace_responsibles wr
            WHERE wr.workspace_id = NEW.workspace_id
              AND wr.profile_id = NEW.responsible_user_id
              AND wr.archived_at IS NULL
          )
        )
    ) THEN
      RAISE EXCEPTION 'Selecione apenas responsáveis autorizados que pertencem à base ativa.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_responsibles wr
    WHERE wr.id = NEW.workspace_responsible_id
      AND wr.workspace_id = NEW.workspace_id
      AND wr.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Selecione apenas pessoas cadastradas e ativas nesta base.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
