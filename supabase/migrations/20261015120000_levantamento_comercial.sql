-- Levantamento Comercial e Pré-Implantação
-- Estrutura normalizada e isolada por base de trabalho. Não altera nem migra
-- dados existentes; o vínculo ao cronograma é opcional e preserva seu ciclo de vida.
BEGIN;

CREATE TABLE IF NOT EXISTS public.commercial_assessment_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'module', 'integration_category', 'demand_category', 'emitter_type', 'migration_group'
  )),
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, kind, name)
);

CREATE TABLE IF NOT EXISTS public.commercial_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.implementation_schedules(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  sales_owner text,
  surveyed_on date,
  contracted_on date,
  planned_start_date date,
  implementation_owner text,
  primary_contact_name text,
  primary_contact_phone text,
  primary_contact_whatsapp text,
  primary_contact_email text,
  general_notes text,
  integration_mapping_confirmed boolean NOT NULL DEFAULT false,
  migration_reviewed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'em_preenchimento' CHECK (status IN (
    'em_preenchimento', 'aguardando_comercial', 'aguardando_cliente',
    'pronto_analise', 'em_analise', 'devolvido', 'aprovado_planejamento', 'arquivado'
  )),
  review_notes text,
  technical_review_checklist jsonb NOT NULL DEFAULT '{"scope": false, "dependencies": false, "gaps": false}'::jsonb,
  technical_review_completed boolean NOT NULL DEFAULT false,
  technical_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  technical_reviewed_at timestamptz,
  completion_percent integer NOT NULL DEFAULT 0 CHECK (completion_percent BETWEEN 0 AND 100),
  pending_count integer NOT NULL DEFAULT 0 CHECK (pending_count >= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- No more than one active assessment is associated with a given implementation project.
CREATE UNIQUE INDEX IF NOT EXISTS commercial_assessments_schedule_unique
  ON public.commercial_assessments(schedule_id) WHERE schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commercial_assessments_workspace_date_idx
  ON public.commercial_assessments(workspace_id, surveyed_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS commercial_assessments_status_idx
  ON public.commercial_assessments(workspace_id, status);

CREATE TABLE IF NOT EXISTS public.commercial_assessment_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.commercial_assessments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  legal_name text,
  trade_name text,
  cnpj text,
  state_registration text,
  municipal_registration text,
  address text,
  city text,
  state text,
  tax_regime text,
  main_activity text,
  observations text,
  individual_configuration boolean NOT NULL DEFAULT false,
  is_primary boolean NOT NULL DEFAULT false,
  certificate_status text NOT NULL DEFAULT 'confirmar'
    CHECK (certificate_status IN ('possui', 'nao_possui', 'confirmar', 'nao_aplicavel')),
  certificate_type text,
  fiscal_contact text,
  accountant text,
  fiscal_observations text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commercial_assessment_one_primary_company
  ON public.commercial_assessment_companies(assessment_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS commercial_assessment_companies_assessment_idx
  ON public.commercial_assessment_companies(assessment_id);

CREATE TABLE IF NOT EXISTS public.commercial_assessment_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.commercial_assessments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES public.commercial_assessment_catalog(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'confirmar'
    CHECK (status IN ('contratado', 'nao_contratado', 'confirmar')),
  notes text,
  particularities text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, catalog_id)
);
CREATE INDEX IF NOT EXISTS commercial_assessment_modules_assessment_idx
  ON public.commercial_assessment_modules(assessment_id);

CREATE TABLE IF NOT EXISTS public.commercial_assessment_emitters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.commercial_assessments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.commercial_assessment_companies(id) ON DELETE CASCADE,
  document_type_id uuid NOT NULL REFERENCES public.commercial_assessment_catalog(id) ON DELETE RESTRICT,
  other_document_name text,
  status text NOT NULL DEFAULT 'pendente_confirmacao'
    CHECK (status IN ('contratado', 'necessario_nao_contratado', 'nao_aplicavel', 'pendente_confirmacao')),
  notes text,
  state_or_municipal_details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, document_type_id)
);
CREATE INDEX IF NOT EXISTS commercial_assessment_emitters_assessment_idx
  ON public.commercial_assessment_emitters(assessment_id);

CREATE TABLE IF NOT EXISTS public.commercial_assessment_dimensions (
  assessment_id uuid PRIMARY KEY REFERENCES public.commercial_assessments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contracted_users integer CHECK (contracted_users IS NULL OR contracted_users >= 0),
  users_by_module jsonb NOT NULL DEFAULT '{}'::jsonb,
  stores_or_branches integer CHECK (stores_or_branches IS NULL OR stores_or_branches >= 0),
  warehouses integer CHECK (warehouses IS NULL OR warehouses >= 0),
  pos_terminals integer CHECK (pos_terminals IS NULL OR pos_terminals >= 0),
  salespeople integer CHECK (salespeople IS NULL OR salespeople >= 0),
  products_count bigint CHECK (products_count IS NULL OR products_count >= 0),
  customers_suppliers_count bigint CHECK (customers_suppliers_count IS NULL OR customers_suppliers_count >= 0),
  monthly_movements_count bigint CHECK (monthly_movements_count IS NULL OR monthly_movements_count >= 0),
  production_units integer CHECK (production_units IS NULL OR production_units >= 0),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commercial_assessment_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.commercial_assessments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  category_id uuid REFERENCES public.commercial_assessment_catalog(id) ON DELETE SET NULL,
  category_name_snapshot text,
  vendor text,
  website text,
  implementation_type text NOT NULL DEFAULT 'nao_definido'
    CHECK (implementation_type IN ('existente', 'a_desenvolver', 'nao_definido')),
  contracted_status text NOT NULL DEFAULT 'a_confirmar'
    CHECK (contracted_status IN ('contratada', 'nao_contratada', 'a_confirmar')),
  is_in_use text NOT NULL DEFAULT 'a_confirmar'
    CHECK (is_in_use IN ('sim', 'nao', 'a_confirmar')),
  source_system text,
  destination_system text,
  data_scope text,
  direction text NOT NULL DEFAULT 'a_confirmar'
    CHECK (direction IN ('entrada', 'saida', 'bidirecional', 'a_confirmar')),
  communication_method text NOT NULL DEFAULT 'a_confirmar'
    CHECK (communication_method IN ('api', 'arquivo', 'planilha', 'conector', 'outro', 'a_confirmar')),
  method_details text,
  documentation_status text NOT NULL DEFAULT 'a_confirmar'
    CHECK (documentation_status IN ('sim', 'nao', 'a_confirmar')),
  admin_access_status text NOT NULL DEFAULT 'a_confirmar'
    CHECK (admin_access_status IN ('sim', 'nao', 'a_confirmar')),
  external_technical_contact text,
  additional_costs text NOT NULL DEFAULT 'a_confirmar'
    CHECK (additional_costs IN ('sim', 'nao', 'a_confirmar')),
  planned_start_date date,
  status text NOT NULL DEFAULT 'nao_avaliada'
    CHECK (status IN (
      'nao_avaliada', 'aguardando_cliente', 'aguardando_fornecedor', 'analise_tecnica',
      'contratada', 'desenvolvimento', 'testes', 'homologada', 'implantada', 'nao_realizada'
    )),
  owner text,
  observations text,
  risks_and_questions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_assessment_integrations_assessment_idx
  ON public.commercial_assessment_integrations(assessment_id);

CREATE TABLE IF NOT EXISTS public.commercial_assessment_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.commercial_assessments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  data_group_id uuid REFERENCES public.commercial_assessment_catalog(id) ON DELETE SET NULL,
  data_group_snapshot text,
  necessary_status text NOT NULL DEFAULT 'confirmar'
    CHECK (necessary_status IN ('sim', 'nao', 'confirmar')),
  source_system text,
  available_format text NOT NULL DEFAULT 'a_confirmar'
    CHECK (available_format IN ('excel', 'csv', 'xml', 'banco_dados', 'api', 'outro', 'a_confirmar')),
  format_details text,
  data_provider text,
  expected_delivery_date date,
  preparation_status text NOT NULL DEFAULT 'nao_solicitados'
    CHECK (preparation_status IN ('nao_solicitados', 'solicitados', 'recebidos', 'em_analise', 'validados', 'pendentes_correcao')),
  validation_status text NOT NULL DEFAULT 'nao_solicitados'
    CHECK (validation_status IN ('nao_solicitados', 'solicitados', 'recebidos', 'em_analise', 'validados', 'pendentes_correcao')),
  observations text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_assessment_migrations_assessment_idx
  ON public.commercial_assessment_migrations(assessment_id);

CREATE TABLE IF NOT EXISTS public.commercial_assessment_demands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.commercial_assessments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category_id uuid REFERENCES public.commercial_assessment_catalog(id) ON DELETE SET NULL,
  category_name_snapshot text,
  related_module text,
  priority text NOT NULL DEFAULT 'media'
    CHECK (priority IN ('baixa', 'media', 'alta', 'critica')),
  analysis_owner text,
  custom_development boolean NOT NULL DEFAULT false,
  additional_budget boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'aguardando_analise'
    CHECK (status IN ('aguardando_analise', 'aprovada', 'orcamento_adicional', 'nao_aprovada', 'em_desenvolvimento', 'concluida')),
  observations text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_assessment_demands_assessment_idx
  ON public.commercial_assessment_demands(assessment_id);

CREATE TABLE IF NOT EXISTS public.commercial_assessment_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.commercial_assessments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  job_title text,
  department text,
  phone text,
  email text,
  project_role text,
  responsible_subjects text[] NOT NULL DEFAULT '{}'::text[],
  observations text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_assessment_contacts_assessment_idx
  ON public.commercial_assessment_contacts(assessment_id);

CREATE TABLE IF NOT EXISTS public.commercial_assessment_infrastructure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.commercial_assessments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  question_key text NOT NULL,
  answer text NOT NULL DEFAULT 'a_confirmar'
    CHECK (answer IN ('sim', 'nao', 'nao_aplicavel', 'a_confirmar')),
  details text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, question_key)
);

