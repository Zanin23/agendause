-- =============================================================================
-- Endurecimento de segurança + índices faltantes
-- =============================================================================
-- Data: 2026-09-28
-- Motivo: auditoria encontrou quatro classes de exposição de dados entre
--         workspaces e para chamadores anônimos.
--
-- O que esta migration faz:
--   1. ISOLA POR WORKSPACE as tabelas de levantamento de processos, que estavam
--      com RLS ligado mas políticas `USING (true)` — qualquer usuário logado,
--      de qualquer base, lia/editava/apagava os questionários de todos os
--      clientes, incluindo nome e e-mail de quem respondeu.
--   2. FECHA O UPLOAD ANÔNIMO irrestrito no bucket `survey-files`.
--   3. ESCOPA POR WORKSPACE a leitura/exclusão de arquivos de levantamento, que
--      valia para qualquer usuário autenticado em todas as bases.
--   4. CRIA OS ÍNDICES em workspace_id, que não existiam em nenhuma tabela
--      apesar de ser a coluna usada por todas as políticas de isolamento.
--   5. Adiciona trilha de auditoria para ações administrativas.
--
-- REVERTER: veja a seção 9 no final.
-- =============================================================================


-- =============================================================================
-- 1. LEVANTAMENTOS — isolamento por workspace
-- =============================================================================
-- SITUAÇÃO ANTERIOR (migration 20260921185820):
--   CREATE POLICY "auth view surveys"   ON public.process_surveys
--     FOR SELECT TO authenticated USING (true);
--   CREATE POLICY "auth update surveys" ON public.process_surveys
--     FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
--   ...e o mesmo padrão em survey_questions, survey_answers e survey_files.
--
--   RLS estava habilitado, mas `USING (true)` não filtra nada. Nenhuma dessas
--   quatro tabelas recebeu a política restritiva ws_isolation que as outras 14
--   tabelas do sistema têm. Resultado: vazamento e adulteração entre bases.
--
-- SOLUÇÃO: política RESTRICTIVE, como no resto do sistema. RESTRICTIVE se soma
-- às permissivas existentes por AND, então não é preciso apagar as antigas —
-- elas continuam valendo, mas agora limitadas à base ativa do usuário.
-- -----------------------------------------------------------------------------

-- 1.1 Backfill: linhas criadas antes do trigger set_survey_workspace_id_trg
--     podem estar com workspace_id NULL. Sem backfill, a política restritiva
--     tornaria esses questionários invisíveis para todo mundo.
--
-- ⚠️ VERIFICAÇÃO ANTES DE APLICAR. Rode isto e confira o resultado:
--
--      SELECT sv.id, sv.title, sv.status, s.id AS schedule_id, s.workspace_id
--        FROM public.process_surveys sv
--        LEFT JOIN public.implementation_schedules s ON s.id = sv.schedule_id
--       WHERE sv.workspace_id IS NULL;
--
--    Se retornar linhas cujo s.workspace_id TAMBÉM é NULL, o backfill abaixo
--    não vai resolvê-las: esses questionários ficarão invisíveis e, pior, a
--    política WITH CHECK impedirá inserir perguntas neles. Corrija o
--    workspace_id do cronograma pai ANTES de aplicar esta migration.
UPDATE public.process_surveys sv
   SET workspace_id = s.workspace_id
  FROM public.implementation_schedules s
 WHERE sv.workspace_id IS NULL
   AND sv.schedule_id = s.id
   AND s.workspace_id IS NOT NULL;

-- 1.2 process_surveys tem coluna própria.
CREATE POLICY ws_isolation ON public.process_surveys
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (workspace_id = public.current_workspace())
  WITH CHECK (workspace_id = public.current_workspace());

-- 1.3 As três tabelas filhas não têm workspace_id: herdam o tenant pelo
--     survey_id. EXISTS contra a tabela pai resolve sem mudar o schema.
CREATE POLICY ws_isolation ON public.survey_questions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.process_surveys sv
     WHERE sv.id = survey_id
       AND sv.workspace_id = public.current_workspace()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.process_surveys sv
     WHERE sv.id = survey_id
       AND sv.workspace_id = public.current_workspace()
  ));

CREATE POLICY ws_isolation ON public.survey_answers
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.process_surveys sv
     WHERE sv.id = survey_id
       AND sv.workspace_id = public.current_workspace()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.process_surveys sv
     WHERE sv.id = survey_id
       AND sv.workspace_id = public.current_workspace()
  ));

