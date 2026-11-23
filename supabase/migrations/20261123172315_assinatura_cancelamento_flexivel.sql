-- Versão 2 do documento de cancelamento:
-- linguagem mais simples e assinatura aberta à pessoa escolhida pelo cliente.
-- E-mail e relação/cargo passam a ser opcionais.

ALTER TABLE public.training_cancellation_terms
  ALTER COLUMN document_version SET DEFAULT 2;

-- Ainda não há aceite definitivo em documentos pendentes, portanto eles podem
-- usar a nova redação e as novas regras de assinatura.
UPDATE public.training_cancellation_terms
SET document_version = 2
WHERE document_status = 'pending'
  AND document_version < 2;

ALTER TABLE public.training_cancellation_terms
  DROP CONSTRAINT IF EXISTS training_cancellation_terms_signed_fields_check;

ALTER TABLE public.training_cancellation_terms
  ADD CONSTRAINT training_cancellation_terms_signed_fields_check CHECK (
    document_status <> 'signed'
    OR (
      signer_name IS NOT NULL
      AND signature IS NOT NULL
      AND signed_at IS NOT NULL
    )
  );

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
  v_email text := NULLIF(BTRIM(COALESCE(_email, '')), '');
  v_role text := NULLIF(BTRIM(COALESCE(_role, '')), '');
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
    RAISE EXCEPTION 'Informe o nome de quem vai assinar';
  END IF;

  IF v_email IS NOT NULL
     AND (
       char_length(v_email) > 254
       OR v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'
     ) THEN
    RAISE EXCEPTION 'Confira o e-mail informado ou deixe o campo em branco';
  END IF;

  IF v_role IS NOT NULL AND char_length(v_role) > 120 THEN
    RAISE EXCEPTION 'A relação com o cliente deve ter no máximo 120 caracteres';
  END IF;

  IF char_length(COALESCE(_signature, '')) < 50
     OR char_length(_signature) > 5000000
     OR _signature !~ '^data:image/' THEN
    RAISE EXCEPTION 'Assinatura inválida';
  END IF;

  UPDATE public.training_cancellation_terms
  SET document_status = 'signed',
      signer_name = BTRIM(_name),
      signer_email = CASE WHEN v_email IS NULL THEN NULL ELSE LOWER(v_email) END,
      signer_role = v_role,
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