CREATE TABLE IF NOT EXISTS public.commercial_assessment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.commercial_assessments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_assessment_history_assessment_idx
  ON public.commercial_assessment_history(assessment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commercial_assessment_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.commercial_assessments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  migration_id uuid REFERENCES public.commercial_assessment_migrations(id) ON DELETE SET NULL,
  file_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  file_size bigint,
  mime_type text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_assessment_files_assessment_idx
  ON public.commercial_assessment_files(assessment_id);

-- Existing schedule tables remain the source of truth for project and chronology.
ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS commercial_assessment_id uuid REFERENCES public.commercial_assessments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commercial_assessment_source text;
CREATE INDEX IF NOT EXISTS schedule_items_commercial_assessment_idx
  ON public.schedule_items(commercial_assessment_id, commercial_assessment_source)
  WHERE commercial_assessment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS schedule_items_commercial_assessment_source_unique
  ON public.schedule_items(commercial_assessment_id, commercial_assessment_source)
  WHERE commercial_assessment_id IS NOT NULL AND commercial_assessment_source IS NOT NULL;

-- Seed editable defaults per existing workspace. New options are added by admins;
-- these examples are references only and do not create integration records.
INSERT INTO public.commercial_assessment_catalog (workspace_id, kind, name, position)
SELECT w.id, v.kind, v.name, v.position
FROM public.workspaces w
CROSS JOIN (VALUES
  ('module', 'ERP', 10), ('module', 'CRM', 20), ('module', 'PDV', 30),
  ('module', 'E-commerce / Commerce', 40), ('module', 'Compras', 50),
  ('module', 'Vendas', 60), ('module', 'Estoque e almoxarifado', 70),
  ('module', 'Fiscal', 80), ('module', 'Financeiro', 90),
  ('module', 'Contas a pagar', 100), ('module', 'Contas a receber', 110),
  ('module', 'Tesouraria', 120), ('module', 'Produção / PCP', 130),
  ('module', 'Outros módulos', 140),
  ('integration_category', 'Integrador de pedidos de e-commerce', 10),
  ('integration_category', 'Marketplace', 20), ('integration_category', 'Plataforma de e-commerce', 30),
  ('integration_category', 'Hub de integração', 40), ('integration_category', 'Emissor fiscal', 50),
  ('integration_category', 'Sistema contábil', 60), ('integration_category', 'Plataforma de pagamentos', 70),
  ('integration_category', 'Gateway de pagamento', 80), ('integration_category', 'Transportadora / frete', 90),
  ('integration_category', 'CRM externo', 100), ('integration_category', 'Sistema de logística', 110),
  ('integration_category', 'Sistema de produção', 120), ('integration_category', 'Banco / sistema financeiro', 130),
  ('integration_category', 'API própria', 140), ('integration_category', 'Outro', 150),
  ('demand_category', 'Ajustes de usabilidade', 10), ('demand_category', 'Customizações', 20),
  ('demand_category', 'Relatórios', 30), ('demand_category', 'Integrações', 40),
  ('demand_category', 'Desenvolvimento', 50), ('demand_category', 'Configurações especiais', 60),
  ('demand_category', 'Processos operacionais', 70), ('demand_category', 'Treinamentos', 80),
  ('demand_category', 'Fiscal', 90), ('demand_category', 'Migração de dados', 100),
  ('demand_category', 'Outras demandas', 110),
  ('emitter_type', 'NF-e', 10), ('emitter_type', 'NFC-e', 20),
  ('emitter_type', 'NFS-e', 30), ('emitter_type', 'Outros documentos fiscais', 40),
  ('migration_group', 'Clientes', 10), ('migration_group', 'Fornecedores', 20),
  ('migration_group', 'Produtos', 30), ('migration_group', 'Estoque e saldos', 40),
  ('migration_group', 'Contas a pagar', 50), ('migration_group', 'Contas a receber', 60),
  ('migration_group', 'Histórico de vendas', 70), ('migration_group', 'Pedidos e itens', 80),
  ('migration_group', 'Dados fiscais', 90), ('migration_group', 'Dados financeiros', 100),
  ('migration_group', 'Títulos em aberto', 110), ('migration_group', 'Dados de produção', 120),
  ('migration_group', 'Outros', 130)
) AS v(kind, name, position)
ON CONFLICT (workspace_id, kind, name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_use_commercial_assessment(_user_id uuid, _screen text, _action text DEFAULT 'read')
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles r
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.screen_permissions, '[]'::jsonb)) p(value)
      WHERE r.user_id = _user_id
        AND p.value ->> 'screen' = _screen
        AND COALESCE(p.value -> 'actions', '[]'::jsonb) ? _action
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_commercial_assessment(_assessment_id uuid, _action text DEFAULT 'read')
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _workspace uuid;
  _schedule uuid;
