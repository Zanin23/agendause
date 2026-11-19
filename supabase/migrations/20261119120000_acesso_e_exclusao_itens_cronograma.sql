-- ============================================================================
-- Acesso ao cronograma: excluir/editar etapas e fases passou a valer
--
-- Sintoma que originou esta migração: "tiro a data prevista de uma etapa (ou
-- removo a etapa) do cronograma, mas ela continua aparecendo na impressão".
-- Não era a impressão: o DELETE/UPDATE era descartado pelo RLS, sem erro.
--
-- Causa: as políticas de ESCRITA de `schedule_phases` e `schedule_items` são as
-- antigas "Owner manages …" e amarram tudo a `implementation_schedules.owner_id
-- = auth.uid()`. Só quem criou o cronograma apaga/move fase e item. Os 10
-- cronogramas mais antigos têm `owner_id` de contas que já não existem em
-- `auth.users` — nesses, NENHUM usuário consegue apagar item/fase (o Postgres
-- devolve "sucesso" com zero linhas e o app não mostra erro). Reordenar e
-- remarcar datas usam a política de UPDATE (essa já era aberta), por isso só a
-- exclusão parecia "não salvar".
--
-- Correção: a permissão de exclusão passa a ser a mesma que o app já usa para
-- entrar e editar o cronograma — administrador, permissão de tela `schedules`
-- (write) ou permissão específica daquele cronograma (`has_schedule_permission`),
-- sempre dentro da base ativa (`current_workspace`). Nada muda para quem hoje
-- consegue apagar; deixa de falhar em silêncio para o resto da equipe.
--
-- Idempotente: pode ser rodada mais de uma vez.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Itens do cronograma
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated delete items" ON public.schedule_items;
CREATE POLICY "Authenticated delete items" ON public.schedule_items
  FOR DELETE TO authenticated
  USING (
    public.has_schedule_permission(
      auth.uid(),
      (SELECT p.schedule_id FROM public.schedule_phases p WHERE p.id = schedule_items.phase_id),
      'write'
    )
  );

-- Editar continua liberado para quem tem acesso à base (política já existente),
-- mas sem depender de `owner_id`: atualizações também precisam do cronograma.
DROP POLICY IF EXISTS "Authenticated update items" ON public.schedule_items;
CREATE POLICY "Authenticated update items" ON public.schedule_items
  FOR UPDATE TO authenticated
  USING (
    public.has_schedule_permission(
      auth.uid(),
      (SELECT p.schedule_id FROM public.schedule_phases p WHERE p.id = schedule_items.phase_id),
      'write'
    )
  )
  WITH CHECK (
    public.has_schedule_permission(
      auth.uid(),
      (SELECT p.schedule_id FROM public.schedule_phases p WHERE p.id = schedule_items.phase_id),
      'write'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Fases do cronograma
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated delete phases" ON public.schedule_phases;
CREATE POLICY "Authenticated delete phases" ON public.schedule_phases
  FOR DELETE TO authenticated
  USING (public.has_schedule_permission(auth.uid(), schedule_id, 'write'));

DROP POLICY IF EXISTS "Authenticated update phases" ON public.schedule_phases;
CREATE POLICY "Authenticated update phases" ON public.schedule_phases
  FOR UPDATE TO authenticated
  USING (public.has_schedule_permission(auth.uid(), schedule_id, 'write'))
  WITH CHECK (public.has_schedule_permission(auth.uid(), schedule_id, 'write'));

-- ---------------------------------------------------------------------------
-- 3) Cronograma (cabeçalho) — status, pausa, título
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated update schedules" ON public.implementation_schedules;
CREATE POLICY "Authenticated update schedules" ON public.implementation_schedules
  FOR UPDATE TO authenticated
  USING (public.has_schedule_permission(auth.uid(), id, 'write'))
  WITH CHECK (public.has_schedule_permission(auth.uid(), id, 'write'));

DROP POLICY IF EXISTS "Authenticated delete schedules" ON public.implementation_schedules;
CREATE POLICY "Authenticated delete schedules" ON public.implementation_schedules
  FOR DELETE TO authenticated
  USING (public.has_schedule_permission(auth.uid(), id, 'write'));

-- ---------------------------------------------------------------------------
-- 4) Exclusões em massa: uma etapa por vez gera N chamadas; a função faz tudo
--    numa transação e devolve quantas linhas foram de fato apagadas. Serve
--    também para o app conferir "apagou mesmo?" (antes, zero linhas passava
--    como sucesso).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_items_delete(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _total integer;
BEGIN
  WITH apagadas AS (
    DELETE FROM public.schedule_items
     WHERE id = ANY(coalesce(_ids, ARRAY[]::uuid[]))
     RETURNING 1
  )
  SELECT count(*)::int INTO _total FROM apagadas;
  RETURN coalesce(_total, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_items_delete(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_items_delete(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.schedule_items_delete(uuid[]) IS
  'Apaga etapas do cronograma respeitando o RLS e devolve quantas linhas saíram (0 = nada foi apagado).';

COMMIT;
