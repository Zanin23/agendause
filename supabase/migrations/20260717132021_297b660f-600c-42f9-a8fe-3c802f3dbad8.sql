CREATE OR REPLACE FUNCTION public.complete_schedule_for_handoff(_schedule_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws uuid;
BEGIN
  SELECT workspace_id INTO ws FROM public.implementation_schedules WHERE id = _schedule_id;
  IF ws IS NULL THEN
    RAISE EXCEPTION 'Cronograma não encontrado';
  END IF;
  IF NOT public.is_workspace_member(ws) THEN
    RAISE EXCEPTION 'Sem permissão para concluir este cronograma';
  END IF;

  UPDATE public.schedule_items
     SET status = 'done',
         done_date = COALESCE(done_date, CURRENT_DATE)
   WHERE phase_id IN (SELECT id FROM public.schedule_phases WHERE schedule_id = _schedule_id)
     AND status <> 'done';

  UPDATE public.implementation_schedules
     SET status = 'completed'
   WHERE id = _schedule_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_schedule_for_handoff(uuid) TO authenticated;