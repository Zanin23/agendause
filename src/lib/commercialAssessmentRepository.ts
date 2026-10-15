import { supabase } from "@/integrations/supabase/client";
import {
  ASSESSMENT_STATUS,
  ASSESSMENT_CATALOG_TYPES,
  calculateAssessmentCompleteness,
  emptyAssessment,
  getAssessmentPendencies,
  INFRASTRUCTURE_QUESTIONS,
  type AssessmentCompany,
  type AssessmentContact,
  type AssessmentDemand,
  type AssessmentDimensions,
  type AssessmentEmitter,
  type AssessmentFile,
  type AssessmentHistory,
  type AssessmentInfrastructure,
  type AssessmentIntegration,
  type AssessmentMigration,
  type AssessmentModule,
  type AssessmentStatus,
  type CatalogKind,
  type CatalogOption,
  type CommercialAssessment,
} from "@/lib/commercialAssessment";
import {
  asDatabaseRow,
  asDatabaseRows,
  isDatabaseRow,
  looseSupabase as db,
  type DatabaseRow,
} from "@/lib/looseSupabase";

const text = (value: unknown) => (typeof value === "string" ? value : "");
const nullableText = (value: unknown) => (typeof value === "string" ? value : null);
const date = text;
const numericText = (value: unknown) => (typeof value === "number" || typeof value === "string" ? String(value) : "");
const numberOrNull = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
};

function statusFromValue(value: unknown): AssessmentStatus {
  const status = text(value) as AssessmentStatus;
  return Object.prototype.hasOwnProperty.call(ASSESSMENT_STATUS, status) ? status : "em_preenchimento";
}

function checklistFromValue(value: unknown): CommercialAssessment["technical_review_checklist"] {
  if (!isDatabaseRow(value)) return { scope: false, dependencies: false, gaps: false };
  return { scope: value.scope === true, dependencies: value.dependencies === true, gaps: value.gaps === true };
}

function companyFromRow(row: DatabaseRow): AssessmentCompany {
  return {
    id: text(row.id),
    legal_name: text(row.legal_name), trade_name: text(row.trade_name), cnpj: text(row.cnpj),
    state_registration: text(row.state_registration), municipal_registration: text(row.municipal_registration),
    address: text(row.address), city: text(row.city), state: text(row.state), tax_regime: text(row.tax_regime),
    main_activity: text(row.main_activity), observations: text(row.observations),
    individual_configuration: row.individual_configuration === true, is_primary: row.is_primary === true,
    certificate_status: text(row.certificate_status) || "confirmar", certificate_type: text(row.certificate_type),
    fiscal_contact: text(row.fiscal_contact), accountant: text(row.accountant), fiscal_observations: text(row.fiscal_observations),
  };
}

function integrationFromRow(row: DatabaseRow): AssessmentIntegration {
  return {
    id: text(row.id), name: text(row.name), category_id: text(row.category_id),
    category_name_snapshot: text(row.category_name_snapshot), vendor: text(row.vendor), website: text(row.website),
    implementation_type: text(row.implementation_type) || "nao_definido", contracted_status: text(row.contracted_status) || "a_confirmar",
    is_in_use: text(row.is_in_use) || "a_confirmar", source_system: text(row.source_system),
    destination_system: text(row.destination_system), data_scope: text(row.data_scope), direction: text(row.direction) || "a_confirmar",
    communication_method: text(row.communication_method) || "a_confirmar", method_details: text(row.method_details),
    documentation_status: text(row.documentation_status) || "a_confirmar", admin_access_status: text(row.admin_access_status) || "a_confirmar",
    external_technical_contact: text(row.external_technical_contact), additional_costs: text(row.additional_costs) || "a_confirmar",
    planned_start_date: date(row.planned_start_date), status: text(row.status) || "nao_avaliada", owner: text(row.owner),
    observations: text(row.observations), risks_and_questions: text(row.risks_and_questions),
  };
}

