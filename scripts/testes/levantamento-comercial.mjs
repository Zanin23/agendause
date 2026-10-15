import assert from "node:assert/strict";
import {
  buildSuggestedActivities,
  calculateAssessmentCompleteness,
  commercialMigrationError,
  emptyAssessment,
  filterDuplicateSuggestions,
  getAssessmentPendencies,
} from "../../src/lib/commercialAssessment.ts";

// Cliente fictício de ponta a ponta para validar o cenário de aceite sem gravar
// dados de teste em uma base Supabase real.
const catalog = [
  { id: "module-erp", kind: "module", name: "ERP", position: 10, active: true },
  { id: "module-pdv", kind: "module", name: "PDV", position: 20, active: true },
  { id: "module-ecom", kind: "module", name: "E-commerce / Commerce", position: 30, active: true },
  { id: "module-crm", kind: "module", name: "CRM", position: 40, active: true },
  { id: "emitter-nfe", kind: "emitter_type", name: "NF-e", position: 10, active: true },
  { id: "category-hub", kind: "integration_category", name: "Integrador de pedidos de e-commerce", position: 10, active: true },
  { id: "migration-products", kind: "migration_group", name: "Produtos", position: 10, active: true },
  { id: "demand-custom", kind: "demand_category", name: "Desenvolvimento", position: 10, active: true },
];

const assessment = emptyAssessment("workspace-ficticio", "Grupo Horizonte", "schedule-ficticio");
assessment.sales_owner = "Ana Comercial";
assessment.surveyed_on = "2026-10-15";
assessment.primary_contact_name = "Marina Costa";
assessment.primary_contact_phone = "+55 11 3333-2222";
assessment.primary_contact_email = "marina@example.invalid";
assessment.integration_mapping_confirmed = true;
assessment.migration_reviewed = true;
assessment.infrastructure = assessment.infrastructure.map((row) => ({ ...row, answer: "nao_aplicavel" }));
assessment.companies = [
  {
    ...assessment.companies[0],
    legal_name: "Horizonte Varejo Ltda.",
    trade_name: "Horizonte Varejo",
    cnpj: "12.345.678/0001-90",
    tax_regime: "Lucro Presumido",
    is_primary: true,
  },
  {
    ...assessment.companies[0],
    id: "company-filial",
    legal_name: "Horizonte Varejo Filial Ltda.",
    trade_name: "Horizonte Varejo — Filial",
    cnpj: "12.345.678/0002-70",
    individual_configuration: true,
    is_primary: false,
  },
];
assessment.modules = [
  { id: "module-row-erp", catalog_id: "module-erp", status: "contratado", notes: "", particularities: "" },
  { id: "module-row-pdv", catalog_id: "module-pdv", status: "nao_contratado", notes: "", particularities: "" },
  { id: "module-row-ecom", catalog_id: "module-ecom", status: "contratado", notes: "", particularities: "" },
  { id: "module-row-crm", catalog_id: "module-crm", status: "confirmar", notes: "", particularities: "" },
];
assessment.emitters = [{
  id: "emitter-row", company_id: assessment.companies[0].id, document_type_id: "emitter-nfe",
  other_document_name: "", status: "contratado", notes: "", state_or_municipal_details: "",
}];
assessment.integrations = [{
  id: "integration-hub", name: "Hub de pedidos do cliente", category_id: "category-hub", category_name_snapshot: "Integrador de pedidos de e-commerce",
  vendor: "Fornecedor de exemplo", website: "https://example.invalid", implementation_type: "nao_definido", contracted_status: "nao_contratada",
  is_in_use: "sim", source_system: "Hub do cliente", destination_system: "ERP USE", data_scope: "Pedidos e situação de pagamento",
  direction: "entrada", communication_method: "api", method_details: "API do fornecedor", documentation_status: "a_confirmar",
  admin_access_status: "nao", external_technical_contact: "Equipe do fornecedor", additional_costs: "a_confirmar",
  planned_start_date: "", status: "analise_tecnica", owner: "Equipe de implantação", observations: "", risks_and_questions: "Aguardando documentação",
}];
assessment.migrations = [{
  id: "migration-products-row", data_group_id: "migration-products", data_group_snapshot: "Produtos", necessary_status: "sim",
  source_system: "Sistema legado", available_format: "excel", format_details: "", data_provider: "Marina Costa", expected_delivery_date: "2026-11-01",
  preparation_status: "solicitados", validation_status: "solicitados", observations: "",
}];
assessment.demands = [{
  id: "demand-custom-row", title: "Relatório de margem por canal", description: "Relatório personalizado por canal de venda.", category_id: "demand-custom",
  category_name_snapshot: "Desenvolvimento", related_module: "ERP", priority: "alta", analysis_owner: "Implantação",
  custom_development: true, additional_budget: true, status: "aguardando_analise", observations: "Pendente de aprovação técnica e comercial.",
}];

assert.match(
  commercialMigrationError({ message: "Could not find the table 'public.commercial_assessment_catalog' in the schema cache", code: "PGRST205" }),
  /Aplique supabase\/migrations\/20261015120000_levantamento_comercial\.sql/,
  "erro Supabase em objeto identifica migration ausente sem exibir [object Object]",
);
assert.notEqual(commercialMigrationError({ message: "Falha de rede" }), "[object Object]");

assert.equal(assessment.companies.length, 2, "o grupo deve comportar mais de um CNPJ");
assert.equal(assessment.modules.find((module) => module.catalog_id === "module-pdv")?.status, "nao_contratado");
assert.ok(calculateAssessmentCompleteness(assessment) > 0, "o indicador de preenchimento precisa funcionar");

const pending = getAssessmentPendencies(assessment, catalog);
assert.ok(pending.some((item) => item.responsible === "Implantação" && item.message.includes("viabilidade técnica")));
assert.ok(pending.some((item) => item.responsible === "Comercial" && item.message.includes("não contratada")));
assert.ok(pending.some((item) => item.message.includes("Produtos")));
assert.ok(pending.some((item) => item.message.includes("Relatório de margem")));

const suggested = buildSuggestedActivities(assessment, catalog);
assert.ok(suggested.some((item) => item.title.includes("Hub de pedidos do cliente")));
assert.ok(suggested.some((item) => item.title.includes("Homologar fluxo de pedidos")));
assert.ok(suggested.some((item) => item.title.includes("Produtos")));
assert.ok(suggested.some((item) => item.title.includes("Relatório de margem")));
assert.ok(suggested.some((item) => item.title.includes("NF-e")));
assert.ok(!suggested.some((item) => item.title.toLowerCase().includes("pdv")), "não deve sugerir PDV não contratado");

const oneDuplicate = filterDuplicateSuggestions(
  suggested,
  [{ title: suggested[0].title, commercial_assessment_id: assessment.id || "assessment-ficticio", commercial_assessment_source: suggested[0].sourceReference }],
  assessment.id || "assessment-ficticio",
);
assert.equal(oneDuplicate.find((item) => item.sourceReference === suggested[0].sourceReference)?.duplicate, true);
assert.ok(oneDuplicate.filter((item) => !item.duplicate).length > 0, "itens novos continuam selecionáveis na prévia");

console.log("Levantamento Comercial: cenário fictício multi-CNPJ, módulos, integração, migração, demanda pendente e deduplicação passaram.");