CREATE POLICY ws_isolation ON public.survey_files
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.process_surveys sv
     WHERE sv.id = survey_id
       AND sv.workspace_id = public.current_workspace()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.process_surveys sv
     WHERE sv.id = survey_id
       AND sv.workspace_id = public.current_workspace()
  ));

-- 1.4 O fluxo público /q/:token NÃO é afetado: ele passa pelas RPCs
--     get_survey_by_token, save_survey_answers e register_survey_file, todas
--     SECURITY DEFINER, que ignoram RLS. Convidado continua respondendo normal.


-- =============================================================================
-- 2. BUCKET survey-files — fechar upload anônimo irrestrito
-- =============================================================================
-- SITUAÇÃO ANTERIOR:
--   CREATE POLICY "Anyone can upload survey files" ON storage.objects
--     FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'survey-files');
--
--   Qualquer pessoa na internet, sem conta, podia gravar arquivo arbitrário no
--   Storage: sem limite de tamanho, sem validação de tipo, sem vínculo com um
--   levantamento existente e sem frequência máxima.
--
-- O caminho real usado pelo front-end (src/pages/SurveyPublic.tsx) é:
--     `${token}/${Date.now()}-${nomeSanitizado}`
-- ou seja, a primeira pasta é o public_token do levantamento. A política nova
-- usa exatamente isso: para gravar, o chamador precisa conhecer um token de um
-- levantamento AINDA ABERTO. Token é gen_random_bytes(16) = 128 bits.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can upload survey files" ON storage.objects;
DROP POLICY IF EXISTS "Team can read survey files"       ON storage.objects;
DROP POLICY IF EXISTS "Team can delete survey files"     ON storage.objects;

-- 2.1 Auxiliar SECURITY DEFINER: precisa ignorar o RLS de process_surveys para
--     conferir o token, já que o chamador anônimo não tem workspace.
CREATE OR REPLACE FUNCTION public.is_open_survey_token(_token text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.process_surveys
     WHERE public_token = _token
       AND submitted_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.is_open_survey_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_open_survey_token(text) TO anon, authenticated;

-- 2.2 Auxiliar: o usuário logado pertence à base dona do levantamento cujo
--     token abre o caminho do arquivo?
CREATE OR REPLACE FUNCTION public.can_access_survey_path(_path text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.process_surveys sv
      JOIN public.workspace_members m ON m.workspace_id = sv.workspace_id
     WHERE sv.public_token = (storage.foldername(_path))[1]
       AND m.user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.can_access_survey_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_survey_path(text) TO authenticated;

-- 2.3 Convidado: só grava dentro do token de um levantamento aberto.
CREATE POLICY "survey_files_guest_upload_open_survey" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'survey-files'
    AND public.is_open_survey_token((storage.foldername(name))[1])
  );

-- 2.4 Equipe autenticada: grava, lê e apaga apenas na própria base.
CREATE POLICY "survey_files_team_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'survey-files'
    AND public.can_access_survey_path(name)
  );

CREATE POLICY "survey_files_team_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'survey-files'
    AND public.can_access_survey_path(name)
  );

CREATE POLICY "survey_files_team_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'survey-files'
    AND public.can_access_survey_path(name)
  );

-- 2.5 Limite de tamanho no bucket (25 MB). É o mecanismo correto para isso —
--     política RLS não enxerga o tamanho do arquivo antes de gravar.
--     Para restringir também os tipos, descomente e ajuste a lista; NÃO ative
--     sem conferir quais MIME o front-end envia de fato, senão o upload quebra.
UPDATE storage.buckets
   SET file_size_limit = 26214400
 WHERE id = 'survey-files';
-- UPDATE storage.buckets
--    SET allowed_mime_types = ARRAY[
--      'image/jpeg','image/png','image/webp','application/pdf','text/csv',
--      'application/msword',
--      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
--      'application/vnd.ms-excel',
--      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
--    ]
--  WHERE id = 'survey-files';


-- =============================================================================
-- 3. ÍNDICES EM workspace_id
-- =============================================================================
-- O sistema tinha 15 índices, todos em chaves estrangeiras de detalhe. Nenhum
-- em workspace_id — justamente a coluna avaliada por linha em cada política
-- restritiva. current_workspace() é um subselect em profiles, então sem índice
-- o custo cresce junto com o tamanho das tabelas.
-- -----------------------------------------------------------------------------