function migrationFromRow(row: DatabaseRow): AssessmentMigration {
  return {
    id: text(row.id), data_group_id: text(row.data_group_id), data_group_snapshot: text(row.data_group_snapshot),
    necessary_status: text(row.necessary_status) || "confirmar", source_system: text(row.source_system),
    available_format: text(row.available_format) || "a_confirmar", format_details: text(row.format_details),
    data_provider: text(row.data_provider), expected_delivery_date: date(row.expected_delivery_date),
    preparation_status: text(row.preparation_status) || "nao_solicitados", validation_status: text(row.validation_status) || "nao_solicitados",
    observations: text(row.observations),
  };
}

function demandFromRow(row: DatabaseRow): AssessmentDemand {
  return {
    id: text(row.id), title: text(row.title), description: text(row.description), category_id: text(row.category_id),
    category_name_snapshot: text(row.category_name_snapshot), related_module: text(row.related_module), priority: text(row.priority) || "media",
    analysis_owner: text(row.analysis_owner), custom_development: row.custom_development === true,
    additional_budget: row.additional_budget === true, status: text(row.status) || "aguardando_analise", observations: text(row.observations),
  };
}

function contactFromRow(row: DatabaseRow): AssessmentContact {
  return {
    id: text(row.id), name: text(row.name), job_title: text(row.job_title), department: text(row.department),
    phone: text(row.phone), email: text(row.email), project_role: text(row.project_role),
    responsible_subjects: Array.isArray(row.responsible_subjects)
      ? row.responsible_subjects.filter((subject): subject is string => typeof subject === "string")
      : [],
    observations: text(row.observations),
  };
}

function catalogOptionFromRow(row: DatabaseRow): CatalogOption {
  const kind = text(row.kind) as CatalogKind;
  const validKind = ASSESSMENT_CATALOG_TYPES.some((option) => option.value === kind) ? kind : "module";
  return {
    id: text(row.id), workspace_id: nullableText(row.workspace_id) ?? undefined,
    kind: validKind, name: text(row.name), position: numberOrNull(row.position) ?? 0, active: row.active !== false,
  };
}

