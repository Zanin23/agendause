BEGIN;

-- Permite associar uma ou mais pessoas ao mesmo treinamento, mantendo a coluna legada
-- responsible_user_id como responsável principal para compatibilidade com integrações antigas.
CREATE TABLE IF NOT EXISTS public.training_responsibles (
  training_id uuid NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  responsible_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_responsibles_pkey PRIMARY KEY (training_id, responsible_user_id)
);

CREATE INDEX IF NOT EXISTS training_responsibles_workspace_id_idx
  ON public.training_responsibles (workspace_id);
CREATE INDEX IF NOT EXISTS training_responsibles_user_id_idx
  ON public.training_responsibles (responsible_user_id);

COMMENT ON TABLE public.training_responsibles IS
  'Pessoas responsáveis por conduzir cada treinamento ou visita.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_responsibles TO authenticated;
GRANT ALL ON public.training_responsibles TO service_role;
ALTER TABLE public.training_responsibles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_responsibles_workspace_access ON public.training_responsibles;
CREATE POLICY training_responsibles_workspace_access
  ON public.training_responsibles FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS ws_isolation ON public.training_responsibles;
CREATE POLICY ws_isolation
  ON public.training_responsibles AS RESTRICTIVE FOR ALL TO authenticated
  USING (workspace_id = public.current_workspace())
  WITH CHECK (workspace_id = public.current_workspace());

DROP TRIGGER IF EXISTS set_ws_training_responsibles ON public.training_responsibles;
CREATE TRIGGER set_ws_training_responsibles
  BEFORE INSERT ON public.training_responsibles
  FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_from_training();

-- Migra os responsáveis já gravados na coluna antiga para a nova relação.
INSERT INTO public.training_responsibles (training_id, responsible_user_id, workspace_id)
SELECT t.id, t.responsible_user_id, t.workspace_id
FROM public.trainings AS t
WHERE t.responsible_user_id IS NOT NULL
ON CONFLICT (training_id, responsible_user_id) DO NOTHING;

-- Aplica a mesma lista permitida também em gravações diretas na coluna legada.
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
      AND lower(regexp_replace(btrim(coalesce(p.full_name, '')), '[[:space:]]+', ' ', 'g')) IN (
        'matheus zanin', 'pablo cassiano', 'el pablon',
        'joao pedro', 'joão pedro', 'joao pedro de souza gois',
        'claudinei'
      )
  ) THEN
    RAISE EXCEPTION 'Selecione um dos responsáveis autorizados que pertence à base deste treinamento.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- Valida também as novas linhas da tabela de associação (inclusive fora da interface web).
CREATE OR REPLACE FUNCTION public.validate_training_responsible_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.trainings AS t
    WHERE t.id = NEW.training_id
      AND t.workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'O treinamento e os responsáveis precisam pertencer à mesma base.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members AS wm
    JOIN public.profiles AS p ON p.id = wm.user_id
    WHERE wm.workspace_id = NEW.workspace_id
      AND wm.user_id = NEW.responsible_user_id
      AND lower(regexp_replace(btrim(coalesce(p.full_name, '')), '[[:space:]]+', ' ', 'g')) IN (
        'matheus zanin', 'pablo cassiano', 'el pablon',
        'joao pedro', 'joão pedro', 'joao pedro de souza gois',
        'claudinei'
      )
  ) THEN
    RAISE EXCEPTION 'Selecione um dos responsáveis autorizados que pertence à base ativa.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS training_responsibles_validate_assignment ON public.training_responsibles;
CREATE TRIGGER training_responsibles_validate_assignment
  BEFORE INSERT OR UPDATE ON public.training_responsibles
  FOR EACH ROW EXECUTE FUNCTION public.validate_training_responsible_assignment();

-- Restringe e padroniza a lista oferecida pela aplicação, sem expor os e-mails como rótulos.
CREATE OR REPLACE FUNCTION public.list_workspace_training_responsibles()
RETURNS TABLE (user_id uuid, full_name text, email text)
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
  )
  SELECT DISTINCT ON (display_name)
    user_id,
    display_name AS full_name,
    email
  FROM candidates
  ORDER BY display_name, alias_priority, user_id;
$$;

REVOKE ALL ON FUNCTION public.list_workspace_training_responsibles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_workspace_training_responsibles() TO authenticated;
COMMENT ON FUNCTION public.list_workspace_training_responsibles() IS
  'Lista apenas Matheus Zanin, Pablo Cassiano, João Pedro e Claudinei, quando pertencem à base ativa.';

