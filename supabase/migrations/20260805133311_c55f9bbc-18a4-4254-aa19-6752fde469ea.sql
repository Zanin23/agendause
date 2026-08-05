CREATE OR REPLACE FUNCTION public.get_schedule_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
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
END $$;