function numericInput(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

export type ImplementationScheduleOption = {
  id: string;
  client_name: string;
  client_email: string | null;
  start_date: string;
  use_team: string[];
  kind: string;
};

export type CommercialAssessmentListRow = {
  id: string;
  workspace_id: string;
  schedule_id: string | null;
  client_name: string;
  sales_owner: string;
  surveyed_on: string;
  contracted_on: string;
  implementation_owner: string;
  status: AssessmentStatus;
  completion_percent: number;
  pending_count: number;
  updated_at: string | null;
};

export async function loadAssessmentCatalog(workspaceId: string): Promise<CatalogOption[]> {
  const { data, error } = await db
    .from("commercial_assessment_catalog")
    .select("id,workspace_id,kind,name,position,active")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return asDatabaseRows(data).map(catalogOptionFromRow);
}

export async function loadImplementationSchedules(): Promise<ImplementationScheduleOption[]> {
  const { data, error } = await db
    .from("implementation_schedules")
    .select("id,client_name,client_email,start_date,use_team,kind")
    .eq("kind", "implantacao")
    .order("start_date", { ascending: false })
    .limit(500);
  if (error) throw error;
  return asDatabaseRows(data).map((row) => ({
    id: text(row.id), client_name: text(row.client_name), client_email: nullableText(row.client_email),
    start_date: date(row.start_date),
    use_team: Array.isArray(row.use_team) ? row.use_team.filter((name): name is string => typeof name === "string") : [],
    kind: text(row.kind),
  }));
}

export async function loadAssessmentBundle(id: string): Promise<CommercialAssessment> {
  const { data: parentData, error: parentError } = await db
    .from("commercial_assessments")
    .select("*")
    .eq("id", id)
    .single();
  if (parentError) throw parentError;
  const parent = asDatabaseRow(parentData);

  const childTables = [
    "commercial_assessment_companies", "commercial_assessment_modules", "commercial_assessment_emitters",
    "commercial_assessment_integrations", "commercial_assessment_migrations", "commercial_assessment_demands",
    "commercial_assessment_contacts", "commercial_assessment_infrastructure", "commercial_assessment_files",
    "commercial_assessment_history", "commercial_assessment_dimensions",
  ];
  const rowGroups = await Promise.all(childTables.map(async (table) => {
    const { data, error } = await db.from(table).select("*").eq("assessment_id", id);
    if (error) throw error;
    return asDatabaseRows(data);
  }));
  const [companyRows, moduleRows, emitterRows, integrationRows, migrationRows, demandRows, contactRows, infrastructureRows, fileRows, historyRows, dimensionRows] = rowGroups;
  const defaultAssessment = emptyAssessment(text(parent.workspace_id), text(parent.client_name), nullableText(parent.schedule_id));
  const dimension = dimensionRows[0];
  const usersByModule = isDatabaseRow(dimension?.users_by_module)
    ? Object.fromEntries(Object.entries(dimension.users_by_module).map(([key, value]) => [key, String(value ?? "")]))
    : {};

  return {
    ...defaultAssessment,
    id: text(parent.id),
    workspace_id: text(parent.workspace_id),
    schedule_id: nullableText(parent.schedule_id),
    client_name: text(parent.client_name),
    sales_owner: text(parent.sales_owner),
    surveyed_on: date(parent.surveyed_on),
    contracted_on: date(parent.contracted_on),
    planned_start_date: date(parent.planned_start_date),
    implementation_owner: text(parent.implementation_owner),
    primary_contact_name: text(parent.primary_contact_name),
    primary_contact_phone: text(parent.primary_contact_phone),
    primary_contact_whatsapp: text(parent.primary_contact_whatsapp),
    primary_contact_email: text(parent.primary_contact_email),
    general_notes: text(parent.general_notes),
    integration_mapping_confirmed: parent.integration_mapping_confirmed === true,
    migration_reviewed: parent.migration_reviewed === true,
    status: statusFromValue(parent.status),
    review_notes: text(parent.review_notes),
    technical_review_checklist: checklistFromValue(parent.technical_review_checklist),
    technical_review_completed: parent.technical_review_completed === true,
    completion_percent: numberOrNull(parent.completion_percent) ?? 0,
    pending_count: numberOrNull(parent.pending_count) ?? 0,
    technical_reviewed_by: nullableText(parent.technical_reviewed_by),
    technical_reviewed_at: nullableText(parent.technical_reviewed_at),
    created_by: nullableText(parent.created_by),
    updated_by: nullableText(parent.updated_by),
    created_at: nullableText(parent.created_at),
    updated_at: nullableText(parent.updated_at),
    companies: companyRows.map(companyFromRow),
    modules: moduleRows.map((row): AssessmentModule => ({
      id: text(row.id), catalog_id: text(row.catalog_id), status: text(row.status) || "confirmar",
      notes: text(row.notes), particularities: text(row.particularities),
    })),
    emitters: emitterRows.map((row): AssessmentEmitter => ({
      id: text(row.id), company_id: text(row.company_id), document_type_id: text(row.document_type_id),
      other_document_name: text(row.other_document_name), status: text(row.status) || "pendente_confirmacao",
      notes: text(row.notes), state_or_municipal_details: text(row.state_or_municipal_details),
    })),
    dimensions: {
      contracted_users: numericText(dimension?.contracted_users),
      users_by_module: usersByModule,
      stores_or_branches: numericText(dimension?.stores_or_branches),
      warehouses: numericText(dimension?.warehouses),
      pos_terminals: numericText(dimension?.pos_terminals),
      salespeople: numericText(dimension?.salespeople),
      products_count: numericText(dimension?.products_count),
      customers_suppliers_count: numericText(dimension?.customers_suppliers_count),
      monthly_movements_count: numericText(dimension?.monthly_movements_count),
      production_units: numericText(dimension?.production_units),
      notes: text(dimension?.notes),
    } satisfies AssessmentDimensions,
    integrations: integrationRows.map(integrationFromRow),
    migrations: migrationRows.map(migrationFromRow),
    demands: demandRows.map(demandFromRow),
    contacts: contactRows.map(contactFromRow),
    infrastructure: infrastructureRows.length
      ? infrastructureRows.map((row): AssessmentInfrastructure => ({
          id: text(row.id), question_key: text(row.question_key), answer: text(row.answer) || "a_confirmar", details: text(row.details),
        }))
      : defaultAssessment.infrastructure.filter((row) => INFRASTRUCTURE_QUESTIONS.some((q) => q.key === row.question_key)),
    files: fileRows.map((row): AssessmentFile => ({
      id: text(row.id), assessment_id: text(row.assessment_id), migration_id: nullableText(row.migration_id),
      file_path: text(row.file_path), file_name: text(row.file_name), file_size: numberOrNull(row.file_size),
      mime_type: nullableText(row.mime_type), created_at: text(row.created_at),
    })),
    history: historyRows.map((row): AssessmentHistory => ({
      id: text(row.id), from_status: row.from_status == null ? null : statusFromValue(row.from_status),
      to_status: statusFromValue(row.to_status), note: nullableText(row.note),
      changed_by_name: nullableText(row.changed_by_name), created_at: text(row.created_at),
    })),
  };
}

async function syncCollection<T extends { id: string }>(
  table: string,
  assessmentId: string,
  workspaceId: string,
  rows: T[],
) {
  const { data: currentRows, error: listError } = await db.from(table).select("id").eq("assessment_id", assessmentId);
  if (listError) throw listError;
  const persisted = asDatabaseRows(currentRows).map((row) => text(row.id)).filter(Boolean);
  const payload = rows.map((row) => ({ ...row, assessment_id: assessmentId, workspace_id: workspaceId }));
  const ids = new Set(rows.map((row) => row.id));

  if (payload.length) {
    const { error } = await db.from(table).upsert(payload, { onConflict: "id" });
    if (error) throw error;
  }
  const removed = persisted.filter((rowId) => !ids.has(rowId));
  if (removed.length) {
    const { error } = await db.from(table).delete().eq("assessment_id", assessmentId).in("id", removed);
    if (error) throw error;
  }
}

export async function saveAssessmentBundle(
  assessment: CommercialAssessment,
  workspaceId: string,
  userId: string,
  catalog: CatalogOption[],
): Promise<CommercialAssessment> {
  const completion = calculateAssessmentCompleteness(assessment);
  const pendingCount = getAssessmentPendencies(assessment, catalog).length;
  const cleanClientName = assessment.client_name.trim();
  if (!cleanClientName) throw new Error("Informe o nome do cliente ou grupo empresarial para salvar.");

  const parentPayload = {
    workspace_id: workspaceId,
    schedule_id: assessment.schedule_id || null,
    client_name: cleanClientName,
    sales_owner: assessment.sales_owner.trim() || null,
    surveyed_on: assessment.surveyed_on || null,
    contracted_on: assessment.contracted_on || null,
    planned_start_date: assessment.planned_start_date || null,
    implementation_owner: assessment.implementation_owner.trim() || null,
    primary_contact_name: assessment.primary_contact_name.trim() || null,
    primary_contact_phone: assessment.primary_contact_phone.trim() || null,
    primary_contact_whatsapp: assessment.primary_contact_whatsapp.trim() || null,
    primary_contact_email: assessment.primary_contact_email.trim() || null,
    general_notes: assessment.general_notes.trim() || null,
    integration_mapping_confirmed: assessment.integration_mapping_confirmed,
    migration_reviewed: assessment.migration_reviewed,
    status: assessment.status,
    review_notes: assessment.review_notes.trim() || null,
    technical_review_checklist: assessment.technical_review_checklist,
    completion_percent: completion,
    pending_count: pendingCount,
    updated_by: userId,
  };

  let savedParent: DatabaseRow;
  if (assessment.id) {
    const { data, error } = await db.from("commercial_assessments").update(parentPayload).eq("id", assessment.id).select("*").single();
    if (error) throw error;
    savedParent = asDatabaseRow(data);
  } else {
    const { data, error } = await db.from("commercial_assessments").insert({ ...parentPayload, created_by: userId }).select("*").single();
    if (error) throw error;
    savedParent = asDatabaseRow(data);
  }

  const id = text(savedParent.id);
  if (!id) throw new Error("O banco não retornou o identificador do levantamento salvo.");
  const { data: currentCompanies, error: currentCompaniesError } = await db
    .from("commercial_assessment_companies").select("id").eq("assessment_id", id);
  if (currentCompaniesError) throw currentCompaniesError;
  if (assessment.companies.length) {
    const { error } = await db.from("commercial_assessment_companies").upsert(
      assessment.companies.map((company) => ({ ...company, assessment_id: id, workspace_id: workspaceId })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  const companyIds = new Set(assessment.companies.map((company) => company.id));
  const removedCompanies = asDatabaseRows(currentCompanies)
    .map((row) => text(row.id))
    .filter((companyId) => Boolean(companyId) && !companyIds.has(companyId));
  if (removedCompanies.length) {
    const { error } = await db.from("commercial_assessment_companies").delete().eq("assessment_id", id).in("id", removedCompanies);
    if (error) throw error;
  }

  await syncCollection("commercial_assessment_modules", id, workspaceId, assessment.modules);
  await syncCollection(
    "commercial_assessment_emitters",
    id,
    workspaceId,
    assessment.emitters.map((emitter) => ({
      ...emitter,
      other_document_name: emitter.other_document_name.trim() || null,
      notes: emitter.notes.trim() || null,
      state_or_municipal_details: emitter.state_or_municipal_details.trim() || null,
    })),
  );
  const dimensions = assessment.dimensions;
  const dimensionPayload = {
    assessment_id: id,
    workspace_id: workspaceId,
    contracted_users: numericInput(dimensions.contracted_users),
    users_by_module: Object.fromEntries(Object.entries(dimensions.users_by_module).filter(([, value]) => value.trim()).map(([key, value]) => [key, numericInput(value)])),
    stores_or_branches: numericInput(dimensions.stores_or_branches),
    warehouses: numericInput(dimensions.warehouses),
    pos_terminals: numericInput(dimensions.pos_terminals),
    salespeople: numericInput(dimensions.salespeople),
    products_count: numericInput(dimensions.products_count),
    customers_suppliers_count: numericInput(dimensions.customers_suppliers_count),
    monthly_movements_count: numericInput(dimensions.monthly_movements_count),
    production_units: numericInput(dimensions.production_units),
    notes: dimensions.notes.trim() || null,
  };
  const { error: dimensionError } = await db.from("commercial_assessment_dimensions").upsert(dimensionPayload, { onConflict: "assessment_id" });
  if (dimensionError) throw dimensionError;
  await syncCollection(
    "commercial_assessment_integrations",
    id,
    workspaceId,
    assessment.integrations.map((integration) => ({
      ...integration,
      category_id: integration.category_id || null,
      category_name_snapshot: integration.category_name_snapshot.trim() || null,
      vendor: integration.vendor.trim() || null,
      website: integration.website.trim() || null,
      source_system: integration.source_system.trim() || null,
      destination_system: integration.destination_system.trim() || null,
      data_scope: integration.data_scope.trim() || null,
      method_details: integration.method_details.trim() || null,
      external_technical_contact: integration.external_technical_contact.trim() || null,
      planned_start_date: integration.planned_start_date || null,
      owner: integration.owner.trim() || null,
      observations: integration.observations.trim() || null,
      risks_and_questions: integration.risks_and_questions.trim() || null,
    })),
  );
  await syncCollection(
    "commercial_assessment_migrations",
    id,
    workspaceId,
    assessment.migrations.map((migration) => ({
      ...migration,
      data_group_id: migration.data_group_id || null,
      data_group_snapshot: migration.data_group_snapshot.trim() || null,
      source_system: migration.source_system.trim() || null,
      format_details: migration.format_details.trim() || null,
      data_provider: migration.data_provider.trim() || null,
      expected_delivery_date: migration.expected_delivery_date || null,
      observations: migration.observations.trim() || null,
    })),
  );
  await syncCollection(
    "commercial_assessment_demands",
    id,
    workspaceId,
    assessment.demands.map((demand) => ({
      ...demand,
      category_id: demand.category_id || null,
      category_name_snapshot: demand.category_name_snapshot.trim() || null,
      related_module: demand.related_module.trim() || null,
      analysis_owner: demand.analysis_owner.trim() || null,
      description: demand.description.trim() || null,
      observations: demand.observations.trim() || null,
    })),
  );
  await syncCollection("commercial_assessment_contacts", id, workspaceId, assessment.contacts);
  await syncCollection("commercial_assessment_infrastructure", id, workspaceId, assessment.infrastructure);

  return {
    ...assessment,
    id,
    workspace_id: workspaceId,
    client_name: cleanClientName,
    status: statusFromValue(savedParent.status),
    created_by: nullableText(savedParent.created_by),
    updated_by: nullableText(savedParent.updated_by),
    created_at: nullableText(savedParent.created_at),
    updated_at: nullableText(savedParent.updated_at),
    technical_reviewed_by: nullableText(savedParent.technical_reviewed_by),
    technical_reviewed_at: nullableText(savedParent.technical_reviewed_at),
    technical_review_completed: savedParent.technical_review_completed === true,
    completion_percent: completion,
    pending_count: pendingCount,
  };
}

export async function insertAssessmentFile(
  assessmentId: string,
  workspaceId: string,
  migrationId: string | null,
  file: File,
  userId: string,
): Promise<AssessmentFile> {
  const safeName = file.name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^\.+/, "") || "arquivo";
  const filePath = `${assessmentId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("commercial-assessment-files")
    .upload(filePath, file, { upsert: false, contentType: file.type || "application/octet-stream" });
  if (uploadError) throw uploadError;

  const { data, error } = await db.from("commercial_assessment_files").insert({
    assessment_id: assessmentId,
    workspace_id: workspaceId,
    migration_id: migrationId,
    file_path: filePath,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type || null,
    uploaded_by: userId,
  }).select("id,assessment_id,migration_id,file_path,file_name,file_size,mime_type,created_at").single();
  if (error) {
    await supabase.storage.from("commercial-assessment-files").remove([filePath]);
    throw error;
  }
  const row = asDatabaseRow(data);
  return {
    id: text(row.id), assessment_id: text(row.assessment_id), migration_id: nullableText(row.migration_id),
    file_path: text(row.file_path), file_name: text(row.file_name), file_size: numberOrNull(row.file_size),
    mime_type: nullableText(row.mime_type), created_at: text(row.created_at),
  };
}

export async function getAssessmentFileUrl(filePath: string) {
  const { data, error } = await supabase.storage.from("commercial-assessment-files").createSignedUrl(filePath, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteAssessmentFile(file: AssessmentFile) {
  const { error: rowError } = await db.from("commercial_assessment_files").delete().eq("id", file.id);
  if (rowError) throw rowError;
  const { error: storageError } = await supabase.storage.from("commercial-assessment-files").remove([file.file_path]);
  if (storageError) throw storageError;
}

export async function updateAssessmentStatus(
  id: string,
  status: CommercialAssessment["status"],
  reviewNotes?: string,
  checklist?: CommercialAssessment["technical_review_checklist"],
) {
  const payload: Record<string, unknown> = { status };
  if (reviewNotes !== undefined) payload.review_notes = reviewNotes.trim() || null;
  if (checklist) payload.technical_review_checklist = checklist;
  const { data, error } = await db.from("commercial_assessments").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return asDatabaseRow(data);
}

export async function addCatalogOption(workspaceId: string, kind: CatalogOption["kind"], name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Informe o nome da opção.");
  const { data, error } = await db.from("commercial_assessment_catalog").insert({
    workspace_id: workspaceId,
    kind,
    name: cleanName,
  }).select("id,workspace_id,kind,name,position,active").single();
  if (error) throw error;
  return catalogOptionFromRow(asDatabaseRow(data));
}

export async function setCatalogOptionActive(id: string, active: boolean) {
  const { error } = await db.from("commercial_assessment_catalog").update({ active }).eq("id", id);
  if (error) throw error;
}

export async function loadAssessmentList(workspaceId: string): Promise<CommercialAssessmentListRow[]> {
  const { data, error } = await db.from("commercial_assessments").select("*").eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
  if (error) throw error;
  return asDatabaseRows(data).map((row) => ({
    id: text(row.id), workspace_id: text(row.workspace_id), schedule_id: nullableText(row.schedule_id),
    client_name: text(row.client_name), sales_owner: text(row.sales_owner), surveyed_on: date(row.surveyed_on),
    contracted_on: date(row.contracted_on), implementation_owner: text(row.implementation_owner),
    status: statusFromValue(row.status), completion_percent: numberOrNull(row.completion_percent) ?? 0,
    pending_count: numberOrNull(row.pending_count) ?? 0, updated_at: nullableText(row.updated_at),
  }));
}

export function emptyInfrastructureRows(): AssessmentInfrastructure[] {
  return emptyAssessment("", "").infrastructure;
}
