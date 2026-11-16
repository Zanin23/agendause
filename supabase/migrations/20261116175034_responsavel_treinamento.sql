BEGIN;

-- Responsável explícito por cada treinamento/visita.
-- A coluna fica anulável para preservar visitas antigas e solicitações públicas já existentes.
ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS responsible_user_id uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS trainings_responsible_user_id_idx
  ON public.trainings (responsible_user_id);

COMMENT ON COLUMN public.trainings.responsible_user_id IS
  'Usuário da base responsável por conduzir o treinamento ou a visita.';

-- Lista somente usuários que pertencem à base ativa do usuário autenticado.
CREATE OR REPLACE FUNCTION public.list_workspace_training_responsibles()
RETURNS TABLE (user_id uuid, full_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.full_name, p.email
  FROM public.workspace_members AS wm
  JOIN public.profiles AS p ON p.id = wm.user_id
  WHERE auth.uid() IS NOT NULL
    AND wm.workspace_id = public.current_workspace()
    AND public.is_workspace_member(wm.workspace_id)
  ORDER BY COALESCE(NULLIF(BTRIM(p.full_name), ''), p.email, p.id::text);
$$;

REVOKE ALL ON FUNCTION public.list_workspace_training_responsibles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_workspace_training_responsibles() TO authenticated;
COMMENT ON FUNCTION public.list_workspace_training_responsibles() IS
  'Lista os usuários da base ativa para atribuição de treinamentos; disponível apenas a usuários autenticados.';

-- Também valida as gravações feitas fora da interface: o responsável deve pertencer
-- à mesma base do treinamento. set_ws_trainings preenche workspace_id antes deste gatilho.
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
    WHERE wm.workspace_id = NEW.workspace_id
      AND wm.user_id = NEW.responsible_user_id
  ) THEN
    RAISE EXCEPTION 'O responsável selecionado não pertence à base deste treinamento.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trainings_validate_responsible_workspace ON public.trainings;
CREATE TRIGGER trainings_validate_responsible_workspace
  BEFORE INSERT OR UPDATE OF responsible_user_id, workspace_id
  ON public.trainings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_training_responsible_workspace();

NOTIFY pgrst, 'reload schema';

COMMIT;
