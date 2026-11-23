-- As RPCs administrativas exigem sessão autenticada também no nível de permissão.
-- As próprias funções já validam auth.uid(), mas o REVOKE explícito evita que
-- apareçam como executáveis pela role anônima no catálogo da API.
REVOKE ALL ON FUNCTION public.cancel_training_with_term(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_training_cancellation_term(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.cancel_training_with_term(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_training_cancellation_term(uuid) TO authenticated;
