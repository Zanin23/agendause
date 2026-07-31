ALTER TABLE public.guest_acceptances ADD COLUMN IF NOT EXISTS signature text;
ALTER TABLE public.handoff_terms ADD COLUMN IF NOT EXISTS client_signature text;

CREATE OR REPLACE FUNCTION public.accept_handoff_by_token(_token text, _name text, _ip text, _signature text DEFAULT NULL)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_count int;
BEGIN
  UPDATE public.handoff_terms
    SET client_accepted_at = now(),
        client_accepted_name = _name,
        client_accepted_ip = _ip,
        client_signature = _signature
  WHERE public_token = _token AND client_accepted_at IS NULL;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_handoff_by_token(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', h.id,
    'client_name', h.client_name,
    'modules', h.modules,
    'notes', h.notes,
    'client_accepted_at', h.client_accepted_at,
    'client_accepted_name', h.client_accepted_name,
    'client_signature', h.client_signature,
    'support_accepted_at', h.support_accepted_at,
    'support_accepted_name', h.support_accepted_name,
    'created_at', h.created_at,
    'schedule', jsonb_build_object(
      'client_name', s.client_name,
      'start_date', s.start_date,
      'modality', s.modality
    )
  ) INTO result
  FROM public.handoff_terms h
  JOIN public.implementation_schedules s ON s.id = h.schedule_id
  WHERE h.public_token = _token;
  RETURN result;
END; $function$;