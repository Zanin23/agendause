
ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS requested_by text,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainings_approval_status_check') THEN
    ALTER TABLE public.trainings
      ADD CONSTRAINT trainings_approval_status_check
      CHECK (approval_status IN ('approved','pending','rejected'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.request_schedule_visit(
  _token text,
  _item_id uuid,
  _date date,
  _time text,
  _name text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  sched public.implementation_schedules;
  item public.schedule_items;
  existing_training public.trainings;
  new_at timestamptz;
  new_id uuid;
BEGIN
  SELECT s.* INTO sched
  FROM public.implementation_schedules s
  WHERE s.public_token = _token;
  IF sched.id IS NULL THEN
    RAISE EXCEPTION 'Cronograma não encontrado';
  END IF;

  SELECT it.* INTO item
  FROM public.schedule_items it
  JOIN public.schedule_phases p ON p.id = it.phase_id
  WHERE it.id = _item_id AND p.schedule_id = sched.id;
  IF item.id IS NULL THEN
    RAISE EXCEPTION 'Etapa não encontrada neste cronograma';
  END IF;

  new_at := (_date::text || ' ' || COALESCE(NULLIF(_time, ''), '09:00') || ':00')::timestamp;

  IF item.training_id IS NOT NULL THEN
    SELECT t.* INTO existing_training FROM public.trainings t WHERE t.id = item.training_id;
  END IF;

  IF existing_training.id IS NOT NULL AND existing_training.approval_status <> 'approved' THEN
    UPDATE public.trainings
      SET scheduled_at = new_at,
          approval_status = 'pending',
          requested_by = _name,
          requested_at = now(),
          status = 'agendado',
          updated_at = now()
      WHERE id = existing_training.id;
    RETURN existing_training.id;
  END IF;

  IF existing_training.id IS NOT NULL AND existing_training.approval_status = 'approved' THEN
    RAISE EXCEPTION 'Esta etapa já tem visita confirmada';
  END IF;

  INSERT INTO public.trainings (
    workspace_id, created_by, title, client, description, scheduled_at,
    duration_minutes, visit_type, status, requires_acceptance,
    approval_status, requested_by, requested_at
  ) VALUES (
    item.workspace_id, sched.owner_id,
    sched.client_name || ' — ' || item.title,
    sched.client_name,
    'Visita solicitada pelo cliente pelo cronograma.',
    new_at, 120, 'presencial', 'agendado', false,
    'pending', _name, now()
  ) RETURNING id INTO new_id;

  UPDATE public.schedule_items SET training_id = new_id, updated_at = now() WHERE id = item.id;

  RETURN new_id;
END $function$;

GRANT EXECUTE ON FUNCTION public.request_schedule_visit(text, uuid, date, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_schedule_by_token(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'schedule', to_jsonb(s.*),
    'phases', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'position', p.position, 'title', p.title, 'description', p.description,
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', it.id, 'position', it.position, 'title', it.title, 'description', it.description,
            'planned_date', it.planned_date, 'done_date', it.done_date,
            'scheduled_date', (SELECT scheduled_at FROM public.trainings t WHERE t.id = it.training_id),
            'approval_status', (SELECT approval_status FROM public.trainings t WHERE t.id = it.training_id),
            'status', it.status, 'assignee', it.assignee, 'notes', it.notes
          ) ORDER BY it.position)
          FROM public.schedule_items it WHERE it.phase_id = p.id
        ), '[]'::jsonb)
      ) ORDER BY p.position)
      FROM public.schedule_phases p WHERE p.schedule_id = s.id
    ), '[]'::jsonb)
  )
  INTO result
  FROM public.implementation_schedules s
  WHERE s.public_token = _token;
  RETURN result;
END $function$;