BEGIN
  SELECT a.workspace_id, a.schedule_id INTO _workspace, _schedule
  FROM public.commercial_assessments a WHERE a.id = _assessment_id;
  IF _workspace IS NULL OR _workspace IS DISTINCT FROM public.current_workspace() THEN
    RETURN false;
  END IF;

  IF _action = 'read' THEN
    RETURN public.can_use_commercial_assessment(auth.uid(), 'commercial_assessments', 'read')
      OR public.can_use_commercial_assessment(auth.uid(), 'commercial_assessments', 'write')
      OR public.can_use_commercial_assessment(auth.uid(), 'commercial_assessments_review', 'read')
      OR public.can_use_commercial_assessment(auth.uid(), 'commercial_assessments_review', 'write')
      OR (_schedule IS NOT NULL AND public.has_schedule_permission(auth.uid(), _schedule, 'read'));
  END IF;

  RETURN public.can_use_commercial_assessment(auth.uid(), 'commercial_assessments', 'write')
    OR public.can_use_commercial_assessment(auth.uid(), 'commercial_assessments_review', 'write')
    OR (_schedule IS NOT NULL AND public.has_schedule_permission(auth.uid(), _schedule, 'write'));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_commercial_assessment_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _schedule_workspace uuid;
BEGIN
  IF NEW.workspace_id IS NULL THEN NEW.workspace_id := public.current_workspace(); END IF;
  IF NEW.workspace_id IS NULL OR NEW.workspace_id IS DISTINCT FROM public.current_workspace() THEN
    RAISE EXCEPTION 'Base de trabalho inválida para o levantamento comercial';
  END IF;
  IF NEW.schedule_id IS NOT NULL THEN
    SELECT workspace_id INTO _schedule_workspace FROM public.implementation_schedules WHERE id = NEW.schedule_id;
    IF _schedule_workspace IS NULL OR _schedule_workspace IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'O cronograma precisa pertencer à mesma base do levantamento';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_commercial_child_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _parent_workspace uuid;
