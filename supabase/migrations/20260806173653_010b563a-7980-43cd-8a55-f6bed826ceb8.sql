-- Update user_roles to support granular permissions
-- Since we are on Supabase, we already have user_roles table from previous steps.
-- We'll add columns to store JSON-based permissions.

ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS screen_permissions JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS schedule_permissions JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_roles.screen_permissions IS 'List of allowed screens and their features. Example: [{"screen": "schedules", "actions": ["read", "write"]}]';
COMMENT ON COLUMN public.user_roles.schedule_permissions IS 'Specific schedule IDs the user can access and their level. Example: {"schedule_id": "read" | "write"}';

-- Add a helper function to check screen permissions
CREATE OR REPLACE FUNCTION public.has_screen_permission(_user_id uuid, _screen text, _action text DEFAULT 'read')
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins always have all permissions
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id AND role = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    from public.user_roles
    where user_id = _user_id
      AND (
        -- Check if screen exists in permissions and includes the action
        screen_permissions @> jsonb_build_array(jsonb_build_object('screen', _screen))
        OR 
        -- Fallback: check if they have the screen entry and we are just checking 'read'
        (_action = 'read' AND screen_permissions @> jsonb_build_array(jsonb_build_object('screen', _screen)))
      )
  );
END;
$$;

-- Add a helper function to check specific schedule permissions
CREATE OR REPLACE FUNCTION public.has_schedule_permission(_user_id uuid, _schedule_id uuid, _action text DEFAULT 'read')
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _perm text;
BEGIN
  -- Admins always have all permissions
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id AND role = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT schedule_permissions->>(_schedule_id::text) INTO _perm
  FROM public.user_roles
  WHERE user_id = _user_id;

  IF _perm IS NULL THEN
    -- If no specific permission, check if they have general 'schedules' screen write permission
    -- to see if they can see/edit ALL schedules in their workspace.
    RETURN public.has_screen_permission(_user_id, 'schedules', _action);
  END IF;

  IF _action = 'read' THEN
    RETURN _perm IN ('read', 'write');
  ELSIF _action = 'write' THEN
    RETURN _perm = 'write';
  END IF;

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_screen_permission TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_schedule_permission TO authenticated;
