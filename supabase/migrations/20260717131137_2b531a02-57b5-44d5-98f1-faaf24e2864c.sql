
CREATE TABLE public.handoff_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL UNIQUE REFERENCES public.implementation_schedules(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  public_token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  client_accepted_at timestamptz,
  client_accepted_name text,
  client_accepted_ip text,
  support_accepted_at timestamptz,
  support_accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  support_accepted_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.handoff_terms TO authenticated;
GRANT ALL ON public.handoff_terms TO service_role;

ALTER TABLE public.handoff_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view handoff terms"
  ON public.handoff_terms FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert handoff terms"
  ON public.handoff_terms FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update handoff terms"
  ON public.handoff_terms FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can delete handoff terms"
  ON public.handoff_terms FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_handoff_terms_updated_at
  BEFORE UPDATE ON public.handoff_terms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-fill workspace_id from schedule
CREATE OR REPLACE FUNCTION public.set_handoff_workspace_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.implementation_schedules WHERE id = NEW.schedule_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER set_handoff_workspace_id_trg
  BEFORE INSERT ON public.handoff_terms
  FOR EACH ROW EXECUTE FUNCTION public.set_handoff_workspace_id();

-- Public token access RPC
CREATE OR REPLACE FUNCTION public.get_handoff_by_token(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
END; $$;

CREATE OR REPLACE FUNCTION public.accept_handoff_by_token(_token text, _name text, _ip text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE public.handoff_terms
    SET client_accepted_at = now(),
        client_accepted_name = _name,
        client_accepted_ip = _ip
  WHERE public_token = _token AND client_accepted_at IS NULL;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END; $$;

-- Support acceptance: only workspace 'suporte' members
CREATE OR REPLACE FUNCTION public.accept_handoff_as_support(_handoff_id uuid, _name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_support boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = auth.uid() AND w.slug = 'suporte'
  ) INTO is_support;
  IF NOT is_support THEN
    RAISE EXCEPTION 'Somente membros do Suporte podem aceitar o termo';
  END IF;
  UPDATE public.handoff_terms
    SET support_accepted_at = now(),
        support_accepted_by = auth.uid(),
        support_accepted_name = _name
  WHERE id = _handoff_id;
  RETURN true;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_handoff_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_handoff_by_token(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_handoff_as_support(uuid, text) TO authenticated;