BEGIN
  SELECT workspace_id INTO _parent_workspace FROM public.commercial_assessments WHERE id = NEW.assessment_id;
  IF _parent_workspace IS NULL OR _parent_workspace IS DISTINCT FROM public.current_workspace() THEN
    RAISE EXCEPTION 'Levantamento comercial inválido para a base atual';
  END IF;
  IF NEW.workspace_id IS NOT NULL AND NEW.workspace_id IS DISTINCT FROM _parent_workspace THEN
    RAISE EXCEPTION 'Base de trabalho do registro relacionado inválida';
  END IF;
  NEW.workspace_id := _parent_workspace;
  IF TG_OP = 'INSERT' AND TG_TABLE_NAME NOT IN (
    'commercial_assessment_dimensions', 'commercial_assessment_infrastructure'
  ) THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
  END IF;
  IF TG_TABLE_NAME NOT IN ('commercial_assessment_history', 'commercial_assessment_files') THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_commercial_assessment_relations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _company_assessment uuid;
  _catalog_workspace uuid;
  _catalog_kind text;
  _migration_assessment uuid;
BEGIN
  IF TG_TABLE_NAME = 'commercial_assessment_emitters' THEN
    SELECT assessment_id INTO _company_assessment FROM public.commercial_assessment_companies WHERE id = NEW.company_id;
    IF _company_assessment IS DISTINCT FROM NEW.assessment_id THEN
      RAISE EXCEPTION 'A empresa fiscal precisa pertencer ao mesmo levantamento';
    END IF;
    SELECT workspace_id, kind INTO _catalog_workspace, _catalog_kind FROM public.commercial_assessment_catalog WHERE id = NEW.document_type_id;
    IF _catalog_workspace IS DISTINCT FROM NEW.workspace_id OR _catalog_kind <> 'emitter_type' THEN
      RAISE EXCEPTION 'Tipo de documento fiscal inválido';
    END IF;
  ELSIF TG_TABLE_NAME = 'commercial_assessment_modules' THEN
    SELECT workspace_id, kind INTO _catalog_workspace, _catalog_kind FROM public.commercial_assessment_catalog WHERE id = NEW.catalog_id;
    IF _catalog_workspace IS DISTINCT FROM NEW.workspace_id OR _catalog_kind <> 'module' THEN
      RAISE EXCEPTION 'Módulo inválido para a base atual';
    END IF;
  ELSIF TG_TABLE_NAME = 'commercial_assessment_integrations' THEN
    IF NEW.category_id IS NOT NULL THEN
      SELECT workspace_id, kind INTO _catalog_workspace, _catalog_kind FROM public.commercial_assessment_catalog WHERE id = NEW.category_id;
      IF _catalog_workspace IS DISTINCT FROM NEW.workspace_id OR _catalog_kind <> 'integration_category' THEN
        RAISE EXCEPTION 'Categoria de integração inválida';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'commercial_assessment_migrations' THEN
    IF NEW.data_group_id IS NOT NULL THEN
      SELECT workspace_id, kind INTO _catalog_workspace, _catalog_kind FROM public.commercial_assessment_catalog WHERE id = NEW.data_group_id;
      IF _catalog_workspace IS DISTINCT FROM NEW.workspace_id OR _catalog_kind <> 'migration_group' THEN
        RAISE EXCEPTION 'Grupo de dados inválido';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'commercial_assessment_demands' THEN
    IF NEW.category_id IS NOT NULL THEN
      SELECT workspace_id, kind INTO _catalog_workspace, _catalog_kind FROM public.commercial_assessment_catalog WHERE id = NEW.category_id;
      IF _catalog_workspace IS DISTINCT FROM NEW.workspace_id OR _catalog_kind <> 'demand_category' THEN
        RAISE EXCEPTION 'Categoria de demanda inválida';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'commercial_assessment_files' THEN
    IF NEW.migration_id IS NOT NULL THEN
      SELECT assessment_id INTO _migration_assessment FROM public.commercial_assessment_migrations WHERE id = NEW.migration_id;
      IF _migration_assessment IS DISTINCT FROM NEW.assessment_id THEN
        RAISE EXCEPTION 'O arquivo precisa pertencer à migração deste levantamento';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_commercial_assessment_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _reviewer boolean := public.can_use_commercial_assessment(auth.uid(), 'commercial_assessments_review', 'write');
  _sales boolean := public.can_use_commercial_assessment(auth.uid(), 'commercial_assessments', 'write');
  _admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role);
  _actor_name text;
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'em_preenchimento' AND NOT _admin THEN
      RAISE EXCEPTION 'Um levantamento novo deve iniciar em preenchimento';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status IN ('aprovado_planejamento', 'arquivado') AND NOT (_admin OR _reviewer) THEN
      RAISE EXCEPTION 'Somente a implantação pode reabrir um levantamento aprovado ou arquivado';
    END IF;
    IF OLD.status = 'aprovado_planejamento' AND NEW.status NOT IN ('em_analise', 'arquivado') AND NOT _admin THEN
      RAISE EXCEPTION 'Um levantamento aprovado só pode ser reaberto para análise ou arquivado';
    END IF;
    IF OLD.status = 'arquivado' AND NEW.status <> 'em_analise' AND NOT _admin THEN
      RAISE EXCEPTION 'Um levantamento arquivado só pode ser reaberto para análise';
    END IF;

    IF NEW.status IN ('em_preenchimento', 'pronto_analise') THEN
      IF NOT (_admin OR _sales) THEN
        RAISE EXCEPTION 'Somente o comercial pode atualizar esta etapa do fluxo';
      END IF;
      IF NOT _admin AND OLD.status IN ('em_analise', 'aprovado_planejamento', 'arquivado') THEN
        RAISE EXCEPTION 'A implantação precisa reabrir a análise antes de retomar o preenchimento';
      END IF;
    ELSIF NEW.status = 'aguardando_comercial' THEN
      IF NOT (_admin OR _reviewer) THEN
        RAISE EXCEPTION 'Somente a implantação pode solicitar complementação do comercial';
      END IF;
      IF OLD.status <> 'em_analise' AND NOT _admin THEN
        RAISE EXCEPTION 'A solicitação ao comercial deve partir de uma análise em andamento';
      END IF;
    ELSIF NEW.status = 'aguardando_cliente' THEN
      IF NOT (_admin OR _sales OR _reviewer) THEN
        RAISE EXCEPTION 'Somente o comercial ou a implantação pode registrar esta espera';
      END IF;
      IF OLD.status = 'em_analise' AND NOT (_admin OR _reviewer) THEN
        RAISE EXCEPTION 'A implantação precisa encaminhar a solicitação ao cliente';
      END IF;
    ELSE
      IF NOT (_admin OR _reviewer) THEN
        RAISE EXCEPTION 'Somente a equipe de implantação pode atualizar a análise técnica';
      END IF;
    END IF;

    IF NEW.status = 'devolvido' AND NULLIF(btrim(COALESCE(NEW.review_notes, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Informe as pendências objetivas antes de devolver o levantamento';
    END IF;

    IF NEW.status = 'aprovado_planejamento' THEN
      IF OLD.status <> 'em_analise' THEN
        RAISE EXCEPTION 'O levantamento precisa estar em análise antes da aprovação';
      END IF;
      IF COALESCE((NEW.technical_review_checklist ->> 'scope')::boolean, false) = false
        OR COALESCE((NEW.technical_review_checklist ->> 'dependencies')::boolean, false) = false
        OR COALESCE((NEW.technical_review_checklist ->> 'gaps')::boolean, false) = false THEN
        RAISE EXCEPTION 'Conclua a lista de validação técnica antes de aprovar';
      END IF;
      NEW.technical_review_completed := true;
      NEW.technical_reviewed_by := auth.uid();
      NEW.technical_reviewed_at := now();
    ELSIF OLD.status = 'aprovado_planejamento' THEN
      NEW.technical_review_completed := false;
      NEW.technical_reviewed_by := NULL;
      NEW.technical_reviewed_at := NULL;
    END IF;

    SELECT full_name INTO _actor_name FROM public.profiles WHERE id = auth.uid();
    INSERT INTO public.commercial_assessment_history (
      assessment_id, workspace_id, from_status, to_status, note, changed_by, changed_by_name
    ) VALUES (
      NEW.id, NEW.workspace_id, OLD.status, NEW.status,
      NULLIF(btrim(COALESCE(NEW.review_notes, '')), ''), auth.uid(),
      COALESCE(_actor_name, auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() ->> 'email')
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_commercial_assessment_creation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor_name text;
BEGIN
  SELECT full_name INTO _actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.commercial_assessment_history (
    assessment_id, workspace_id, from_status, to_status, note, changed_by, changed_by_name
  ) VALUES (
    NEW.id, NEW.workspace_id, NULL, NEW.status, 'Levantamento criado', auth.uid(),
    COALESCE(_actor_name, auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() ->> 'email')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_commercial_demand_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _reviewer boolean := public.can_use_commercial_assessment(auth.uid(), 'commercial_assessments_review', 'write')
    OR public.has_role(auth.uid(), 'admin'::public.app_role);
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status <> 'aguardando_analise' AND NOT _reviewer THEN
    RAISE EXCEPTION 'Uma demanda comercial inicia aguardando análise; somente implantação pode registrar uma decisão';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status <> 'aguardando_analise' AND NOT _reviewer THEN
    RAISE EXCEPTION 'Somente a equipe de implantação pode aprovar ou decidir uma demanda';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_commercial_schedule_item_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _assessment_schedule uuid;
  _assessment_status text;
  _phase_schedule uuid;
  _commercial_link_changed boolean := false;
BEGIN
  IF NEW.commercial_assessment_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      _commercial_link_changed := true;
    ELSE
      _commercial_link_changed := NEW.commercial_assessment_id IS DISTINCT FROM OLD.commercial_assessment_id
        OR NEW.commercial_assessment_source IS DISTINCT FROM OLD.commercial_assessment_source;
    END IF;
    SELECT schedule_id, status INTO _assessment_schedule, _assessment_status
    FROM public.commercial_assessments WHERE id = NEW.commercial_assessment_id;
    SELECT schedule_id INTO _phase_schedule FROM public.schedule_phases WHERE id = NEW.phase_id;
    IF _assessment_schedule IS NULL OR _assessment_schedule IS DISTINCT FROM _phase_schedule THEN
      RAISE EXCEPTION 'A atividade e o levantamento precisam estar vinculados ao mesmo cronograma';
    END IF;
    IF _commercial_link_changed AND _assessment_status <> 'aprovado_planejamento' THEN
      RAISE EXCEPTION 'Somente um levantamento aprovado pela implantação pode gerar atividades';
    END IF;
    IF NEW.commercial_assessment_source IS NULL THEN
      RAISE EXCEPTION 'Informe a origem da sugestão de atividade';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS commercial_assessments_workspace_trg ON public.commercial_assessments;
CREATE TRIGGER commercial_assessments_workspace_trg BEFORE INSERT OR UPDATE ON public.commercial_assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_commercial_assessment_workspace();
DROP TRIGGER IF EXISTS commercial_assessments_status_trg ON public.commercial_assessments;
CREATE TRIGGER commercial_assessments_status_trg BEFORE INSERT OR UPDATE ON public.commercial_assessments
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_assessment_status();
DROP TRIGGER IF EXISTS commercial_assessments_created_history_trg ON public.commercial_assessments;
CREATE TRIGGER commercial_assessments_created_history_trg AFTER INSERT ON public.commercial_assessments
  FOR EACH ROW EXECUTE FUNCTION public.log_commercial_assessment_creation();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'commercial_assessment_companies', 'commercial_assessment_modules',
    'commercial_assessment_emitters', 'commercial_assessment_integrations',
    'commercial_assessment_migrations', 'commercial_assessment_demands',
    'commercial_assessment_contacts', 'commercial_assessment_infrastructure',
    'commercial_assessment_files'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_workspace_trg', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_commercial_child_workspace()', t || '_workspace_trg', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_relations_trg', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.validate_commercial_assessment_relations()', t || '_relations_trg', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['commercial_assessment_dimensions', 'commercial_assessment_history'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_workspace_trg', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_commercial_child_workspace()', t || '_workspace_trg', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS commercial_assessment_catalog_updated_at ON public.commercial_assessment_catalog;
CREATE TRIGGER commercial_assessment_catalog_updated_at BEFORE UPDATE ON public.commercial_assessment_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'commercial_assessment_companies', 'commercial_assessment_modules',
    'commercial_assessment_emitters', 'commercial_assessment_integrations',
    'commercial_assessment_migrations', 'commercial_assessment_demands',
    'commercial_assessment_contacts'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t || '_updated_at', t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS commercial_assessment_schedule_item_source_trg ON public.schedule_items;
CREATE TRIGGER commercial_assessment_schedule_item_source_trg BEFORE INSERT OR UPDATE ON public.schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_commercial_schedule_item_source();
DROP TRIGGER IF EXISTS commercial_assessment_demand_decision_trg ON public.commercial_assessment_demands;
CREATE TRIGGER commercial_assessment_demand_decision_trg BEFORE INSERT OR UPDATE ON public.commercial_assessment_demands
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_demand_decision();

-- RLS: all data is isolated to the selected workspace. Commercial staff can fill
-- records; review permission is separate; project-specific access is respected.
ALTER TABLE public.commercial_assessment_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_assessment_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_assessment_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_assessment_emitters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_assessment_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_assessment_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_assessment_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_assessment_demands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_assessment_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_assessment_infrastructure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_assessment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_assessment_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commercial_catalog_read ON public.commercial_assessment_catalog;
CREATE POLICY commercial_catalog_read ON public.commercial_assessment_catalog
  FOR SELECT TO authenticated USING (workspace_id = public.current_workspace());
DROP POLICY IF EXISTS commercial_catalog_admin_insert ON public.commercial_assessment_catalog;
CREATE POLICY commercial_catalog_admin_insert ON public.commercial_assessment_catalog
  FOR INSERT TO authenticated WITH CHECK (
    workspace_id = public.current_workspace() AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
DROP POLICY IF EXISTS commercial_catalog_admin_update ON public.commercial_assessment_catalog;
CREATE POLICY commercial_catalog_admin_update ON public.commercial_assessment_catalog
  FOR UPDATE TO authenticated USING (
    workspace_id = public.current_workspace() AND public.has_role(auth.uid(), 'admin'::public.app_role)
  ) WITH CHECK (
    workspace_id = public.current_workspace() AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
DROP POLICY IF EXISTS commercial_catalog_admin_delete ON public.commercial_assessment_catalog;
CREATE POLICY commercial_catalog_admin_delete ON public.commercial_assessment_catalog
  FOR DELETE TO authenticated USING (
    workspace_id = public.current_workspace() AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS commercial_assessments_read ON public.commercial_assessments;
CREATE POLICY commercial_assessments_read ON public.commercial_assessments
  FOR SELECT TO authenticated USING (
    workspace_id = public.current_workspace() AND public.can_access_commercial_assessment(id, 'read')
  );
DROP POLICY IF EXISTS commercial_assessments_insert ON public.commercial_assessments;
CREATE POLICY commercial_assessments_insert ON public.commercial_assessments
  FOR INSERT TO authenticated WITH CHECK (
    workspace_id = public.current_workspace() AND (
      public.can_use_commercial_assessment(auth.uid(), 'commercial_assessments', 'write')
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR (schedule_id IS NOT NULL AND public.has_schedule_permission(auth.uid(), schedule_id, 'write'))
    )
  );
DROP POLICY IF EXISTS commercial_assessments_update ON public.commercial_assessments;
CREATE POLICY commercial_assessments_update ON public.commercial_assessments
  FOR UPDATE TO authenticated USING (
    workspace_id = public.current_workspace() AND public.can_access_commercial_assessment(id, 'write')
  ) WITH CHECK (
    workspace_id = public.current_workspace() AND public.can_access_commercial_assessment(id, 'write')
  );
DROP POLICY IF EXISTS commercial_assessments_delete_admin ON public.commercial_assessments;
CREATE POLICY commercial_assessments_delete_admin ON public.commercial_assessments
  FOR DELETE TO authenticated USING (
    workspace_id = public.current_workspace() AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'commercial_assessment_companies', 'commercial_assessment_modules',
    'commercial_assessment_emitters', 'commercial_assessment_dimensions',
    'commercial_assessment_integrations', 'commercial_assessment_migrations',
    'commercial_assessment_demands', 'commercial_assessment_contacts',
    'commercial_assessment_infrastructure', 'commercial_assessment_files'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (workspace_id = public.current_workspace() AND public.can_access_commercial_assessment(assessment_id, ''read''))', t || '_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (workspace_id = public.current_workspace() AND public.can_access_commercial_assessment(assessment_id, ''write'')) WITH CHECK (workspace_id = public.current_workspace() AND public.can_access_commercial_assessment(assessment_id, ''write''))', t || '_write', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS commercial_assessment_history_read ON public.commercial_assessment_history;
CREATE POLICY commercial_assessment_history_read ON public.commercial_assessment_history
  FOR SELECT TO authenticated USING (
    workspace_id = public.current_workspace() AND public.can_access_commercial_assessment(assessment_id, 'read')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_assessment_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_assessments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_assessment_companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_assessment_modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_assessment_emitters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_assessment_dimensions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_assessment_integrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_assessment_migrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_assessment_demands TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_assessment_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_assessment_infrastructure TO authenticated;
GRANT SELECT ON public.commercial_assessment_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_assessment_files TO authenticated;

REVOKE ALL ON FUNCTION public.can_use_commercial_assessment(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_commercial_assessment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_use_commercial_assessment(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_commercial_assessment(uuid, text) TO authenticated;

-- Reuse the existing file-upload pattern but with a private, separately scoped bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'commercial-assessment-files', 'commercial-assessment-files', false, 26214400,
  ARRAY['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv', 'application/csv', 'application/xml', 'text/xml', 'application/zip', 'application/octet-stream',
        'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS commercial_assessment_files_storage_read ON storage.objects;
CREATE POLICY commercial_assessment_files_storage_read ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'commercial-assessment-files'
    AND public.can_access_commercial_assessment(((storage.foldername(name))[1])::uuid, 'read')
  );
DROP POLICY IF EXISTS commercial_assessment_files_storage_insert ON storage.objects;
CREATE POLICY commercial_assessment_files_storage_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'commercial-assessment-files'
    AND public.can_access_commercial_assessment(((storage.foldername(name))[1])::uuid, 'write')
  );
DROP POLICY IF EXISTS commercial_assessment_files_storage_update ON storage.objects;
CREATE POLICY commercial_assessment_files_storage_update ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'commercial-assessment-files'
    AND public.can_access_commercial_assessment(((storage.foldername(name))[1])::uuid, 'write')
  ) WITH CHECK (
    bucket_id = 'commercial-assessment-files'
    AND public.can_access_commercial_assessment(((storage.foldername(name))[1])::uuid, 'write')
  );
DROP POLICY IF EXISTS commercial_assessment_files_storage_delete ON storage.objects;
CREATE POLICY commercial_assessment_files_storage_delete ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'commercial-assessment-files'
    AND public.can_access_commercial_assessment(((storage.foldername(name))[1])::uuid, 'write')
  );

-- Inserting suggested activities is permitted only for users with schedule write access.
DROP POLICY IF EXISTS schedule_permission_insert_phases ON public.schedule_phases;
CREATE POLICY schedule_permission_insert_phases ON public.schedule_phases
  FOR INSERT TO authenticated WITH CHECK (
    workspace_id = public.current_workspace()
    AND public.has_schedule_permission(auth.uid(), schedule_id, 'write')
  );
DROP POLICY IF EXISTS schedule_permission_insert_items ON public.schedule_items;
CREATE POLICY schedule_permission_insert_items ON public.schedule_items
  FOR INSERT TO authenticated WITH CHECK (
    workspace_id = public.current_workspace()
    AND public.has_schedule_permission(auth.uid(), (SELECT p.schedule_id FROM public.schedule_phases p WHERE p.id = phase_id), 'write')
  );

COMMENT ON TABLE public.commercial_assessments IS 'Levantamentos comerciais associados a clientes e projetos de implantação.';
COMMENT ON TABLE public.commercial_assessment_integrations IS 'Integrações externas; nome informado não representa garantia de viabilidade técnica.';
COMMENT ON COLUMN public.commercial_assessment_demands.status IS 'Demandas levantadas não são aprovadas nem contratadas automaticamente.';
COMMENT ON COLUMN public.schedule_items.commercial_assessment_source IS 'Referência legível à informação do levantamento comercial que originou a atividade.';

COMMIT;