-- Cria o treinamento e suas pessoas responsáveis em uma única transação.
-- A workspace é obtida do perfil autenticado para evitar salvar em uma base divergente da ativa.
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
  v_responsible_user_ids uuid[];
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

  SELECT coalesce(array_agg(unique_ids.user_id ORDER BY unique_ids.first_position), ARRAY[]::uuid[])
  INTO v_responsible_user_ids
  FROM (
    SELECT requested.user_id, min(requested.position) AS first_position
    FROM unnest(coalesce(_responsible_user_ids, ARRAY[]::uuid[]))
      WITH ORDINALITY AS requested(user_id, position)
    WHERE requested.user_id IS NOT NULL
    GROUP BY requested.user_id
  ) AS unique_ids;

  IF cardinality(v_responsible_user_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione pelo menos uma pessoa responsável pelo treinamento.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_responsible_user_ids) AS requested(user_id)
    LEFT JOIN public.workspace_members AS wm
      ON wm.workspace_id = v_workspace_id AND wm.user_id = requested.user_id
    LEFT JOIN public.profiles AS p ON p.id = requested.user_id
    WHERE wm.user_id IS NULL
      OR p.id IS NULL
      OR lower(regexp_replace(btrim(coalesce(p.full_name, '')), '[[:space:]]+', ' ', 'g')) NOT IN (
        'matheus zanin', 'pablo cassiano', 'el pablon',
        'joao pedro', 'joão pedro', 'joao pedro de souza gois',
        'claudinei'
      )
  ) THEN
    RAISE EXCEPTION 'Selecione apenas os responsáveis autorizados que pertencem à base ativa.'
      USING ERRCODE = '23514';
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
    v_responsible_user_ids[1],
    v_workspace_id
  )
  RETURNING id INTO v_training_id;

  INSERT INTO public.training_responsibles (training_id, responsible_user_id, workspace_id)
  SELECT v_training_id, requested.user_id, v_workspace_id
  FROM unnest(v_responsible_user_ids) AS requested(user_id);

  RETURN v_training_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_training_with_responsibles(text, text, text, timestamptz, integer, text, text, text, boolean, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_training_with_responsibles(text, text, text, timestamptz, integer, text, text, text, boolean, uuid[]) TO authenticated;

-- Substitui os responsáveis de um treinamento sem deixar a coluna antiga e a nova relação divergirem.
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
  v_responsible_user_ids uuid[];
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

  SELECT coalesce(array_agg(unique_ids.user_id ORDER BY unique_ids.first_position), ARRAY[]::uuid[])
  INTO v_responsible_user_ids
  FROM (
    SELECT requested.user_id, min(requested.position) AS first_position
    FROM unnest(coalesce(_responsible_user_ids, ARRAY[]::uuid[]))
      WITH ORDINALITY AS requested(user_id, position)
    WHERE requested.user_id IS NOT NULL
    GROUP BY requested.user_id
  ) AS unique_ids;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_responsible_user_ids) AS requested(user_id)
    LEFT JOIN public.workspace_members AS wm
      ON wm.workspace_id = v_workspace_id AND wm.user_id = requested.user_id
    LEFT JOIN public.profiles AS p ON p.id = requested.user_id
    WHERE wm.user_id IS NULL
      OR p.id IS NULL
      OR lower(regexp_replace(btrim(coalesce(p.full_name, '')), '[[:space:]]+', ' ', 'g')) NOT IN (
        'matheus zanin', 'pablo cassiano', 'el pablon',
        'joao pedro', 'joão pedro', 'joao pedro de souza gois',
        'claudinei'
      )
  ) THEN
    RAISE EXCEPTION 'Selecione apenas os responsáveis autorizados que pertencem à base ativa.'
      USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.training_responsibles AS tr
  WHERE tr.training_id = _training_id;

  INSERT INTO public.training_responsibles (training_id, responsible_user_id, workspace_id)
  SELECT _training_id, requested.user_id, v_workspace_id
  FROM unnest(v_responsible_user_ids) AS requested(user_id);

  UPDATE public.trainings AS t
  SET responsible_user_id = v_responsible_user_ids[1]
  WHERE t.id = _training_id AND t.workspace_id = v_workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível atualizar os responsáveis do treinamento.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_training_responsibles(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_training_responsibles(uuid, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
