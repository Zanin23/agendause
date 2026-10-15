export type AssessmentStatus =
  | "em_preenchimento"
  | "aguardando_comercial"
  | "aguardando_cliente"
  | "pronto_analise"
  | "em_analise"
  | "devolvido"
  | "aprovado_planejamento"
  | "arquivado";

export const ASSESSMENT_STATUS: Record<AssessmentStatus, { label: string; tone: string }> = {
  em_preenchimento: { label: "Em preenchimento", tone: "bg-muted text-muted-foreground border-border" },
  aguardando_comercial: { label: "Aguardando comercial", tone: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300" },
  aguardando_cliente: { label: "Aguardando cliente", tone: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300" },
  pronto_analise: { label: "Pronto para análise", tone: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300" },
  em_analise: { label: "Em análise técnica", tone: "bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300" },
  devolvido: { label: "Devolvido para complementação", tone: "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-300" },
  aprovado_planejamento: { label: "Aprovado para planejamento", tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300" },
  arquivado: { label: "Arquivado", tone: "bg-muted text-muted-foreground border-border" },
};

export const MODULE_STATUS = [
  { value: "contratado", label: "Contratado" },
  { value: "nao_contratado", label: "Não contratado" },
  { value: "confirmar", label: "Necessita confirmação" },
] as const;

export const EMITTER_STATUS = [
  { value: "contratado", label: "Contratado" },
  { value: "necessario_nao_contratado", label: "Necessário, não contratado" },
  { value: "nao_aplicavel", label: "Não aplicável" },
  { value: "pendente_confirmacao", label: "Pendente de confirmação" },
] as const;

export const INTEGRATION_STATUS = [
  { value: "nao_avaliada", label: "Não avaliada" },
  { value: "aguardando_cliente", label: "Aguardando informações do cliente" },
  { value: "aguardando_fornecedor", label: "Aguardando fornecedor" },
  { value: "analise_tecnica", label: "Em análise técnica" },
  { value: "contratada", label: "Contratada" },
  { value: "desenvolvimento", label: "Em desenvolvimento" },
  { value: "testes", label: "Em testes" },
  { value: "homologada", label: "Homologada" },
  { value: "implantada", label: "Implantada" },
  { value: "nao_realizada", label: "Não será realizada" },
] as const;

export const MIGRATION_STATUS = [
  { value: "nao_solicitados", label: "Não solicitados" },
  { value: "solicitados", label: "Solicitados" },
  { value: "recebidos", label: "Recebidos" },
  { value: "em_analise", label: "Em análise" },
  { value: "validados", label: "Validados" },
  { value: "pendentes_correcao", label: "Pendentes de correção" },
] as const;

export const ASSESSMENT_CATALOG_TYPES = [
  { value: "module", label: "Módulo" },
  { value: "integration_category", label: "Categoria de integração" },
  { value: "demand_category", label: "Categoria de demanda" },
  { value: "emitter_type", label: "Tipo de documento fiscal" },
  { value: "migration_group", label: "Grupo de dados para migração" },
] as const;

export type CatalogKind = (typeof ASSESSMENT_CATALOG_TYPES)[number]["value"];
export type CatalogOption = {
  id: string;
  workspace_id?: string;
  kind: CatalogKind;
  name: string;
  position: number;
  active: boolean;
};

export const INFRASTRUCTURE_QUESTIONS = [
  { key: "multiple_units", label: "O sistema será utilizado em uma ou várias unidades?" },
  { key: "physical_branches", label: "Existem filiais ou lojas físicas?" },
  { key: "ecommerce_operation", label: "Há operação de e-commerce?" },
  { key: "pos_equipment", label: "O cliente possui equipamentos ou terminais de PDV?" },
  { key: "printers_peripherals", label: "Existem impressoras, leitores, balanças ou outros periféricos?" },
  { key: "network_setup", label: "Há necessidade de configuração de rede ou equipamentos?" },
  { key: "legacy_systems", label: "Há sistemas antigos que precisarão permanecer em operação?" },
  { key: "critical_dates", label: "Existem datas críticas para início da operação?" },
  { key: "blackout_periods", label: "Há períodos em que não pode ocorrer interrupção?" },
  { key: "training_format", label: "Existe necessidade de treinamento presencial ou remoto?" },
  { key: "special_operations", label: "Há particularidades operacionais relevantes?" },
] as const;

export const COMPANY_TAX_REGIMES = [
  "Simples Nacional",
  "Lucro Presumido",
  "Lucro Real",
  "MEI",
  "Imune / Isenta",
  "A confirmar",
  "Outro",
] as const;

export const CONTACT_SUBJECTS = [
  "Direção", "Financeiro", "Fiscal", "Compras", "Vendas", "Estoque",
  "Produção", "TI", "E-commerce", "Decisão", "Operação", "Terceiro / fornecedor",
] as const;

export type AssessmentCompany = {
  id: string;
  legal_name: string;
  trade_name: string;
  cnpj: string;
  state_registration: string;
  municipal_registration: string;
  address: string;
  city: string;
  state: string;
  tax_regime: string;
  main_activity: string;
  observations: string;
  individual_configuration: boolean;
  is_primary: boolean;
  certificate_status: string;
  certificate_type: string;
  fiscal_contact: string;
  accountant: string;
  fiscal_observations: string;
};

export type AssessmentModule = {
  id: string;
  catalog_id: string;
  status: string;
  notes: string;
  particularities: string;
};

export type AssessmentEmitter = {
  id: string;
  company_id: string;
  document_type_id: string;
  other_document_name: string;
  status: string;
  notes: string;
  state_or_municipal_details: string;
};

export type AssessmentIntegration = {
  id: string;
  name: string;
  category_id: string;
  category_name_snapshot: string;
  vendor: string;
  website: string;
  implementation_type: string;
  contracted_status: string;
  is_in_use: string;
  source_system: string;
  destination_system: string;
  data_scope: string;
  direction: string;
  communication_method: string;
  method_details: string;
  documentation_status: string;
  admin_access_status: string;
  external_technical_contact: string;
  additional_costs: string;
  planned_start_date: string;
  status: string;
  owner: string;
  observations: string;
  risks_and_questions: string;
};

export type AssessmentMigration = {
  id: string;
  data_group_id: string;
  data_group_snapshot: string;
  necessary_status: string;
  source_system: string;
  available_format: string;
  format_details: string;
  data_provider: string;
  expected_delivery_date: string;
  preparation_status: string;
  validation_status: string;
  observations: string;
};

export type AssessmentDemand = {
  id: string;
  title: string;
  description: string;
  category_id: string;
  category_name_snapshot: string;
  related_module: string;
  priority: string;
  analysis_owner: string;
  custom_development: boolean;
  additional_budget: boolean;
  status: string;
  observations: string;
};

export type AssessmentContact = {
  id: string;
  name: string;
  job_title: string;
  department: string;
  phone: string;
  email: string;
  project_role: string;
  responsible_subjects: string[];
  observations: string;
};

export type AssessmentInfrastructure = {
  id: string;
  question_key: string;
  answer: string;
  details: string;
};

export type AssessmentDimensions = {
  contracted_users: string;
  users_by_module: Record<string, string>;
  stores_or_branches: string;
  warehouses: string;
  pos_terminals: string;
  salespeople: string;
  products_count: string;
  customers_suppliers_count: string;
  monthly_movements_count: string;
  production_units: string;
  notes: string;
};

export type AssessmentHistory = {
  id: string;
  from_status: AssessmentStatus | null;
  to_status: AssessmentStatus;
  note: string | null;
  changed_by_name: string | null;
  created_at: string;
};

export type AssessmentFile = {
  id: string;
  assessment_id: string;
  migration_id: string | null;
  file_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
};

export type CommercialAssessment = {
  id: string | null;
  workspace_id: string;
  schedule_id: string | null;
  client_name: string;
  sales_owner: string;
  surveyed_on: string;
  contracted_on: string;
  planned_start_date: string;
  implementation_owner: string;
  primary_contact_name: string;
  primary_contact_phone: string;
  primary_contact_whatsapp: string;
  primary_contact_email: string;
  general_notes: string;
  integration_mapping_confirmed: boolean;
  migration_reviewed: boolean;
  status: AssessmentStatus;
  review_notes: string;
  technical_review_checklist: { scope: boolean; dependencies: boolean; gaps: boolean };
  technical_review_completed: boolean;
  technical_reviewed_by: string | null;
  technical_reviewed_at: string | null;
  completion_percent: number;
  pending_count: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  companies: AssessmentCompany[];
  modules: AssessmentModule[];
  emitters: AssessmentEmitter[];
  dimensions: AssessmentDimensions;
  integrations: AssessmentIntegration[];
  migrations: AssessmentMigration[];
  demands: AssessmentDemand[];
  contacts: AssessmentContact[];
  infrastructure: AssessmentInfrastructure[];
  files: AssessmentFile[];
  history: AssessmentHistory[];
};

export type AssessmentPending = {
  key: string;
  message: string;
  responsible: "Comercial" | "Cliente" | "Implantação" | "Fornecedor";
};

export type SuggestedActivity = {
  title: string;
  sourceReference: string;
  sourceLabel: string;
};

export const STATUS_OPTIONS = Object.entries(ASSESSMENT_STATUS).map(([value, meta]) => ({ value, label: meta.label }));

export const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function emptyCompany(isPrimary = false, clientName = ""): AssessmentCompany {
  return {
    id: newId(), legal_name: "", trade_name: clientName, cnpj: "", state_registration: "",
    municipal_registration: "", address: "", city: "", state: "", tax_regime: "",
    main_activity: "", observations: "", individual_configuration: false, is_primary: isPrimary,
    certificate_status: "confirmar", certificate_type: "", fiscal_contact: "", accountant: "", fiscal_observations: "",
  };
}

export function emptyDimensions(): AssessmentDimensions {
  return {
    contracted_users: "", users_by_module: {}, stores_or_branches: "", warehouses: "", pos_terminals: "",
    salespeople: "", products_count: "", customers_suppliers_count: "", monthly_movements_count: "",
    production_units: "", notes: "",
  };
}

export function emptyAssessment(workspaceId: string, clientName = "", scheduleId: string | null = null): CommercialAssessment {
  return {
    id: null, workspace_id: workspaceId, schedule_id: scheduleId, client_name: clientName,
    sales_owner: "", surveyed_on: todayIso(), contracted_on: "", planned_start_date: "", implementation_owner: "",
    primary_contact_name: "", primary_contact_phone: "", primary_contact_whatsapp: "", primary_contact_email: "",
    general_notes: "", integration_mapping_confirmed: false, migration_reviewed: false,
    status: "em_preenchimento", review_notes: "",
    technical_review_checklist: { scope: false, dependencies: false, gaps: false },
    technical_review_completed: false, technical_reviewed_by: null, technical_reviewed_at: null,
    completion_percent: 0, pending_count: 0, created_by: null, updated_by: null, created_at: null, updated_at: null,
    companies: [emptyCompany(true, clientName)], modules: [], emitters: [], dimensions: emptyDimensions(),
    integrations: [], migrations: [], demands: [], contacts: [],
    infrastructure: INFRASTRUCTURE_QUESTIONS.map((q) => ({ id: newId(), question_key: q.key, answer: "a_confirmar", details: "" })),
    files: [], history: [],
  };
}

const isFilled = (value: unknown) => String(value ?? "").trim().length > 0;

export function calculateAssessmentCompleteness(a: CommercialAssessment): number {
  const primary = a.companies.find((company) => company.is_primary) ?? a.companies[0];
  const checks = [
    isFilled(a.client_name),
    isFilled(a.sales_owner),
    isFilled(a.surveyed_on),
    Boolean(primary && (isFilled(primary.legal_name) || isFilled(primary.trade_name))),
    Boolean(primary && isFilled(primary.cnpj)),
    a.modules.length > 0 && a.modules.every((module) => module.status !== "confirmar"),
    isFilled(a.primary_contact_name) && (isFilled(a.primary_contact_phone) || isFilled(a.primary_contact_whatsapp) || isFilled(a.primary_contact_email)),
    a.integration_mapping_confirmed || a.integrations.length > 0,
    a.migration_reviewed || a.migrations.length > 0,
    a.infrastructure.some((question) => question.answer !== "a_confirmar"),
    a.contacts.length > 0 || isFilled(a.primary_contact_name),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function getAssessmentPendencies(a: CommercialAssessment, catalog: CatalogOption[] = []): AssessmentPending[] {
  const pending: AssessmentPending[] = [];
  const add = (key: string, message: string, responsible: AssessmentPending["responsible"]) => {
    if (!pending.some((item) => item.key === key)) pending.push({ key, message, responsible });
  };
  const primary = a.companies.find((company) => company.is_primary) ?? a.companies[0];
  if (!isFilled(a.client_name)) add("client", "Informe o nome do cliente ou grupo empresarial.", "Comercial");
  if (!isFilled(a.sales_owner)) add("sales-owner", "Defina quem é o responsável pelo levantamento comercial.", "Comercial");
  if (!isFilled(a.surveyed_on)) add("survey-date", "Informe a data do levantamento.", "Comercial");
  if (!primary || (!isFilled(primary.legal_name) && !isFilled(primary.trade_name)) || !isFilled(primary.cnpj)) {
    add("primary-company", "Complete a razão social/nome fantasia e o CNPJ da empresa principal.", "Cliente");
  }
  if (!isFilled(a.primary_contact_name)) add("primary-contact", "Identifique o contato principal do cliente.", "Cliente");
  if (!isFilled(a.primary_contact_phone) && !isFilled(a.primary_contact_whatsapp) && !isFilled(a.primary_contact_email)) {
    add("primary-contact-details", "Informe ao menos um telefone, WhatsApp ou e-mail do contato principal.", "Cliente");
  }

  const unresolvedModules = a.modules.filter((module) => module.status === "confirmar");
  if (unresolvedModules.length) {
    const names = unresolvedModules.map((module) => catalog.find((option) => option.id === module.catalog_id)?.name).filter(Boolean);
    add("modules", `Confirme o escopo dos módulos${names.length ? `: ${names.join(", ")}` : ""}.`, "Comercial");
  }

  if (!a.integrations.length && !a.integration_mapping_confirmed) {
    add("integrations-review", "Confirme o mapeamento de integrações ou registre cada sistema externo identificado.", "Comercial");
  }
  a.integrations.forEach((integration) => {
    const name = integration.name.trim() || "Sistema externo sem identificação";
    if (!integration.name.trim()) add(`integration-name-${integration.id}`, "Informe o nome da plataforma/sistema externo de cada integração.", "Comercial");
    if (integration.contracted_status === "nao_contratada") {
      add(`integration-contract-${integration.id}`, `${name}: necessária ou em avaliação, mas ainda não contratada — confirmar escopo e contratação.`, "Comercial");
    }
    if (integration.status === "nao_avaliada" || integration.status === "analise_tecnica") {
      add(`integration-analysis-${integration.id}`, `${name}: requer análise de viabilidade técnica; o nome da plataforma não confirma compatibilidade.`, "Implantação");
    }
    if (integration.status === "aguardando_cliente") add(`integration-client-${integration.id}`, `${name}: aguardando informações ou acessos do cliente.`, "Cliente");
    if (integration.status === "aguardando_fornecedor") add(`integration-vendor-${integration.id}`, `${name}: aguardando retorno ou documentação do fornecedor.`, "Fornecedor");
    if (integration.status !== "nao_realizada" && (!isFilled(integration.source_system) || !isFilled(integration.destination_system))) {
      add(`integration-flow-${integration.id}`, `${name}: confirme a origem e o destino dos dados.`, "Comercial");
    }
  });

  if (!a.migrations.length && !a.migration_reviewed) {
    add("migration-review", "Registre os dados a migrar ou confirme que não há migração necessária.", "Comercial");
  }
  a.migrations.forEach((migration) => {
    const label = catalog.find((option) => option.id === migration.data_group_id)?.name || migration.data_group_snapshot || "Grupo de dados";
    if (migration.necessary_status === "sim" && migration.preparation_status === "nao_solicitados") {
      add(`migration-request-${migration.id}`, `${label}: dados necessários ainda não foram solicitados.`, "Cliente");
    } else if (migration.necessary_status === "sim" && migration.preparation_status === "pendentes_correcao") {
      add(`migration-fix-${migration.id}`, `${label}: arquivos precisam de correção pelo cliente.`, "Cliente");
    } else if (migration.necessary_status === "sim" && migration.preparation_status !== "validados") {
      add(`migration-validation-${migration.id}`, `${label}: acompanhar preparação e validação dos arquivos de migração.`, "Implantação");
    }
    if (migration.necessary_status === "confirmar") add(`migration-needed-${migration.id}`, `${label}: confirme se a migração é necessária.`, "Comercial");
  });

  a.demands.forEach((demand) => {
    if (demand.status === "aguardando_analise") {
      add(`demand-${demand.id}`, `Avalie a demanda “${demand.title.trim() || "Sem título"}”; não está aprovada nem incluída no escopo.`, "Implantação");
    }
  });

  const unansweredInfrastructure = a.infrastructure.filter((item) => item.answer === "a_confirmar");
  if (unansweredInfrastructure.length > 0) {
    add("infrastructure", `Confirme ${unansweredInfrastructure.length} informação(ões) de infraestrutura e condições de implantação.`, "Cliente");
  }
  return pending;
}

const normalizeKey = (value: string) => value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

export function buildSuggestedActivities(a: CommercialAssessment, catalog: CatalogOption[] = []): SuggestedActivity[] {
  const suggestions: SuggestedActivity[] = [];
  const add = (title: string, sourceReference: string, sourceLabel: string) => {
    if (!suggestions.some((item) => item.sourceReference === sourceReference)) {
      suggestions.push({ title, sourceReference, sourceLabel });
    }
  };

  a.companies.forEach((company) => {
    const companyName = company.trade_name || company.legal_name;
    if (companyName.trim()) add(`Cadastrar e conferir empresa — ${companyName.trim()}`, `company:${company.id}`, `Empresa: ${companyName.trim()}`);
  });

  a.modules.forEach((module) => {
    if (module.status !== "contratado") return;
    const name = catalog.find((option) => option.id === module.catalog_id)?.name;
    if (!name) return;
    add(`Configurar módulo contratado — ${name}`, `module:${module.id}`, `Módulo contratado: ${name}`);
  });

  a.emitters.forEach((emitter) => {
    if (!['contratado', 'necessario_nao_contratado'].includes(emitter.status)) return;
    const company = a.companies.find((item) => item.id === emitter.company_id);
    const companyName = company?.trade_name || company?.legal_name || "empresa";
    const documentName = catalog.find((option) => option.id === emitter.document_type_id)?.name || emitter.other_document_name || "documento fiscal";
    add(`Configurar emissor ${documentName} — ${companyName}`, `emitter:${emitter.id}`, `Emissor fiscal ${documentName} da empresa ${companyName}`);
  });

  a.integrations.forEach((integration) => {
    if (integration.status === "nao_realizada") return;
    const name = integration.name.trim() || "integração sem nome";
    add(`Levantamento técnico da integração — ${name}`, `integration:${integration.id}:analysis`, `Integração: ${name}`);
    const category = catalog.find((option) => option.id === integration.category_id)?.name || "";
    if (/e-commerce|marketplace|integrador de pedidos|hub de integra/i.test(category)) {
      add(`Homologar fluxo de pedidos de e-commerce — ${name}`, `integration:${integration.id}:homologation`, `Integração de e-commerce: ${name}`);
    }
  });

  a.migrations.forEach((migration) => {
    if (migration.necessary_status === "nao") return;
    const dataName = catalog.find((option) => option.id === migration.data_group_id)?.name || migration.data_group_snapshot || "dados a migrar";
    add(`Solicitar e validar arquivos de migração — ${dataName}`, `migration:${migration.id}`, `Migração: ${dataName}`);
  });

  a.demands.forEach((demand) => {
    if (demand.status !== "aguardando_analise") return;
    const title = demand.title.trim() || "Demanda sem título";
    add(`Avaliar demanda específica — ${title}`, `demand:${demand.id}`, `Demanda ainda pendente de análise: ${title}`);
  });

  if (a.modules.some((module) => module.status === "contratado")) {
    add("Planejar treinamento dos usuários-chave", "training:users", "Módulos contratados e usuários do projeto");
  }
  if (a.infrastructure.some((item) => item.answer === "sim")) {
    add("Alinhar infraestrutura, equipamentos e condições de entrada em operação", "infrastructure:review", "Respostas de infraestrutura e operação");
  }
  add("Validação final antes da entrada em produção", "planning:final-validation", "Etapa final de planejamento do projeto");
  return suggestions;
}

export function filterDuplicateSuggestions(
  suggestions: SuggestedActivity[],
  existing: { title: string; commercial_assessment_id?: string | null; commercial_assessment_source?: string | null }[],
  assessmentId: string,
) {
  const exactTitles = new Set(existing.map((item) => normalizeKey(item.title)));
  const sourceRefs = new Set(
    existing
      .filter((item) => item.commercial_assessment_id === assessmentId && item.commercial_assessment_source)
      .map((item) => item.commercial_assessment_source as string),
  );
  return suggestions.map((suggestion) => ({
    ...suggestion,
    duplicate: exactTitles.has(normalizeKey(suggestion.title)) || sourceRefs.has(suggestion.sourceReference),
    selected: !exactTitles.has(normalizeKey(suggestion.title)) && !sourceRefs.has(suggestion.sourceReference),
  }));
}

export function commercialMigrationError(error: unknown) {
  const getMessage = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.message;
    if (typeof value !== "object" || value === null) return "";

    const record = value as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0);
    if (parts.length) return parts.join(" — ");
    if (typeof record.error === "string") return record.error;
    if (typeof record.cause === "string") return record.cause;
    return "";
  };

  const message = getMessage(error);
  if (/commercial_assessment|commercial-assessment-files|schedule_items_commercial_assessment|commercial_assessment_source/i.test(message)
      && /does not exist|schema cache|relation|column|bucket|not found|undefined table|undefined column|PGRST20[45]|42P01|42703/i.test(message)) {
    return "A estrutura do Levantamento Comercial ainda não foi publicada no banco. Aplique supabase/migrations/20261015120000_levantamento_comercial.sql no SQL Editor do Supabase e tente novamente.";
  }
  if (/permission denied|not authorized|row-level security|\b42501\b/i.test(message)) {
    return "O banco recusou a operação. Confirme as permissões do usuário e se a migration do Levantamento Comercial foi aplicada.";
  }
  return message || "Não foi possível carregar ou salvar o levantamento comercial. Tente novamente e, se persistir, contate o administrador.";
}
