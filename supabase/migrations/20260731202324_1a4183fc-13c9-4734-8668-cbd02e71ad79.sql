DROP FUNCTION IF EXISTS public.get_public_training(uuid);
CREATE FUNCTION public.get_public_training(_id uuid)
 RETURNS TABLE(id uuid, title text, client text, description text, scheduled_at timestamp with time zone, duration_minutes integer, location text, requires_acceptance boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id, t.title, t.client, t.description, t.scheduled_at, t.duration_minutes, t.location, t.requires_acceptance
  FROM public.trainings t
  WHERE t.id = _id;
$function$;