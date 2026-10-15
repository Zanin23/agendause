import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePermissions } from "@/hooks/usePermissions";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ASSESSMENT_STATUS, INFRASTRUCTURE_QUESTIONS, INTEGRATION_STATUS, getAssessmentPendencies, type AssessmentStatus, type CatalogOption, type CommercialAssessment } from "@/lib/commercialAssessment";
import { loadAssessmentBundle, loadAssessmentCatalog } from "@/lib/commercialAssessmentRepository";
import { commercialMigrationError } from "@/lib/commercialAssessment";

const dateLabel = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR") : "—";
const textOrDash = (value?: string | number | null) => value === null || value === undefined || value === "" ? "—" : String(value);
const boolLabel = (value: boolean) => value ? "Sim" : "Não";

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="break-inside-avoid space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5 print:rounded-none print:border-x-0 print:border-t-0 print:bg-white print:p-3">
    <h2 className="border-b border-border pb-2 text-base font-semibold text-foreground print:text-black">{title}</h2>{children}
  </section>;
}

function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0"><div className="text-[10px] uppercase tracking-wide text-muted-foreground print:text-gray-500">{label}</div><div className="mt-0.5 whitespace-pre-wrap break-words text-sm print:text-black">{value || "—"}</div></div>;
}

function Restricted() {
  return <div className="min-h-screen bg-background"><AppHeader /><main className="mx-auto max-w-3xl px-4 py-20 text-center"><BackButton to="/levantamento-comercial" /><h1 className="mt-6 text-2xl font-semibold">Acesso restrito</h1><p className="mt-2 text-muted-foreground">Você não tem permissão para consultar este levantamento.</p></main></div>;
}

