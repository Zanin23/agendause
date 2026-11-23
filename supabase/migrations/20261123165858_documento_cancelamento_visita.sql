-- Documento assinado de cancelamento de visita/treinamento.
-- O termo guarda uma fotografia dos dados no momento do cancelamento para que
-- alterações posteriores na agenda ou no cronograma não mudem o documento já emitido.

CREATE TABLE IF NOT EXISTS public.training_cancellation_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  training_id uuid NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  document_status text NOT NULL DEFAULT 'pending'
    CHECK (document_status IN ('pending', 'signed', 'voided')),
  document_version smallint NOT NULL DEFAULT 1,

  -- Fotografia da visita cancelada
  training_title text NOT NULL,
  client_name text,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  location text,
  visit_type text NOT NULL,
  cancellation_reason text NOT NULL,
  cancelled_at timestamptz NOT NULL,

  -- Fotografia do cronograma vinculado, quando houver
  schedule_id uuid,
  schedule_name text,
  schedule_start_date date,
  schedule_item_title text,
  schedule_item_planned_date date,

  -- Assinatura do representante do cliente
  signer_name text,
  signer_email text,
  signer_role text,
  signature text,
  signed_at timestamptz,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  void_reason text,

  CONSTRAINT training_cancellation_terms_signed_fields_check CHECK (
    document_status <> 'signed'
    OR (
      signer_name IS NOT NULL
      AND signer_email IS NOT NULL
      AND signature IS NOT NULL
      AND signed_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS training_cancellation_terms_training_idx
  ON public.training_cancellation_terms(training_id, created_at DESC);
CREATE INDEX IF NOT EXISTS training_cancellation_terms_workspace_idx
  ON public.training_cancellation_terms(workspace_id, created_at DESC);

ALTER TABLE public.training_cancellation_terms ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.training_cancellation_terms TO authenticated;
GRANT ALL ON public.training_cancellation_terms TO service_role;

DROP POLICY IF EXISTS "Cancellation terms readable in current workspace"
  ON public.training_cancellation_terms;
CREATE POLICY "Cancellation terms readable in current workspace"
  ON public.training_cancellation_terms
  FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace());

DROP TRIGGER IF EXISTS training_cancellation_terms_updated_at
  ON public.training_cancellation_terms;
CREATE TRIGGER training_cancellation_terms_updated_at
  BEFORE UPDATE ON public.training_cancellation_terms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função interna: cria a fotografia imutável do cancelamento e do cronograma.
CREATE OR REPLACE FUNCTION public.insert_training_cancellation_term_snapshot(
  _training_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training public.trainings%ROWTYPE;
  v_schedule_id uuid;
  v_schedule_name text;
  v_schedule_start_date date;
  v_schedule_item_title text;
  v_schedule_item_planned_date date;
  v_term_id uuid;
BEGIN
  SELECT * INTO v_training
  FROM public.trainings
  WHERE id = _training_id;

  IF v_training.id IS NULL THEN
    RAISE EXCEPTION 'Visita não encontrada';
  END IF;

  SELECT
    schedule.id,
    COALESCE(NULLIF(BTRIM(schedule.title), ''), NULLIF(BTRIM(schedule.subject), ''), schedule.client_name),
    schedule.start_date,
    item.title,
    item.planned_date
  INTO
    v_schedule_id,
    v_schedule_name,
    v_schedule_start_date,
    v_schedule_item_title,
    v_schedule_item_planned_date
  FROM public.schedule_items item
  JOIN public.schedule_phases phase ON phase.id = item.phase_id
  JOIN public.implementation_schedules schedule ON schedule.id = phase.schedule_id
  WHERE item.training_id = _training_id
  ORDER BY phase.position, item.position
  LIMIT 1;

  INSERT INTO public.training_cancellation_terms (
    training_id,
    workspace_id,
    training_title,
    client_name,
    scheduled_at,
    duration_minutes,
    location,
    visit_type,
    cancellation_reason,
    cancelled_at,
    schedule_id,
    schedule_name,
    schedule_start_date,
    schedule_item_title,
    schedule_item_planned_date,
    created_by
  ) VALUES (
    v_training.id,
    v_training.workspace_id,
    v_training.title,
    v_training.client,
    v_training.scheduled_at,
    v_training.duration_minutes,
    v_training.location,
    COALESCE(NULLIF(BTRIM(v_training.visit_type), ''), 'presencial'),
    COALESCE(NULLIF(BTRIM(v_training.cancellation_reason), ''), 'Cancelamento solicitado pelo cliente.'),
    COALESCE(v_training.cancelled_at, now()),
    v_schedule_id,
    v_schedule_name,
    v_schedule_start_date,
    v_schedule_item_title,
    v_schedule_item_planned_date,
    auth.uid()
  )
  RETURNING id INTO v_term_id;

  RETURN v_term_id;
END;
$$;
REVOKE ALL ON FUNCTION public.insert_training_cancellation_term_snapshot(uuid) FROM PUBLIC, anon, authenticated;

-- Cancela a visita e emite o documento em uma única transação.
CREATE OR REPLACE FUNCTION public.cancel_training_with_term(
  _training_id uuid,
  _reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training public.trainings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária';
  END IF;

  IF NULLIF(BTRIM(_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento';
  END IF;

  IF char_length(BTRIM(_reason)) > 1000 THEN
    RAISE EXCEPTION 'O motivo deve ter no máximo 1000 caracteres';
  END IF;

  SELECT * INTO v_training
  FROM public.trainings
  WHERE id = _training_id
  FOR UPDATE;

  IF v_training.id IS NULL THEN
    RAISE EXCEPTION 'Visita não encontrada';
  END IF;

  IF v_training.workspace_id IS DISTINCT FROM public.current_workspace()
     OR NOT (
       v_training.created_by = auth.uid()
       OR public.has_role(auth.uid(), 'admin'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar esta visita';
  END IF;

  IF v_training.status = 'cancelado' THEN
    RAISE EXCEPTION 'Esta visita já está cancelada';
  END IF;

  UPDATE public.training_cancellation_terms
  SET document_status = 'voided',
      voided_at = now(),
      void_reason = 'Substituído por um novo cancelamento.'
  WHERE training_id = _training_id
    AND document_status = 'pending';

  UPDATE public.trainings
  SET status = 'cancelado',
      cancellation_reason = BTRIM(_reason),
      cancelled_at = now()
  WHERE id = _training_id;

  RETURN public.insert_training_cancellation_term_snapshot(_training_id);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_training_with_term(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_training_with_term(uuid, text) TO authenticated;

-- Emite um termo para cancelamentos antigos, sem duplicar um documento ativo.
CREATE OR REPLACE FUNCTION public.create_training_cancellation_term(
  _training_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training public.trainings%ROWTYPE;
  v_existing_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária';
  END IF;

  SELECT * INTO v_training
  FROM public.trainings
  WHERE id = _training_id
  FOR UPDATE;

  IF v_training.id IS NULL THEN
    RAISE EXCEPTION 'Visita não encontrada';
  END IF;

  IF v_training.workspace_id IS DISTINCT FROM public.current_workspace()
     OR NOT (
       v_training.created_by = auth.uid()
       OR public.has_role(auth.uid(), 'admin'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Sem permissão para emitir este documento';
  END IF;

  IF v_training.status <> 'cancelado' THEN
    RAISE EXCEPTION 'O documento só pode ser emitido para uma visita cancelada';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.training_cancellation_terms
  WHERE training_id = _training_id
    AND document_status IN ('pending', 'signed')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  RETURN public.insert_training_cancellation_term_snapshot(_training_id);
END;
$$;
REVOKE ALL ON FUNCTION public.create_training_cancellation_term(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_training_cancellation_term(uuid) TO authenticated;

-- Reabrir uma visita invalida somente documentos ainda não assinados.
CREATE OR REPLACE FUNCTION public.void_pending_cancellation_terms_on_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'cancelado' AND NEW.status <> 'cancelado' THEN
    UPDATE public.training_cancellation_terms
    SET document_status = 'voided',
        voided_at = now(),
        void_reason = 'Visita reativada ou reagendada pela equipe.'
    WHERE training_id = NEW.id
      AND document_status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trainings_void_pending_cancellation_terms ON public.trainings;
CREATE TRIGGER trainings_void_pending_cancellation_terms
  AFTER UPDATE OF status ON public.trainings
  FOR EACH ROW EXECUTE FUNCTION public.void_pending_cancellation_terms_on_reactivation();

-- Um termo assinado é evidência e não pode desaparecer com a exclusão da visita.
CREATE OR REPLACE FUNCTION public.protect_signed_cancellation_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.training_cancellation_terms
    WHERE training_id = OLD.id
      AND document_status = 'signed'
  ) THEN
    RAISE EXCEPTION 'Não é possível excluir uma visita com documento de cancelamento assinado';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trainings_protect_signed_cancellation_terms ON public.trainings;
CREATE TRIGGER trainings_protect_signed_cancellation_terms
  BEFORE DELETE ON public.trainings
  FOR EACH ROW EXECUTE FUNCTION public.protect_signed_cancellation_terms();

-- Leitura pública controlada pelo token opaco do documento.
CREATE OR REPLACE FUNCTION public.get_cancellation_term_by_token(
  _token uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', term.id,
    'document_number', UPPER(SUBSTRING(REPLACE(term.id::text, '-', '') FROM 1 FOR 10)),
    'document_status', term.document_status,
    'document_version', term.document_version,
    'training_title', term.training_title,
    'client_name', term.client_name,
    'scheduled_at', term.scheduled_at,
    'duration_minutes', term.duration_minutes,
    'location', term.location,
    'visit_type', term.visit_type,
    'cancellation_reason', term.cancellation_reason,
    'cancelled_at', term.cancelled_at,
    'schedule_name', term.schedule_name,
    'schedule_start_date', term.schedule_start_date,
    'schedule_item_title', term.schedule_item_title,
    'schedule_item_planned_date', term.schedule_item_planned_date,
    'signer_name', term.signer_name,
    'signer_email', term.signer_email,
    'signer_role', term.signer_role,
    'signature', term.signature,
    'signed_at', term.signed_at,
    'created_at', term.created_at,
    'voided_at', term.voided_at,
    'void_reason', term.void_reason
  )
  FROM public.training_cancellation_terms term
  WHERE term.public_token = _token;
$$;
REVOKE ALL ON FUNCTION public.get_cancellation_term_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cancellation_term_by_token(uuid) TO anon, authenticated;

-- Assinatura pública: os dados do documento permanecem imutáveis; apenas os
-- campos do signatário e o status são preenchidos uma única vez.
CREATE OR REPLACE FUNCTION public.sign_cancellation_term(
  _token uuid,
  _name text,
  _email text,
  _role text,
  _signature text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_term public.training_cancellation_terms%ROWTYPE;
  v_signed_at timestamptz := now();
BEGIN
  SELECT * INTO v_term
  FROM public.training_cancellation_terms
  WHERE public_token = _token
  FOR UPDATE;

  IF v_term.id IS NULL THEN
    RAISE EXCEPTION 'Documento não encontrado';
  END IF;

  IF v_term.document_status = 'voided' THEN
    RAISE EXCEPTION 'Este documento foi invalidado pela equipe';
  END IF;

  IF v_term.document_status = 'signed' THEN
    RAISE EXCEPTION 'Este documento já foi assinado';
  END IF;

  IF char_length(BTRIM(COALESCE(_name, ''))) < 3
     OR char_length(BTRIM(_name)) > 160 THEN
    RAISE EXCEPTION 'Informe o nome completo do responsável';
  END IF;

  IF char_length(BTRIM(COALESCE(_email, ''))) > 254
     OR BTRIM(COALESCE(_email, '')) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' THEN
    RAISE EXCEPTION 'Informe um e-mail válido';
  END IF;

  IF char_length(BTRIM(COALESCE(_role, ''))) > 120 THEN
    RAISE EXCEPTION 'O cargo deve ter no máximo 120 caracteres';
  END IF;

  IF char_length(COALESCE(_signature, '')) < 50
     OR char_length(_signature) > 5000000
     OR _signature !~ '^data:image/' THEN
    RAISE EXCEPTION 'Assinatura inválida';
  END IF;

  UPDATE public.training_cancellation_terms
  SET document_status = 'signed',
      signer_name = BTRIM(_name),
      signer_email = LOWER(BTRIM(_email)),
      signer_role = NULLIF(BTRIM(_role), ''),
      signature = _signature,
      signed_at = v_signed_at
  WHERE id = v_term.id;

  RETURN jsonb_build_object(
    'id', v_term.id,
    'signed_at', v_signed_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.sign_cancellation_term(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_cancellation_term(uuid, text, text, text, text) TO anon, authenticated;