-- 3.1 As duas lookups mais quentes do sistema.
CREATE INDEX IF NOT EXISTS workspace_members_user_workspace_idx
  ON public.workspace_members (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS profiles_active_workspace_idx
  ON public.profiles (id) INCLUDE (active_workspace_id);

-- 3.2 Coluna do tenant nas tabelas que já a possuem.
CREATE INDEX IF NOT EXISTS trainings_workspace_scheduled_idx
  ON public.trainings (workspace_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS implementation_schedules_workspace_idx
  ON public.implementation_schedules (workspace_id);
CREATE INDEX IF NOT EXISTS schedule_phases_workspace_idx
  ON public.schedule_phases (workspace_id);
CREATE INDEX IF NOT EXISTS schedule_items_workspace_status_idx
  ON public.schedule_items (workspace_id, status);
CREATE INDEX IF NOT EXISTS schedule_comments_workspace_idx
  ON public.schedule_comments (workspace_id);
CREATE INDEX IF NOT EXISTS handoff_terms_workspace_idx
  ON public.handoff_terms (workspace_id);
CREATE INDEX IF NOT EXISTS company_notes_workspace_idx
  ON public.company_notes (workspace_id);
CREATE INDEX IF NOT EXISTS billing_requests_workspace_week_idx
  ON public.billing_requests (workspace_id, week_start, status);
CREATE INDEX IF NOT EXISTS billing_request_updates_workspace_idx
  ON public.billing_request_updates (workspace_id);
CREATE INDEX IF NOT EXISTS billing_notification_settings_workspace_idx
  ON public.billing_notification_settings (workspace_id) WHERE enabled;
CREATE INDEX IF NOT EXISTS training_acceptances_workspace_idx
  ON public.training_acceptances (workspace_id);
CREATE INDEX IF NOT EXISTS training_attachments_workspace_idx
  ON public.training_attachments (workspace_id);
CREATE INDEX IF NOT EXISTS training_reschedules_workspace_idx
  ON public.training_reschedules (workspace_id);
CREATE INDEX IF NOT EXISTS guest_acceptances_workspace_idx
  ON public.guest_acceptances (workspace_id);
CREATE INDEX IF NOT EXISTS implementation_templates_workspace_idx
  ON public.implementation_templates (workspace_id);
CREATE INDEX IF NOT EXISTS process_surveys_workspace_idx
  ON public.process_surveys (workspace_id);

-- 3.3 Suportam as políticas EXISTS da seção 1.
--     (Não criar índice em process_surveys.public_token nem em
--     survey_files.survey_id: o primeiro já é UNIQUE e o segundo já tem
--     idx_survey_files_survey da migration 20260921185820.)
CREATE INDEX IF NOT EXISTS survey_answers_question_idx
  ON public.survey_answers (question_id);


-- =============================================================================
-- 4. AUDITORIA DE AÇÕES ADMINISTRATIVAS
-- =============================================================================
-- A função admin-users promove e demove administradores sem deixar registro.
-- Só administradores leem; ninguém altera ou apaga pela API (a gravação é feita
-- pela Edge Function, que usa service_role e portanto ignora RLS).
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  target_id  uuid,
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_audit_read ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx
  ON public.admin_audit_log (created_at DESC);


-- =============================================================================
-- 5. VERIFICAÇÃO PÓS-APLICAÇÃO
-- =============================================================================
-- Rode estas consultas e confirme os resultados esperados:
--
-- (a) Nenhuma tabela com RLS e política permissiva total:
--       SELECT tablename, policyname, permissive, cmd, qual
--         FROM pg_policies
--        WHERE schemaname = 'public' AND qual = 'true';
--     Esperado: nenhuma linha (ou apenas as intencionalmente públicas, como
--     guest_acceptances para o fluxo de aceite).
--
-- (b) As quatro tabelas de survey agora têm política restritiva:
--       SELECT tablename, policyname FROM pg_policies
--        WHERE policyname = 'ws_isolation'
--          AND tablename IN ('process_surveys','survey_questions',
--                            'survey_answers','survey_files');
--     Esperado: 4 linhas.
--
-- (c) Nenhum questionário órfão de workspace:
--       SELECT count(*) FROM public.process_surveys WHERE workspace_id IS NULL;
--     Esperado: 0. Se vier diferente de zero, esses registros ficaram
--     invisíveis — investigue o schedule_id deles antes de seguir.
--
-- (d) Índices criados:
--       SELECT count(*) FROM pg_indexes
--        WHERE schemaname = 'public' AND indexname LIKE '%workspace%';
--
-- (e) Políticas antigas do bucket removidas:
--       SELECT policyname FROM pg_policies
--        WHERE schemaname = 'storage' AND tablename = 'objects'
--          AND policyname LIKE '%survey%';
--     Esperado: 4 linhas, todas com o novo nome survey_files_*.
-- =============================================================================


-- =============================================================================
-- 6. AÇÃO MANUAL OBRIGATÓRIA — pg_cron (fora desta migration)
-- =============================================================================
-- A função send-billing-notifications passou a exigir o header X-Cron-Secret.
-- O job do pg_cron precisa ser atualizado, senão os lembretes de cobrança param
-- de ser enviados silenciosamente.
--
--   6.1 Definir o segredo (no terminal, não no SQL):
--         supabase secrets set CRON_SECRET="$(openssl rand -hex 32)"
--
--   6.2 Descobrir o job existente:
--         SELECT jobid, jobname, command FROM cron.job;
--
--   6.3 Recriar o job enviando o header. Ajuste schedule e url conforme o que
--       aparecer em 6.2:
--
--         SELECT cron.schedule(
--           'billing-notifications',
--           '* * * * *',
--           $$
--           SELECT net.http_post(
--             url := 'https://psgekwifthuzduhpreay.supabase.co/functions/v1/send-billing-notifications',
--             headers := jsonb_build_object(
--               'Content-Type',  'application/json',
--               'X-Cron-Secret', '<O_MESMO_VALOR_DE_CRON_SECRET>'
--             ),
--             body := '{}'::jsonb,
--             timeout_milliseconds := 30000
--           );
--           $$
--         );
--
--       Se preferir não deixar o segredo escrito no comando do job, guarde-o em
--       app.settings e leia com current_setting('app.settings.cron_secret').
--
--   6.4 Testar: dispare o job e confira cron.job_run_details.
-- =============================================================================


-- =============================================================================
-- 7. AÇÃO MANUAL OBRIGATÓRIA — publicar as Edge Functions
-- =============================================================================
-- Commitar este arquivo NÃO altera o banco, e alterar as funções no repositório
-- NÃO as publica. Nada desta correção entra em vigor até você:
--
--   supabase db push                                  # aplica esta migration
--   supabase functions deploy weekly-report
--   supabase functions deploy attachment-signed-url
--   supabase functions deploy send-billing-notifications
--   supabase functions deploy admin-users
--
-- (ou usar o SQL Editor e o painel de Edge Functions do Supabase)
--
-- Enquanto o deploy não acontecer, o vazamento continua ativo.
-- =============================================================================


-- =============================================================================
-- 8. PENDÊNCIA CONHECIDA — não corrigida aqui de propósito
-- =============================================================================
-- `update_requires_acceptance.sql` está solto na raiz do repositório. É um
-- backfill de dados, não uma mudança de estrutura. Misturar isso num patch de
-- segurança arriscaria sobrescrever valores ajustados manualmente em produção.
-- Trate separadamente: revise, aplique se ainda for necessário e mova o arquivo
-- para supabase/migrations/ com timestamp.


-- =============================================================================
-- 9. REVERTER
-- =============================================================================
-- Em caso de problema, esta é a reversão exata. Guarde antes de aplicar.
--
--   DROP POLICY IF EXISTS ws_isolation ON public.process_surveys;
--   DROP POLICY IF EXISTS ws_isolation ON public.survey_questions;
--   DROP POLICY IF EXISTS ws_isolation ON public.survey_answers;
--   DROP POLICY IF EXISTS ws_isolation ON public.survey_files;
--
--   DROP POLICY IF EXISTS "survey_files_guest_upload_open_survey" ON storage.objects;
--   DROP POLICY IF EXISTS "survey_files_team_insert" ON storage.objects;
--   DROP POLICY IF EXISTS "survey_files_team_read"   ON storage.objects;
--   DROP POLICY IF EXISTS "survey_files_team_delete" ON storage.objects;
--   CREATE POLICY "Anyone can upload survey files" ON storage.objects
--     FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'survey-files');
--   CREATE POLICY "Team can read survey files" ON storage.objects
--     FOR SELECT TO authenticated USING (bucket_id = 'survey-files');
--   CREATE POLICY "Team can delete survey files" ON storage.objects
--     FOR DELETE TO authenticated USING (bucket_id = 'survey-files');
--
--   DROP FUNCTION IF EXISTS public.is_open_survey_token(text);
--   DROP FUNCTION IF EXISTS public.can_access_survey_path(text);
--   DROP TABLE IF EXISTS public.admin_audit_log;
--   UPDATE storage.buckets SET file_size_limit = NULL WHERE id = 'survey-files';
--
-- Os índices da seção 3 podem ser mantidos: não alteram comportamento, só
-- desempenho. Para removê-los, DROP INDEX IF EXISTS <nome> um a um.
-- =============================================================================