export default function CommercialAssessmentReport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeId } = useWorkspace();
  const { isAdmin, hasScreenPermission, hasSchedulePermission } = usePermissions();
  const [assessment, setAssessment] = useState<CommercialAssessment | null>(null);
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const [loading, setLoading] = useState(true);
  const canReadFeature = isAdmin || hasScreenPermission("commercial_assessments", "read") || hasScreenPermission("commercial_assessments", "write") || hasScreenPermission("commercial_assessments_review", "read") || hasScreenPermission("commercial_assessments_review", "write");

  useEffect(() => {
    if (!id || !activeId) return;
    let alive = true;
    void (async () => {
      try {
        const [bundle, options] = await Promise.all([loadAssessmentBundle(id), loadAssessmentCatalog(activeId)]);
        if (!alive) return;
        setAssessment(bundle);
        setCatalog(options);
      } catch (error) { toast.error(commercialMigrationError(error)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [id, activeId]);

  if (loading) return <div className="min-h-screen bg-background"><AppHeader /><div className="py-20 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Carregando relatório…</div></div>;
  if (!assessment) return <Restricted />;
  if (!canReadFeature && !hasSchedulePermission(assessment.schedule_id || "", "read")) return <Restricted />;

  const companyName = (company?: CommercialAssessment["companies"][number]) => company?.trade_name || company?.legal_name || "Empresa sem nome";
  const optionName = (id: string) => catalog.find((item) => item.id === id)?.name || "A confirmar";
  const pendencies = getAssessmentPendencies(assessment, catalog);
  const statusMeta = ASSESSMENT_STATUS[assessment.status as AssessmentStatus] || ASSESSMENT_STATUS.em_preenchimento;
  const infrastructureLabel = (key: string) => INFRASTRUCTURE_QUESTIONS.find((question) => question.key === key)?.label || key;

  return <div className="min-h-screen bg-background print:bg-white">
    <SEO title={`Relatório comercial — ${assessment.client_name}`} description="Relatório do levantamento comercial e pré-implantação." path={`/levantamento-comercial/${id}/relatorio`} />
    <div className="print:hidden"><AppHeader /></div>
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:space-y-3 print:px-0 print:py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div><BackButton to={`/levantamento-comercial/${assessment.id}`} /><p className="mt-2 text-xs text-muted-foreground">Consulta interna · não representa aprovação técnica por si só</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => navigate(`/levantamento-comercial/${assessment.id}`)}><ArrowLeft className="h-4 w-4" />Voltar ao levantamento</Button><Button onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir / Salvar PDF</Button></div>
      </div>

      <header className="rounded-xl border border-primary/20 bg-primary/5 p-5 print:rounded-none print:border-0 print:border-b print:bg-white print:p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="text-xs font-semibold uppercase tracking-[.18em] text-primary print:text-gray-600">Levantamento Comercial · Pré-Implantação</div><h1 className="mt-2 text-2xl font-semibold tracking-tight print:text-black">{assessment.client_name}</h1><p className="mt-1 text-sm text-muted-foreground print:text-gray-600">{assessment.schedule_id ? "Vinculado a projeto de implantação" : "Levantamento comercial prévio, ainda sem cronograma vinculado"}</p></div>
          <div className="space-y-2 text-right"><Badge className={statusMeta.tone}>{statusMeta.label}</Badge><div className="text-xs text-muted-foreground print:text-gray-600">Completude {assessment.completion_percent}% · {pendencies.length} pendência(s)</div></div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4"><KeyValue label="Levantamento" value={dateLabel(assessment.surveyed_on)} /><KeyValue label="Contratação" value={dateLabel(assessment.contracted_on)} /><KeyValue label="Previsão de início" value={dateLabel(assessment.planned_start_date)} /><KeyValue label="Responsável implantação" value={assessment.implementation_owner} /></div>
      </header>

      <ReportSection title="Identificação comercial">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><KeyValue label="Cliente / grupo empresarial" value={assessment.client_name} /><KeyValue label="Responsável comercial" value={assessment.sales_owner} /><KeyValue label="Contato principal" value={assessment.primary_contact_name} /><KeyValue label="Telefone" value={assessment.primary_contact_phone} /><KeyValue label="WhatsApp" value={assessment.primary_contact_whatsapp} /><KeyValue label="E-mail" value={assessment.primary_contact_email} /></div>
        {assessment.general_notes && <div className="border-t border-border pt-3"><KeyValue label="Observações gerais" value={assessment.general_notes} /></div>}
      </ReportSection>

      <ReportSection title={`Empresas e CNPJs (${assessment.companies.length})`}>
        {assessment.companies.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {assessment.companies.map((company) => (
              <div key={company.id} className="break-inside-avoid rounded-lg border border-border p-3 print:border-gray-300">
                <div className="mb-2 flex flex-wrap items-center gap-2 font-semibold">
                  {companyName(company)}{company.is_primary && <Badge variant="outline">Principal</Badge>}{company.individual_configuration && <Badge variant="outline">Configuração individual</Badge>}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <KeyValue label="Razão social" value={company.legal_name} /><KeyValue label="Nome fantasia" value={company.trade_name} />
                  <KeyValue label="CNPJ" value={company.cnpj} /><KeyValue label="Inscrição estadual" value={company.state_registration} />
                  <KeyValue label="Inscrição municipal" value={company.municipal_registration} /><KeyValue label="Regime tributário" value={company.tax_regime} />
                  <KeyValue label="Atividade principal" value={company.main_activity} /><KeyValue label="Endereço" value={[company.address, company.city, company.state].filter(Boolean).join(" · ")} />
                  <KeyValue label="Certificado digital" value={`${company.certificate_status}${company.certificate_type ? ` · ${company.certificate_type}` : ""}`} />
                  <KeyValue label="Responsável fiscal" value={company.fiscal_contact} /><KeyValue label="Contador" value={company.accountant} />
                </div>
                {company.observations && <div className="mt-2"><KeyValue label="Observações" value={company.observations} /></div>}
                {company.fiscal_observations && <div className="mt-2"><KeyValue label="Particularidades fiscais" value={company.fiscal_observations} /></div>}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada.</p>}
      </ReportSection>

      <ReportSection title="Módulos contratados">
        {assessment.modules.length ? <div className="grid gap-2 sm:grid-cols-2">{assessment.modules.map((module) => <div key={module.id} className="rounded-lg border border-border p-3 print:border-gray-300"><div className="flex items-center justify-between gap-3"><span className="font-medium">{optionName(module.catalog_id)}</span><Badge variant={module.status === "contratado" ? "success" : "outline"}>{module.status === "contratado" ? "Contratado" : module.status === "nao_contratado" ? "Não contratado" : "A confirmar"}</Badge></div>{module.notes && <p className="mt-2 text-sm">{module.notes}</p>}{module.particularities && <p className="mt-1 text-sm text-muted-foreground">Particularidades: {module.particularities}</p>}</div>)}</div> : <p className="text-sm text-muted-foreground">Nenhum módulo registrado.</p>}
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <KeyValue label="Usuários contratados" value={assessment.dimensions.contracted_users} />
          <KeyValue label="Lojas / filiais" value={assessment.dimensions.stores_or_branches} />
          <KeyValue label="Depósitos" value={assessment.dimensions.warehouses} />
          <KeyValue label="Caixas / PDV" value={assessment.dimensions.pos_terminals} />
          <KeyValue label="Vendedores" value={assessment.dimensions.salespeople} />
          <KeyValue label="Unidades produtivas" value={assessment.dimensions.production_units} />
        </div>
        {Object.entries(assessment.dimensions.users_by_module).length > 0 && <div className="mt-3"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Usuários estimados por módulo</div><div className="grid gap-2 sm:grid-cols-3">{Object.entries(assessment.dimensions.users_by_module).map(([catalogId, amount]) => <KeyValue key={catalogId} label={optionName(catalogId)} value={amount} />)}</div></div>}
      </ReportSection>

      <ReportSection title="Emissores fiscais por empresa">
        {assessment.emitters.length ? <div className="grid gap-2 sm:grid-cols-2">{assessment.emitters.map((emitter) => <div key={emitter.id} className="rounded-lg border border-border p-3 print:border-gray-300"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{optionName(emitter.document_type_id)} · {companyName(assessment.companies.find((company) => company.id === emitter.company_id))}</strong><Badge variant="outline">{emitter.status.replace(/_/g, " ")}</Badge></div><KeyValue label="Observações" value={emitter.notes} /><KeyValue label="Particularidades estaduais / municipais" value={emitter.state_or_municipal_details} /></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhum emissor fiscal registrado.</p>}
      </ReportSection>

      <ReportSection title={`Integrações (${assessment.integrations.length})`}>
        {assessment.integrations.length ? <div className="space-y-3">{assessment.integrations.map((integration) => <div key={integration.id} className="break-inside-avoid rounded-lg border border-border p-3 print:border-gray-300"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{integration.name || "Sistema sem identificação"}</strong><Badge variant="outline">{INTEGRATION_STATUS.find((option) => option.value === integration.status)?.label || integration.status.replace(/_/g, " ")}</Badge></div><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><KeyValue label="Categoria" value={optionName(integration.category_id)} /><KeyValue label="Fornecedor" value={integration.vendor} /><KeyValue label="Site" value={integration.website} /><KeyValue label="Tipo" value={integration.implementation_type.replace(/_/g, " ")} /><KeyValue label="Contratada" value={integration.contracted_status.replace(/_/g, " ")} /><KeyValue label="Em uso" value={integration.is_in_use} /><KeyValue label="Origem" value={integration.source_system} /><KeyValue label="Destino" value={integration.destination_system} /><KeyValue label="Direção" value={integration.direction} /><KeyValue label="Método" value={integration.communication_method} /><KeyValue label="Documentação disponível" value={integration.documentation_status} /><KeyValue label="Acesso administrativo" value={integration.admin_access_status} /><KeyValue label="Responsável técnico externo" value={integration.external_technical_contact} /><KeyValue label="Custos adicionais" value={integration.additional_costs} /><KeyValue label="Previsão" value={dateLabel(integration.planned_start_date)} /><KeyValue label="Responsável interno" value={integration.owner} /></div>{integration.data_scope && <div className="mt-2"><KeyValue label="Dados integrados" value={integration.data_scope} /></div>}{integration.observations && <div className="mt-2"><KeyValue label="Observações" value={integration.observations} /></div>}{integration.risks_and_questions && <div className="mt-2"><KeyValue label="Riscos / dúvidas" value={integration.risks_and_questions} /></div>}</div>)}</div> : <p className="text-sm text-muted-foreground">Nenhuma integração registrada. Mapeamento {assessment.integration_mapping_confirmed ? "confirmado sem itens" : "ainda não confirmado"}.</p>}
        <p className="mt-2 text-xs text-muted-foreground">A viabilidade técnica não é presumida a partir do nome ou categoria informada.</p>
      </ReportSection>

      <ReportSection title="Migração de dados">
        {assessment.migrations.length ? <div className="space-y-3">{assessment.migrations.map((migration) => <div key={migration.id} className="break-inside-avoid rounded-lg border border-border p-3 print:border-gray-300"><strong>{optionName(migration.data_group_id)}</strong><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><KeyValue label="Necessária?" value={migration.necessary_status} /><KeyValue label="Sistema de origem" value={migration.source_system} /><KeyValue label="Formato" value={`${migration.available_format}${migration.format_details ? ` · ${migration.format_details}` : ""}`} /><KeyValue label="Responsável pelo envio" value={migration.data_provider} /><KeyValue label="Entrega prevista" value={dateLabel(migration.expected_delivery_date)} /><KeyValue label="Preparação" value={MIGRATION_LABEL(migration.preparation_status)} /><KeyValue label="Validação" value={MIGRATION_LABEL(migration.validation_status)} /></div>{migration.observations && <p className="mt-2 text-sm">{migration.observations}</p>}{assessment.files.filter((file) => file.migration_id === migration.id).length > 0 && <div className="mt-2"><div className="text-xs font-semibold">Arquivos:</div>{assessment.files.filter((file) => file.migration_id === migration.id).map((file) => <div key={file.id} className="text-sm">{file.file_name}</div>)}</div>}</div>)}</div> : <p className="text-sm text-muted-foreground">Nenhum grupo cadastrado. Migração {assessment.migration_reviewed ? "avaliada como não necessária" : "ainda não avaliada"}.</p>}
      </ReportSection>

      <ReportSection title="Demandas específicas identificadas">
        {assessment.demands.length ? <div className="space-y-3">{assessment.demands.map((demand) => <div key={demand.id} className="break-inside-avoid rounded-lg border border-border p-3 print:border-gray-300"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{demand.title}</strong><Badge variant="outline">{demand.status.replace(/_/g, " ")}</Badge></div><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><KeyValue label="Categoria" value={optionName(demand.category_id)} /><KeyValue label="Módulo relacionado" value={demand.related_module} /><KeyValue label="Prioridade" value={demand.priority} /><KeyValue label="Responsável pela análise" value={demand.analysis_owner} /><KeyValue label="Desenvolvimento personalizado" value={boolLabel(demand.custom_development)} /><KeyValue label="Orçamento adicional" value={boolLabel(demand.additional_budget)} /></div><p className="mt-2 whitespace-pre-wrap text-sm">{demand.description || "Sem descrição detalhada."}</p>{demand.observations && <p className="mt-1 text-sm text-muted-foreground">{demand.observations}</p>}</div>)}</div> : <p className="text-sm text-muted-foreground">Nenhuma demanda específica cadastrada.</p>}
        <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300 print:text-black">Demandas comerciais não são consideradas aprovadas, contratadas ou incluídas no escopo sem decisão da equipe responsável.</p>
      </ReportSection>

      <ReportSection title="Infraestrutura e condições de implantação">
        <div className="grid gap-2 sm:grid-cols-2">{assessment.infrastructure.map((response) => <div key={response.id} className="rounded-lg border border-border p-3 print:border-gray-300"><div className="text-sm font-medium">{infrastructureLabel(response.question_key)}</div><div className="mt-1 text-sm">{response.answer.replace(/_/g, " ")}</div>{response.details && <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{response.details}</div>}</div>)}</div>
      </ReportSection>

      <ReportSection title={`Contatos do cliente (${assessment.contacts.length})`}>
        {assessment.contacts.length ? <div className="grid gap-3 sm:grid-cols-2">{assessment.contacts.map((contact) => <div key={contact.id} className="rounded-lg border border-border p-3 print:border-gray-300"><div className="font-semibold">{contact.name}</div><div className="mt-2 grid gap-2 sm:grid-cols-2"><KeyValue label="Cargo / departamento" value={[contact.job_title, contact.department].filter(Boolean).join(" · ")} /><KeyValue label="Papel no projeto" value={contact.project_role} /><KeyValue label="Telefone" value={contact.phone} /><KeyValue label="E-mail" value={contact.email} /><KeyValue label="Assuntos" value={contact.responsible_subjects.join(", ")} /></div>{contact.observations && <p className="mt-2 text-sm">{contact.observations}</p>}</div>)}</div> : <p className="text-sm text-muted-foreground">Nenhum contato adicional além do principal.</p>}
      </ReportSection>

      <ReportSection title={`Pendências (${pendencies.length})`}>
        {pendencies.length ? <ul className="space-y-2">{pendencies.map((item) => <li key={item.key} className="flex items-start gap-2 text-sm"><Badge variant="outline">{item.responsible}</Badge><span>{item.message}</span></li>)}</ul> : <p className="text-sm text-emerald-700 dark:text-emerald-300 print:text-black">Nenhuma pendência automática identificada.</p>}
      </ReportSection>

      <ReportSection title="Histórico de validação">
        {assessment.history.length ? <ol className="space-y-3">{[...assessment.history].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((event) => <li key={event.id} className="break-inside-avoid border-l-2 border-primary/30 pl-3"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><strong>{ASSESSMENT_STATUS[event.to_status]?.label || event.to_status}</strong><span className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("pt-BR")} · {event.changed_by_name || "Usuário"}</span></div>{event.note && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{event.note}</p>}</li>)}</ol> : <p className="text-sm text-muted-foreground">Nenhum evento de validação registrado.</p>}
        {assessment.technical_review_completed && <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">Validado para planejamento em {dateLabel(assessment.technical_reviewed_at)}.</div>}
      </ReportSection>
      <footer className="pb-6 text-center text-xs text-muted-foreground print:pb-0">Relatório interno do Levantamento Comercial · Gerado em {new Date().toLocaleString("pt-BR")}</footer>
    </main>
  </div>;
}

function MIGRATION_LABEL(value: string) {
  const found = {
    nao_solicitados: "Não solicitados", solicitados: "Solicitados", recebidos: "Recebidos",
    em_analise: "Em análise", validados: "Validados", pendentes_correcao: "Pendentes de correção",
  }[value] || value;
  return textOrDash(found);
}
