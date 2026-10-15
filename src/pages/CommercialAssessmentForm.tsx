import { cloneElement, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertCircle, ArrowLeft, ArrowRight, BadgeCheck, Building2, CalendarCheck2, Check, CheckCircle2,
  ChevronDown, CircleHelp, ClipboardCheck, Clock3, FilePlus2, FileText, Loader2, MoreHorizontal,
  Plus, Printer, Save, Settings2, ShieldCheck, Trash2, Upload, UserRound, X,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  ASSESSMENT_CATALOG_TYPES, ASSESSMENT_STATUS, COMPANY_TAX_REGIMES, CONTACT_SUBJECTS,
  EMITTER_STATUS, INTEGRATION_STATUS, INFRASTRUCTURE_QUESTIONS, MIGRATION_STATUS,
  MODULE_STATUS, buildSuggestedActivities, calculateAssessmentCompleteness,
  emptyAssessment, emptyCompany, filterDuplicateSuggestions, getAssessmentPendencies,
  newId, type AssessmentCompany, type AssessmentContact, type AssessmentDemand,
  type AssessmentEmitter, type AssessmentIntegration, type AssessmentMigration,
  type AssessmentModule, type AssessmentStatus, type CatalogKind, type CatalogOption,
  type CommercialAssessment,
} from "@/lib/commercialAssessment";
import {
  addCatalogOption, deleteAssessmentFile, getAssessmentFileUrl, insertAssessmentFile,
  loadAssessmentBundle, loadAssessmentCatalog, loadAssessmentList, loadImplementationSchedules,
  saveAssessmentBundle, setCatalogOptionActive, updateAssessmentStatus,
  type CommercialAssessmentListRow, type ImplementationScheduleOption,
} from "@/lib/commercialAssessmentRepository";
import { commercialMigrationError } from "@/lib/commercialAssessment";
import { asDatabaseRow, asDatabaseRows, looseSupabase as db } from "@/lib/looseSupabase";

const readText = (value: unknown) => (typeof value === "string" ? value : "");
const readNullableText = (value: unknown) => (typeof value === "string" ? value : null);
const readNumber = (value: unknown) => (typeof value === "number" ? value : Number(value) || 0);

const SECTIONS = [
  { id: "identification", label: "Identificação e contatos", short: "Identificação", icon: UserRound },
  { id: "companies", label: "Empresas e fiscal", short: "Empresas", icon: Building2 },
  { id: "scope", label: "Módulos e operação", short: "Escopo", icon: ClipboardCheck },
  { id: "integrations", label: "Integrações", short: "Integrações", icon: Settings2 },
  { id: "data", label: "Migração e demandas", short: "Dados e demandas", icon: FileText },
  { id: "review", label: "Infraestrutura e validação", short: "Revisão", icon: ShieldCheck },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const FIELD_CLASS = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SELECT_CLASS = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const dateLocal = (value: string | null | undefined) => value || "";
const formatBytes = (bytes?: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

function Field({ label, children, hint, optional = false }: { label: string; children: React.ReactNode; hint?: string; optional?: boolean }) {
  const generatedId = useId();
  const child = isValidElement(children) ? children as React.ReactElement<{ id?: string }> : null;
  const childType = child?.type;
  const isDirectControl = Boolean(child && (
    childType === Input || childType === Textarea || childType === SmallSelect ||
    (typeof childType === "string" && ["input", "select", "textarea"].includes(childType))
  ));
  const controlId = child?.props.id || generatedId;
  const control = isDirectControl && child ? cloneElement(child, { id: controlId }) : children;

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={isDirectControl ? controlId : undefined} className="flex min-h-8 items-end gap-1 leading-4 sm:min-h-10">
        <span className="min-w-0">{label}</span>
        {optional && <span className="shrink-0 whitespace-nowrap text-xs font-normal leading-4 text-muted-foreground">opcional</span>}
      </Label>
      <div className="min-w-0 [&>input]:min-w-0 [&>select]:min-w-0 [&>textarea]:min-w-0">{control}</div>
      {hint && <p className="text-xs leading-4 text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionTitle({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="text-base font-semibold sm:text-lg">{title}</h2>{description && <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">{description}</p>}</div>{action}</div>;
}

function SmallSelect({ id, value, onChange, options, disabled, ariaLabel }: {
  id?: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled?: boolean; ariaLabel?: string;
}) {
  return <select id={id} aria-label={ariaLabel} disabled={disabled} className={SELECT_CLASS} value={value} onChange={(event) => onChange(event.target.value)}>
    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>;
}

function AssessmentStatusBadge({ status }: { status: string }) {
  const meta = ASSESSMENT_STATUS[status as AssessmentStatus] ?? ASSESSMENT_STATUS.em_preenchimento;
  return <Badge className={meta.tone}>{meta.label}</Badge>;
}

export default function CommercialAssessmentForm() {
  const { id: routeId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const scheduleFromQuery = searchParams.get("cronograma");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeId } = useWorkspace();
  const { isAdmin, hasScreenPermission, hasSchedulePermission, loading: permissionLoading } = usePermissions();

  const [form, setForm] = useState<CommercialAssessment | null>(null);
  const formRef = useRef<CommercialAssessment | null>(null);
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const [schedules, setSchedules] = useState<ImplementationScheduleOption[]>([]);
  const [usedScheduleIds, setUsedScheduleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("identification");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const savingRef = useRef(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnMessage, setReturnMessage] = useState("");
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [catalogKind, setCatalogKind] = useState<CatalogKind>("module");
  const [catalogName, setCatalogName] = useState("");
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewPhaseId, setPreviewPhaseId] = useState<string | null>(null);
  const [previewPhasePosition, setPreviewPhasePosition] = useState(0);
  const [previewItems, setPreviewItems] = useState<(ReturnType<typeof filterDuplicateSuggestions>[number])[]>([]);
  const [uploadBusy, setUploadBusy] = useState<string | null>(null);
  const [archivedDialogOpen, setArchivedDialogOpen] = useState(false);
  const [moduleToAdd, setModuleToAdd] = useState("");

  const isReviewer = isAdmin || hasScreenPermission("commercial_assessments_review", "write");
  const canReadFeature = isAdmin || hasScreenPermission("commercial_assessments", "read") || hasScreenPermission("commercial_assessments", "write") ||
    hasScreenPermission("commercial_assessments_review", "read") || hasScreenPermission("commercial_assessments_review", "write");
  const canWriteFeature = isAdmin || hasScreenPermission("commercial_assessments", "write");
  const scheduleCanWrite = isAdmin || (form?.schedule_id ? hasSchedulePermission(form.schedule_id, "write") : false);
  const lockedStatus = form?.status === "aprovado_planejamento" || form?.status === "arquivado";
  const canEdit = Boolean(form && ((canWriteFeature || isReviewer || scheduleCanWrite) && !lockedStatus));
  const canRead = Boolean(form && (
    canReadFeature || hasSchedulePermission(form.schedule_id || "", "read") || hasSchedulePermission(form.schedule_id || "", "write")
  ));
  const canCreate = isAdmin || canWriteFeature || scheduleCanWrite;
  const activeCatalog = useMemo(() => catalog.filter((option) => option.active), [catalog]);
  const optionsOf = useCallback((kind: CatalogKind) => activeCatalog.filter((option) => option.kind === kind), [activeCatalog]);
  const pending = useMemo(() => form ? getAssessmentPendencies(form, catalog) : [], [form, catalog]);
  const completion = useMemo(() => form ? calculateAssessmentCompleteness(form) : 0, [form]);

  useEffect(() => { formRef.current = form; }, [form]);

  const load = useCallback(async () => {
    if (permissionLoading) return;
    if (!activeId) {
      setLoading(false);
      setLoadError("Selecione uma base de trabalho para abrir o Levantamento Comercial.");
      return;
    }
    setLoading(true);
    setLoaded(false);
    setLoadError(null);
    try {
      const [catalogRows, scheduleRows, existingAssessments] = await Promise.all([
        loadAssessmentCatalog(activeId),
        loadImplementationSchedules(),
        loadAssessmentList(activeId).catch(() => []),
      ]);
      setCatalog(catalogRows);
      setSchedules(scheduleRows);
      setUsedScheduleIds(existingAssessments.flatMap((row: CommercialAssessmentListRow) =>
        row.schedule_id && row.id !== routeId ? [row.schedule_id] : [],
      ));

      if (routeId && routeId !== "novo") {
        const loadedAssessment = await loadAssessmentBundle(routeId);
        setForm(loadedAssessment);
      } else {
        let linkedSchedule = scheduleRows.find((schedule) => schedule.id === scheduleFromQuery);
        if (scheduleFromQuery && !linkedSchedule) {
          const { data, error } = await db.from("implementation_schedules")
            .select("id,client_name,client_email,start_date,use_team,kind").eq("id", scheduleFromQuery).maybeSingle();
          if (error) throw error;
          if (data) {
            const row = asDatabaseRow(data);
            linkedSchedule = {
              id: readText(row.id), client_name: readText(row.client_name), client_email: readNullableText(row.client_email),
              start_date: readText(row.start_date),
              use_team: Array.isArray(row.use_team) ? row.use_team.filter((name): name is string => typeof name === "string") : [],
              kind: readText(row.kind),
            };
          }
        }
        if (scheduleFromQuery) {
          const { data: existing, error: existingError } = await db.from("commercial_assessments")
            .select("id").eq("schedule_id", scheduleFromQuery).maybeSingle();
          const existingErrorMessage = existingError instanceof Error
            ? existingError.message
            : typeof existingError === "object" && existingError !== null
              ? readText(asDatabaseRow(existingError).message)
              : String(existingError ?? "");
          if (existingError && !/no rows|multiple/i.test(existingErrorMessage)) throw existingError;
          const existingId = existing ? readText(asDatabaseRow(existing).id) : "";
          if (existingId) {
            navigate(`/levantamento-comercial/${existingId}`, { replace: true });
            return;
          }
        }
        const initial = emptyAssessment(activeId, linkedSchedule?.client_name || "", linkedSchedule?.id || null);
        if (linkedSchedule) {
          initial.primary_contact_email = linkedSchedule.client_email || "";
          initial.planned_start_date = linkedSchedule.start_date || "";
          initial.implementation_owner = Array.isArray(linkedSchedule.use_team) ? linkedSchedule.use_team.join(", ") : "";
          initial.companies[0].trade_name = linkedSchedule.client_name || "";
        }
        initial.modules = catalogRows.filter((option) => option.kind === "module" && option.active).map((option) => ({
          id: newId(), catalog_id: option.id, status: "confirmar", notes: "", particularities: "",
        }));
        setForm(initial);
      }
      setDirty(false);
      setLoaded(true);
    } catch (error) {
      const message = commercialMigrationError(error);
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [activeId, permissionLoading, routeId, scheduleFromQuery, navigate]);

  useEffect(() => { void load(); }, [load]);

  const update = useCallback((mutator: (current: CommercialAssessment) => CommercialAssessment) => {
    setForm((current) => {
      if (!current) return current;
      const next = mutator(current);
      return {
        ...next,
        completion_percent: calculateAssessmentCompleteness(next),
        pending_count: getAssessmentPendencies(next, catalog).length,
      };
    });
    setDirty(true);
    setSavedMessage("");
  }, [catalog]);

  const save = useCallback(async (silent = false): Promise<CommercialAssessment | null> => {
    const current = formRef.current;
    if (!current || !user || !activeId || !canEdit) return null;
    if (savingRef.current) return null;
    if (!current.client_name.trim()) {
      if (!silent) toast.error("Informe ao menos o nome do cliente ou grupo empresarial.");
      return null;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await saveAssessmentBundle(current, activeId, user.id, catalog);
      setForm(saved);
      formRef.current = saved;
      setDirty(false);
      setSavedMessage(`Salvo às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
      if (!current.id && saved.id) navigate(`/levantamento-comercial/${saved.id}`, { replace: true });
      if (!silent) toast.success("Levantamento salvo. Você pode continuar preenchendo depois.");
      return saved;
    } catch (error) {
      const message = commercialMigrationError(error);
      setSavedMessage("Não foi possível salvar");
      if (!silent) toast.error(message);
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [user, activeId, canEdit, catalog, navigate]);

  useEffect(() => {
    if (!loaded || !dirty || !form || !canEdit) return;
    const timer = window.setTimeout(() => { void save(true); }, 1400);
    return () => window.clearTimeout(timer);
  }, [loaded, dirty, form, canEdit, save]);

  const refreshBundle = useCallback(async (assessmentId: string) => {
    const fresh = await loadAssessmentBundle(assessmentId);
    setForm(fresh);
    formRef.current = fresh;
    setDirty(false);
  }, []);

  const transition = async (
    status: AssessmentStatus,
    note?: string,
    checklist?: CommercialAssessment["technical_review_checklist"],
  ) => {
    if (!form?.id) {
      toast.error("Salve o levantamento antes de alterar a situação.");
      return;
    }
    if (savingRef.current) return;
    let saved = form;
    if (dirty) {
      const result = await save(true);
      if (!result) return;
      saved = result;
    }
    try {
      await updateAssessmentStatus(saved.id, status, note, checklist);
      await refreshBundle(saved.id);
      setReturnDialogOpen(false);
      setReturnMessage("");
      toast.success(`Situação atualizada: ${ASSESSMENT_STATUS[status].label}.`);
    } catch (error) {
      toast.error(commercialMigrationError(error));
    }
  };

  const updateParent = (patch: Partial<CommercialAssessment>) => update((current) => ({ ...current, ...patch }));
  const updateCompany = (companyId: string, patch: Partial<AssessmentCompany>) => update((current) => ({
    ...current,
    companies: current.companies.map((company) => company.id === companyId ? { ...company, ...patch } : company),
  }));
  const addCompany = () => update((current) => ({ ...current, companies: [...current.companies, emptyCompany(false)] }));
  const removeCompany = (companyId: string) => update((current) => {
    const remaining = current.companies.filter((company) => company.id !== companyId);
    if (remaining.length && !remaining.some((company) => company.is_primary)) remaining[0].is_primary = true;
    return {
      ...current,
      companies: remaining,
      emitters: current.emitters.filter((emitter) => emitter.company_id !== companyId),
    };
  });
  const setPrimaryCompany = (companyId: string) => update((current) => ({
    ...current,
    companies: current.companies.map((company) => ({ ...company, is_primary: company.id === companyId })),
  }));
  const updateModule = (moduleId: string, patch: Partial<AssessmentModule>) => update((current) => ({
    ...current, modules: current.modules.map((item) => item.id === moduleId ? { ...item, ...patch } : item),
  }));
  const addModule = (catalogId: string) => {
    const module = activeCatalog.find((option) => option.id === catalogId && option.kind === "module");
    if (!module || form?.modules.some((item) => item.catalog_id === catalogId)) return;
    update((current) => ({ ...current, modules: [...current.modules, { id: newId(), catalog_id: catalogId, status: "confirmar", notes: "", particularities: "" }] }));
  };
  const updateEmitter = (emitterId: string, patch: Partial<AssessmentEmitter>) => update((current) => ({
    ...current, emitters: current.emitters.map((item) => item.id === emitterId ? { ...item, ...patch } : item),
  }));
  const addEmitter = (companyId: string) => {
    const available = optionsOf("emitter_type").filter((option) => !form?.emitters.some((emitter) => emitter.company_id === companyId && emitter.document_type_id === option.id));
    if (!available.length) return toast.error("Todos os tipos de documento fiscal disponíveis já foram adicionados para esta empresa.");
    update((current) => ({ ...current, emitters: [...current.emitters, {
      id: newId(), company_id: companyId, document_type_id: available[0].id, other_document_name: "",
      status: "pendente_confirmacao", notes: "", state_or_municipal_details: "",
    }] }));
  };
  const updateIntegration = (integrationId: string, patch: Partial<AssessmentIntegration>) => update((current) => ({
    ...current, integrations: current.integrations.map((item) => item.id === integrationId ? { ...item, ...patch } : item),
  }));
  const addIntegration = () => update((current) => ({ ...current, integrations: [...current.integrations, {
    id: newId(), name: "", category_id: "", category_name_snapshot: "",
    vendor: "", website: "", implementation_type: "nao_definido", contracted_status: "a_confirmar", is_in_use: "a_confirmar",
    source_system: "", destination_system: "", data_scope: "", direction: "a_confirmar", communication_method: "a_confirmar",
    method_details: "", documentation_status: "a_confirmar", admin_access_status: "a_confirmar", external_technical_contact: "",
    additional_costs: "a_confirmar", planned_start_date: "", status: "nao_avaliada", owner: "", observations: "", risks_and_questions: "",
  }] }));
  const updateMigration = (migrationId: string, patch: Partial<AssessmentMigration>) => update((current) => ({
    ...current, migrations: current.migrations.map((item) => item.id === migrationId ? { ...item, ...patch } : item),
  }));
  const addMigration = () => update((current) => ({ ...current, migrations: [...current.migrations, {
    id: newId(), data_group_id: optionsOf("migration_group")[0]?.id || "", data_group_snapshot: "", necessary_status: "confirmar",
    source_system: "", available_format: "a_confirmar", format_details: "", data_provider: "", expected_delivery_date: "",
    preparation_status: "nao_solicitados", validation_status: "nao_solicitados", observations: "",
  }] }));
  const updateDemand = (demandId: string, patch: Partial<AssessmentDemand>) => update((current) => ({
    ...current, demands: current.demands.map((item) => item.id === demandId ? { ...item, ...patch } : item),
  }));
  const addDemand = () => update((current) => ({ ...current, demands: [...current.demands, {
    id: newId(), title: "", description: "", category_id: optionsOf("demand_category")[0]?.id || "", category_name_snapshot: "",
    related_module: "", priority: "media", analysis_owner: "", custom_development: false, additional_budget: false,
    status: "aguardando_analise", observations: "",
  }] }));
  const updateContact = (contactId: string, patch: Partial<AssessmentContact>) => update((current) => ({
    ...current, contacts: current.contacts.map((item) => item.id === contactId ? { ...item, ...patch } : item),
  }));
  const addContact = () => update((current) => ({ ...current, contacts: [...current.contacts, {
    id: newId(), name: "", job_title: "", department: "", phone: "", email: "", project_role: "",
    responsible_subjects: [], observations: "",
  }] }));
  const deleteFrom = (field: "modules" | "emitters" | "integrations" | "migrations" | "demands" | "contacts", rowId: string) => {
    update((current) => ({ ...current, [field]: current[field].filter((item) => item.id !== rowId) }) as CommercialAssessment);
  };

  const addCatalog = async () => {
    if (!activeId || !catalogName.trim()) return;
    setCatalogSaving(true);
    try {
      const option = await addCatalogOption(activeId, catalogKind, catalogName);
      setCatalog((items) => [...items, option].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "pt-BR")));
      if (catalogKind === "module") {
        update((current) => ({ ...current, modules: [...current.modules, { id: newId(), catalog_id: option.id, status: "confirmar", notes: "", particularities: "" }] }));
      }
      setCatalogName("");
      toast.success("Opção adicionada ao catálogo desta base.");
    } catch (error) { toast.error(commercialMigrationError(error)); }
    finally { setCatalogSaving(false); }
  };

  const toggleCatalogOption = async (option: CatalogOption) => {
    try {
      await setCatalogOptionActive(option.id, !option.active);
      setCatalog((current) => current.map((item) => item.id === option.id ? { ...item, active: !item.active } : item));
      toast.success(option.active ? "Opção desativada. Ela continua preservada em levantamentos antigos." : "Opção reativada.");
    } catch (error) { toast.error(commercialMigrationError(error)); }
  };

  const uploadFiles = async (migrationId: string, files: FileList | null) => {
    if (!files || !form || !user || !activeId) return;
    let assessmentId = form.id;
    if (!assessmentId) {
      const saved = await save(true);
      assessmentId = saved?.id || null;
    }
    if (!assessmentId) {
      toast.error("Informe o nome do cliente e salve o levantamento antes de anexar arquivos.");
      return;
    }
    const picked = Array.from(files);
    for (const file of picked) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name}: o limite por arquivo é 25 MB.`);
        continue;
      }
      setUploadBusy(migrationId);
      try {
        const stored = await insertAssessmentFile(assessmentId, activeId, migrationId, file, user.id);
        update((current) => ({ ...current, files: [...current.files, stored] }));
        toast.success(`Arquivo anexado: ${file.name}`);
      } catch (error) { toast.error(commercialMigrationError(error)); }
      finally { setUploadBusy(null); }
    }
  };

  const openFile = async (filePath: string) => {
    try {
      const url = await getAssessmentFileUrl(filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) { toast.error(commercialMigrationError(error)); }
  };

  const removeFile = async (fileId: string) => {
    if (!form) return;
    const file = form.files.find((item) => item.id === fileId);
    if (!file || !confirm(`Remover o arquivo “${file.file_name}”?`)) return;
    try {
      await deleteAssessmentFile(file);
      update((current) => ({ ...current, files: current.files.filter((item) => item.id !== fileId) }));
      toast.success("Arquivo removido.");
    } catch (error) { toast.error(commercialMigrationError(error)); }
  };

  const openActivityPreview = async () => {
    if (!form?.id || !form.schedule_id) return toast.error("Vincule este levantamento a um cronograma antes de sugerir atividades.");
    setPreviewBusy(true);
    try {
      const suggestions = buildSuggestedActivities(form, catalog);
      const { data: phaseData, error: phaseError } = await db.from("schedule_phases").select("id,title,position").eq("schedule_id", form.schedule_id).order("position");
      if (phaseError) throw phaseError;
      const phases = asDatabaseRows(phaseData).map((phase) => ({
        id: readText(phase.id), title: readText(phase.title), position: readNumber(phase.position),
      }));
      const phaseIds = phases.map((phase) => phase.id).filter(Boolean);
      const { data: existingData, error: itemsError } = phaseIds.length
        ? await db.from("schedule_items").select("title,commercial_assessment_id,commercial_assessment_source").in("phase_id", phaseIds)
        : { data: [], error: null };
      if (itemsError) throw itemsError;
      const existing = asDatabaseRows(existingData).map((item) => ({
        title: readText(item.title), commercial_assessment_id: readNullableText(item.commercial_assessment_id),
        commercial_assessment_source: readNullableText(item.commercial_assessment_source),
      }));
      const targetPhase = phases.find((phase) => phase.title === "Pré-implantação comercial");
      setPreviewPhaseId(targetPhase?.id || null);
      setPreviewPhasePosition(phases.reduce((maximum, phase) => Math.max(maximum, phase.position), -1) + 1);
      setPreviewItems(filterDuplicateSuggestions(suggestions, existing, form.id));
      setPreviewOpen(true);
    } catch (error) { toast.error(commercialMigrationError(error)); }
    finally { setPreviewBusy(false); }
  };

  const createSuggestedActivities = async () => {
    if (!form?.id || !form.schedule_id) return;
    if (form.status !== "aprovado_planejamento") {
      toast.error("A implantação precisa aprovar o levantamento antes de criar atividades.");
      return;
    }
    const selected = previewItems.filter((item) => item.selected && !item.duplicate);
    if (!selected.length) {
      setPreviewOpen(false);
      toast.info("Não há novas atividades selecionadas para criar.");
      return;
    }
    setPreviewBusy(true);
    try {
      const { data: latestPhasesData, error: latestPhasesError } = await db
        .from("schedule_phases").select("id").eq("schedule_id", form.schedule_id);
      if (latestPhasesError) throw latestPhasesError;
      const latestPhaseIds = asDatabaseRows(latestPhasesData).map((phase) => readText(phase.id)).filter(Boolean);
      let latestScheduleItems: { title: string; commercial_assessment_id: string | null; commercial_assessment_source: string | null }[] = [];
      if (latestPhaseIds.length) {
        const { data: latestItemsData, error: latestItemsError } = await db
          .from("schedule_items")
          .select("title,commercial_assessment_id,commercial_assessment_source")
          .in("phase_id", latestPhaseIds);
        if (latestItemsError) throw latestItemsError;
        latestScheduleItems = asDatabaseRows(latestItemsData).map((item) => ({
          title: readText(item.title), commercial_assessment_id: readNullableText(item.commercial_assessment_id),
          commercial_assessment_source: readNullableText(item.commercial_assessment_source),
        }));
      }
      const latestSuggestions = filterDuplicateSuggestions(selected, latestScheduleItems, form.id);
      const duplicateSources = new Set(latestSuggestions.filter((item) => item.duplicate).map((item) => item.sourceReference));
      if (duplicateSources.size) {
        setPreviewItems((items) => items.map((item) => duplicateSources.has(item.sourceReference)
          ? { ...item, duplicate: true, selected: false }
          : item));
      }
      const confirmedSuggestions = latestSuggestions.filter((item) => !item.duplicate);
      if (!confirmedSuggestions.length) {
        setPreviewOpen(false);
        toast.info("As atividades selecionadas já existem no cronograma; nenhuma duplicata foi criada.");
        return;
      }
      let phaseId = previewPhaseId;
      if (!phaseId) {
        const { data: phase, error } = await db.from("schedule_phases").insert({
          schedule_id: form.schedule_id,
          position: previewPhasePosition,
          title: "Pré-implantação comercial",
          description: `Atividades sugeridas pelo levantamento comercial de ${form.client_name}.`,
        }).select("id").single();
        if (error) throw error;
        phaseId = readText(asDatabaseRow(phase).id);
        if (!phaseId) throw new Error("O cronograma não retornou a etapa criada.");
      }
      const { data: existingItemsData, error: existingError } = await db.from("schedule_items").select("position").eq("phase_id", phaseId).order("position", { ascending: false }).limit(1);
      if (existingError) throw existingError;
      const existingItems = asDatabaseRows(existingItemsData);
      const firstPosition = existingItems[0]?.position == null ? 0 : readNumber(existingItems[0].position) + 1;
      const payload = confirmedSuggestions.map((item, index) => ({
        phase_id: phaseId,
        position: firstPosition + index,
        title: item.title,
        description: `Origem: ${item.sourceLabel}. Sugestão gerada a partir do levantamento comercial; confirme o responsável e o prazo no cronograma.`,
        planned_date: null,
        assignee: null,
        status: "pending",
        commercial_assessment_id: form.id,
        commercial_assessment_source: item.sourceReference,
      }));
      const { error } = await db.from("schedule_items").insert(payload);
      if (error) throw error;
      setPreviewOpen(false);
      toast.success(`${payload.length} atividade(s) adicionada(s) ao cronograma sem data ou responsável definidos.`);
    } catch (error) { toast.error(commercialMigrationError(error)); }
    finally { setPreviewBusy(false); }
  };

  const setModuleUserEstimate = (catalogId: string, value: string) => update((current) => ({
    ...current, dimensions: { ...current.dimensions, users_by_module: { ...current.dimensions.users_by_module, [catalogId]: value } },
  }));

  if (loading || permissionLoading) {
    return <div className="min-h-screen bg-background"><AppHeader /><main className="mx-auto max-w-4xl px-4 py-20 text-center text-muted-foreground"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />Carregando levantamento comercial…</main></div>;
  }

  if (!form) {
    return (
      <div className="min-h-screen bg-background">
        <SEO title="Levantamento Comercial — TreinaCheck" description="Levantamento de pré-implantação do cliente." path="/levantamento-comercial" />
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <BackButton to="/levantamento-comercial" />
          <Card className="mt-5 border-destructive/30">
            <CardContent className="space-y-4 p-6">
              <div>
                <h1 className="text-xl font-semibold">Não foi possível carregar o levantamento</h1>
                <p className="mt-2 text-sm text-muted-foreground">{loadError || "Verifique sua conexão, a base selecionada e suas permissões."}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void load()}>Tentar novamente</Button>
                <Button variant="ghost" onClick={() => navigate("/selecionar-base")}>Selecionar base</Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if ((!routeId || routeId === "novo") && !canCreate) {
    return <RestrictedAssessment />;
  }
  if (routeId && !canRead) {
    return <RestrictedAssessment />;
  }

  const linkedSchedule = schedules.find((schedule) => schedule.id === form.schedule_id);
  const scheduleOptions = schedules.filter((schedule) => !usedScheduleIds.includes(schedule.id) || schedule.id === form.schedule_id);
  const readOnly = !canEdit;
  const reviewChecklist = form.technical_review_checklist;
  const activeSectionIndex = Math.max(0, SECTIONS.findIndex((section) => section.id === activeSection));
  const activeSectionMeta = SECTIONS[activeSectionIndex];
  const canSendForReview = Boolean(canWriteFeature && form.id && ["em_preenchimento", "aguardando_comercial", "aguardando_cliente", "devolvido"].includes(form.status));
  const canStartReview = Boolean(isReviewer && form.id && ["pronto_analise", "devolvido", "aguardando_comercial"].includes(form.status));
  const canWaitCommercial = Boolean(isReviewer && form.id && form.status === "em_analise");
  const canWaitClient = Boolean(canWriteFeature && form.id && ["em_preenchimento", "pronto_analise", "devolvido"].includes(form.status));
  const canReopenReview = Boolean(isReviewer && form.id && ["aprovado_planejamento", "arquivado"].includes(form.status));
  const canArchive = Boolean(isReviewer && form.id && form.status !== "arquivado");
  const hasWorkflowActions = canStartReview || canWaitCommercial || canWaitClient || canReopenReview || canArchive;

  return (
    <div className="min-h-screen bg-background pb-36 sm:pb-28">
      <SEO title={`${routeId ? "Editar" : "Novo"} Levantamento Comercial — TreinaCheck`} description="Levantamento de pré-implantação do cliente." path={routeId ? `/levantamento-comercial/${routeId}` : "/levantamento-comercial/novo"} />
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <BackButton to="/levantamento-comercial" />
            <h1 className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              <ClipboardCheck className="h-7 w-7 text-primary" />
              {form.client_name || "Novo levantamento comercial"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AssessmentStatusBadge status={form.status} />
              <span className="text-xs text-muted-foreground">{completion}% de preenchimento</span>
              {form.schedule_id && <Badge variant="outline">Projeto vinculado</Badge>}
              {form.id && <span className="text-xs text-muted-foreground">{form.updated_at ? `Atualizado ${new Date(form.updated_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {form.id && <Button variant="outline" onClick={() => navigate(`/levantamento-comercial/${form.id}/relatorio`)}><Printer className="h-4 w-4" />Relatório</Button>}
            {form.status === "aprovado_planejamento" && form.schedule_id && scheduleCanWrite && (
              <Button variant="outline" onClick={openActivityPreview} disabled={previewBusy}><CalendarCheck2 className="h-4 w-4" />Prévia de atividades</Button>
            )}
            {isAdmin && <Button variant="outline" onClick={() => setCatalogDialogOpen(true)}><Settings2 className="h-4 w-4" />Catálogos</Button>}
          </div>
        </div>

        {!readOnly && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">Rascunho seguro: as alterações são salvas automaticamente.</span>
              <span className="text-xs text-muted-foreground">{saving ? "Salvando…" : dirty ? "Alterações pendentes" : savedMessage || "Tudo salvo"}</span>
            </div>
            <p className="mt-1 text-xs leading-4 text-muted-foreground">Para salvar, basta informar o nome do cliente ou grupo. Os demais campos podem ficar vazios ou como “A confirmar”; o preenchimento não representa aprovação técnica.</p>
          </div>
        )}

        {pending.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <span><strong>{pending.length} pendência(s)</strong><span className="text-muted-foreground"> · informação a complementar, não é reprovação</span></span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setActiveSection("review")}>Ver validação e histórico<ArrowRight className="h-4 w-4" /></Button>
          </div>
        )}

        {form.status === "devolvido" && form.review_notes && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 text-sm"><div className="font-medium text-orange-800 dark:text-orange-300">Complementação solicitada pela implantação</div><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{form.review_notes}</p></div>
        )}

        <div className="sticky top-[4.5rem] z-20 -mx-1 space-y-2 rounded-xl border border-border bg-background/95 p-2 shadow-sm backdrop-blur sm:p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="text-xs leading-4 text-muted-foreground">Etapa {activeSectionIndex + 1} de {SECTIONS.length}</p>
              <p className="truncate text-sm font-semibold leading-5">{activeSectionMeta.label}</p>
            </div>
            <p className="hidden text-xs text-muted-foreground sm:block">Clique em uma etapa ou avance pelos controles abaixo.</p>
          </div>
          <nav aria-label="Etapas do levantamento comercial" className="-mx-1 overflow-x-auto">
            <div className="flex min-w-max gap-1">
              {SECTIONS.map((section, index) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return <button key={section.id} type="button" aria-current={isActive ? "step" : undefined} aria-label={`Etapa ${index + 1} de ${SECTIONS.length}: ${section.label}`} onClick={() => setActiveSection(section.id)} className={`flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:text-sm ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${isActive ? "bg-primary-foreground/15" : "bg-muted"}`}><Icon className="h-4 w-4" /></span>
                  <span>{index + 1}. {section.short}</span>
                </button>;
              })}
            </div>
          </nav>
        </div>

        {activeSection === "identification" && (
          <div className="space-y-5">
            <Card><CardContent className="space-y-5 p-4 sm:p-6">
              <SectionTitle title="Identificação comercial" description="Dados essenciais para identificar cliente, contratação e responsáveis. O nome abaixo também identifica o grupo empresarial no sistema." />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Nome do cliente / grupo empresarial"><Input disabled={readOnly} value={form.client_name} onChange={(event) => updateParent({ client_name: event.target.value })} placeholder="Nome fantasia ou grupo" /></Field>
                <Field label="Responsável pelo levantamento comercial"><Input disabled={readOnly} value={form.sales_owner} onChange={(event) => updateParent({ sales_owner: event.target.value })} placeholder="Nome do responsável" /></Field>
                <Field label="Data do levantamento"><Input disabled={readOnly} type="date" value={dateLocal(form.surveyed_on)} onChange={(event) => updateParent({ surveyed_on: event.target.value })} /></Field>
                <Field label="Data da contratação" optional><Input disabled={readOnly} type="date" value={dateLocal(form.contracted_on)} onChange={(event) => updateParent({ contracted_on: event.target.value })} /></Field>
                <Field label="Previsão de início da implantação" optional><Input disabled={readOnly} type="date" value={dateLocal(form.planned_start_date)} onChange={(event) => updateParent({ planned_start_date: event.target.value })} /></Field>
                <Field label="Responsável interno pela implantação" optional><Input disabled={readOnly} value={form.implementation_owner} onChange={(event) => updateParent({ implementation_owner: event.target.value })} placeholder="Pessoa ou equipe" /></Field>
              </div>
              <div className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
                <Field label="Contato principal do cliente"><Input disabled={readOnly} value={form.primary_contact_name} onChange={(event) => updateParent({ primary_contact_name: event.target.value })} /></Field>
                <Field label="Telefone"><Input disabled={readOnly} type="tel" value={form.primary_contact_phone} onChange={(event) => updateParent({ primary_contact_phone: event.target.value })} /></Field>
                <Field label="WhatsApp"><Input disabled={readOnly} type="tel" value={form.primary_contact_whatsapp} onChange={(event) => updateParent({ primary_contact_whatsapp: event.target.value })} /></Field>
                <Field label="E-mail"><Input disabled={readOnly} type="email" value={form.primary_contact_email} onChange={(event) => updateParent({ primary_contact_email: event.target.value })} /></Field>
              </div>
              <Field label="Cronograma / projeto de implantação" optional hint="Vincule a um cronograma existente para consultar o levantamento no cadastro do cliente e sugerir atividades depois da aprovação.">
                <select disabled={readOnly} className={SELECT_CLASS} value={form.schedule_id || ""} onChange={(event) => {
                  const schedule = schedules.find((item) => item.id === event.target.value);
                  update((current) => ({ ...current, schedule_id: schedule?.id || null, client_name: schedule?.client_name || current.client_name,
                    primary_contact_email: current.primary_contact_email || schedule?.client_email || "",
                    planned_start_date: current.planned_start_date || schedule?.start_date || "",
                    implementation_owner: current.implementation_owner || (Array.isArray(schedule?.use_team) ? schedule.use_team.join(", ") : ""),
                    companies: current.companies.map((company, index) => index === 0 && !company.trade_name ? { ...company, trade_name: schedule?.client_name || "" } : company),
                  }));
                }}>
                  <option value="">Sem cronograma vinculado (cadastro comercial prévio)</option>
                  {scheduleOptions.map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.client_name} · início {schedule.start_date}</option>)}
                </select>
              </Field>
              {linkedSchedule && <div className="text-xs text-muted-foreground">Cronograma selecionado: <span className="font-medium text-foreground">{linkedSchedule.client_name}</span>. A agenda continua sendo a fonte oficial das datas e atividades do projeto.</div>}
              <Field label="Observações gerais" optional><Textarea disabled={readOnly} rows={4} value={form.general_notes} onChange={(event) => updateParent({ general_notes: event.target.value })} placeholder="Contexto comercial, acordos e observações importantes para a implantação…" /></Field>
            </CardContent></Card>

            <Card><CardContent className="space-y-4 p-4 sm:p-6">
              <SectionTitle title="Contatos e responsabilidades" description="Diferencie quem decide, quem opera e quem fornece informações técnicas. O contato principal acima pode ser repetido aqui com um papel mais específico." action={!readOnly && <Button variant="outline" size="sm" onClick={addContact}><Plus className="h-4 w-4" />Adicionar contato</Button>} />
              {form.contacts.length === 0 ? <EmptyHint text="Nenhum contato adicional cadastrado. O contato principal pode ser completado acima." /> : form.contacts.map((contact, index) => (
                <div key={contact.id} className="rounded-xl border border-border bg-muted/10 p-4">
                  <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold">Contato {index + 1}</div>{!readOnly && <Button variant="ghost" size="icon" aria-label="Remover contato" onClick={() => deleteFrom("contacts", contact.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Nome"><Input disabled={readOnly} value={contact.name} onChange={(event) => updateContact(contact.id, { name: event.target.value })} /></Field>
                    <Field label="Cargo"><Input disabled={readOnly} value={contact.job_title} onChange={(event) => updateContact(contact.id, { job_title: event.target.value })} /></Field>
                    <Field label="Departamento"><Input disabled={readOnly} value={contact.department} onChange={(event) => updateContact(contact.id, { department: event.target.value })} placeholder="Fiscal, TI, compras…" /></Field>
                    <Field label="Telefone"><Input disabled={readOnly} type="tel" value={contact.phone} onChange={(event) => updateContact(contact.id, { phone: event.target.value })} /></Field>
                    <Field label="E-mail"><Input disabled={readOnly} type="email" value={contact.email} onChange={(event) => updateContact(contact.id, { email: event.target.value })} /></Field>
                    <Field label="Papel no projeto"><Input disabled={readOnly} value={contact.project_role} onChange={(event) => updateContact(contact.id, { project_role: event.target.value })} placeholder="Decisor, operacional, técnico…" /></Field>
                    <Field label="Assuntos sob sua responsabilidade" optional><div className="flex flex-wrap gap-x-3 gap-y-2 rounded-md border border-input p-2.5">{CONTACT_SUBJECTS.map((subject) => <label key={subject} className="flex items-center gap-1.5 text-xs"><Checkbox disabled={readOnly} checked={contact.responsible_subjects.includes(subject)} onCheckedChange={(checked) => updateContact(contact.id, { responsible_subjects: checked ? [...contact.responsible_subjects, subject] : contact.responsible_subjects.filter((item) => item !== subject) })} />{subject}</label>)}</div></Field>
                    <Field label="Observações" optional><Input disabled={readOnly} value={contact.observations} onChange={(event) => updateContact(contact.id, { observations: event.target.value })} /></Field>
                  </div>
                </div>
              ))}
            </CardContent></Card>
          </div>
        )}

        {activeSection === "companies" && (
          <div className="space-y-5">
            <Card><CardContent className="space-y-4 p-4 sm:p-6">
              <SectionTitle title="Empresas e estrutura fiscal" description={`Cada CNPJ é cadastrado individualmente (${form.companies.length} empresa(s) registrada(s)). Regime, emissores e configurações podem variar de uma empresa para outra.`} action={!readOnly && <Button variant="outline" size="sm" onClick={addCompany}><Plus className="h-4 w-4" />Adicionar empresa</Button>} />
              {form.companies.length === 0 && <EmptyHint text="Adicione a empresa principal e os demais CNPJs do grupo." />}
              {form.companies.map((company, index) => (
                <div key={company.id} className="space-y-4 rounded-xl border border-border p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 text-primary" />Empresa {index + 1}{company.is_primary && <Badge variant="outline">Principal</Badge>}</div>
                    <div className="flex items-center gap-2">{!company.is_primary && !readOnly && <Button variant="outline" size="sm" onClick={() => setPrimaryCompany(company.id)}>Definir como principal</Button>}{!readOnly && form.companies.length > 1 && <Button variant="ghost" size="icon" aria-label="Remover empresa" onClick={() => removeCompany(company.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <Field label="Razão social"><Input disabled={readOnly} value={company.legal_name} onChange={(event) => updateCompany(company.id, { legal_name: event.target.value })} /></Field>
                    <Field label="Nome fantasia"><Input disabled={readOnly} value={company.trade_name} onChange={(event) => updateCompany(company.id, { trade_name: event.target.value })} /></Field>
                    <Field label="CNPJ"><Input disabled={readOnly} value={company.cnpj} onChange={(event) => updateCompany(company.id, { cnpj: event.target.value })} placeholder="00.000.000/0000-00" /></Field>
                    <Field label="Inscrição estadual" optional><Input disabled={readOnly} value={company.state_registration} onChange={(event) => updateCompany(company.id, { state_registration: event.target.value })} /></Field>
                    <Field label="Inscrição municipal" optional><Input disabled={readOnly} value={company.municipal_registration} onChange={(event) => updateCompany(company.id, { municipal_registration: event.target.value })} /></Field>
                    <Field label="Regime tributário" optional><select disabled={readOnly} className={SELECT_CLASS} value={company.tax_regime} onChange={(event) => updateCompany(company.id, { tax_regime: event.target.value })}><option value="">A confirmar</option>{COMPANY_TAX_REGIMES.map((regime) => <option key={regime} value={regime}>{regime}</option>)}</select></Field>
                    <Field label="Atividade principal" optional><Input disabled={readOnly} value={company.main_activity} onChange={(event) => updateCompany(company.id, { main_activity: event.target.value })} /></Field>
                    <Field label="Endereço" optional><Input disabled={readOnly} value={company.address} onChange={(event) => updateCompany(company.id, { address: event.target.value })} /></Field>
                    <Field label="Cidade" optional><Input disabled={readOnly} value={company.city} onChange={(event) => updateCompany(company.id, { city: event.target.value })} /></Field>
                    <Field label="UF" optional><Input disabled={readOnly} maxLength={2} value={company.state} onChange={(event) => updateCompany(company.id, { state: event.target.value.toUpperCase() })} /></Field>
                    <Field label="Configuração individual" hint="Marque quando a empresa exigir configuração fiscal/operacional independente."><label className="flex h-10 items-center gap-2 rounded-md border border-input px-3 text-sm"><Checkbox disabled={readOnly} checked={company.individual_configuration} onCheckedChange={(checked) => updateCompany(company.id, { individual_configuration: Boolean(checked) })} />Configurar separadamente</label></Field>
                    <Field label="Observações da empresa" optional><Input disabled={readOnly} value={company.observations} onChange={(event) => updateCompany(company.id, { observations: event.target.value })} /></Field>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/15 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="font-medium">Certificado e responsáveis fiscais</div><span className="text-xs text-muted-foreground">Informação por empresa</span></div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                      <Field label="Certificado digital"><SmallSelect disabled={readOnly} value={company.certificate_status} onChange={(value) => updateCompany(company.id, { certificate_status: value })} options={[{ value: "confirmar", label: "A confirmar" }, { value: "possui", label: "Possui" }, { value: "nao_possui", label: "Não possui" }, { value: "nao_aplicavel", label: "Não se aplica" }]} /></Field>
                      <Field label="Tipo / validade do certificado" optional><Input disabled={readOnly} value={company.certificate_type} onChange={(event) => updateCompany(company.id, { certificate_type: event.target.value })} placeholder="A1/A3, vencimento…" /></Field>
                      <Field label="Responsável fiscal" optional><Input disabled={readOnly} value={company.fiscal_contact} onChange={(event) => updateCompany(company.id, { fiscal_contact: event.target.value })} /></Field>
                      <Field label="Contador / escritório contábil" optional><Input disabled={readOnly} value={company.accountant} onChange={(event) => updateCompany(company.id, { accountant: event.target.value })} /></Field>
                    </div>
                    <div className="mt-3">
                      <Field label="Observações fiscais estaduais / municipais" optional><Textarea disabled={readOnly} rows={2} value={company.fiscal_observations} onChange={(event) => updateCompany(company.id, { fiscal_observations: event.target.value })} /></Field>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/10 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><div className="font-medium">Emissores e documentos fiscais</div><p className="text-xs text-muted-foreground">Os emissores são específicos desta empresa; nenhuma configuração é compartilhada automaticamente.</p></div>{!readOnly && <Button variant="outline" size="sm" onClick={() => addEmitter(company.id)}><Plus className="h-4 w-4" />Adicionar emissor</Button>}</div>
                    {form.emitters.filter((emitter) => emitter.company_id === company.id).length === 0 ? <EmptyHint text="Nenhum emissor cadastrado para esta empresa. Adicione os aplicáveis ou deixe registrado para confirmação." /> : <div className="space-y-3">
                      {form.emitters.filter((emitter) => emitter.company_id === company.id).map((emitter) => <div key={emitter.id} className="grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-2 xl:grid-cols-2">
                        <Field label="Tipo de documento"><SmallSelect disabled={readOnly} value={emitter.document_type_id} onChange={(value) => updateEmitter(emitter.id, { document_type_id: value })} options={optionsOf("emitter_type").map((option) => ({ value: option.id, label: option.name }))} /></Field>
                        {optionsOf("emitter_type").find((option) => option.id === emitter.document_type_id)?.name?.toLowerCase().includes("outros") && <Field label="Especifique o documento"><Input disabled={readOnly} value={emitter.other_document_name} onChange={(event) => updateEmitter(emitter.id, { other_document_name: event.target.value })} /></Field>}
                        <Field label="Situação"><SmallSelect disabled={readOnly} value={emitter.status} onChange={(value) => updateEmitter(emitter.id, { status: value })} options={EMITTER_STATUS.map((option) => ({ value: option.value, label: option.label }))} /></Field>
                        <Field label="Observações"><Input disabled={readOnly} value={emitter.notes} onChange={(event) => updateEmitter(emitter.id, { notes: event.target.value })} /></Field>
                        <Field label="Particularidades municipais / estaduais" optional><Input disabled={readOnly} value={emitter.state_or_municipal_details} onChange={(event) => updateEmitter(emitter.id, { state_or_municipal_details: event.target.value })} /></Field>
                        {!readOnly && <Button variant="ghost" size="sm" className="self-end justify-self-start text-destructive" onClick={() => deleteFrom("emitters", emitter.id)}><Trash2 className="h-4 w-4" />Remover</Button>}
                      </div>)}
                    </div>}
                  </div>
                </div>
              ))}
            </CardContent></Card>
          </div>
        )}

        {activeSection === "scope" && (
          <div className="space-y-5">
            <Card><CardContent className="space-y-4 p-4 sm:p-6">
              <SectionTitle title="Módulos e sistemas contratados" description="Cada opção deve ser confirmada pelo comercial. Módulos não selecionados não são presumidos como contratados." />
              <div className="grid gap-3 lg:grid-cols-2">
                {form.modules.map((module) => {
                  const option = catalog.find((item) => item.id === module.catalog_id);
                  return <div key={module.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium">{option?.name || "Módulo desativado"}</div>{!readOnly && <Button variant="ghost" size="icon" aria-label="Remover módulo do levantamento" onClick={() => deleteFrom("modules", module.id)}><X className="h-4 w-4" /></Button>}</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Situação"><SmallSelect disabled={readOnly} value={module.status} onChange={(value) => updateModule(module.id, { status: value })} options={MODULE_STATUS.map((item) => ({ value: item.value, label: item.label }))} /></Field>
                      <Field label="Usuários estimados neste módulo" optional><Input disabled={readOnly} type="number" min="0" step="1" value={form.dimensions.users_by_module[module.catalog_id] || ""} onChange={(event) => setModuleUserEstimate(module.catalog_id, event.target.value)} placeholder="A confirmar" /></Field>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Observações" optional><Input disabled={readOnly} value={module.notes} onChange={(event) => updateModule(module.id, { notes: event.target.value })} /></Field><Field label="Particularidades levantadas" optional><Input disabled={readOnly} value={module.particularities} onChange={(event) => updateModule(module.id, { particularities: event.target.value })} /></Field></div>
                  </div>;
                })}
              </div>
              {!readOnly && <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field label="Adicionar módulo do catálogo" optional>
                  <select className={SELECT_CLASS} value={moduleToAdd} onChange={(event) => setModuleToAdd(event.target.value)}>
                    <option value="">Selecione um módulo…</option>
                    {optionsOf("module").filter((option) => !form.modules.some((module) => module.catalog_id === option.id)).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </Field>
                <Button variant="outline" onClick={() => { if (moduleToAdd) { addModule(moduleToAdd); setModuleToAdd(""); } }} disabled={!moduleToAdd}><Plus className="h-4 w-4" />Adicionar módulo</Button>
              </div>}
              {form.modules.length === 0 && <EmptyHint text="Nenhum módulo vinculado. Adicione as opções do catálogo para registrar contratado, não contratado ou a confirmar." />}
            </CardContent></Card>

            <Card><CardContent className="space-y-4 p-4 sm:p-6">
              <SectionTitle title="Dimensionamento da operação" description="Informe somente o que for conhecido. Os campos vazios permanecem como informação não levantada." />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <NumberField label="Usuários contratados" value={form.dimensions.contracted_users} disabled={readOnly} onChange={(value) => update((current) => ({ ...current, dimensions: { ...current.dimensions, contracted_users: value } }))} />
                <NumberField label="Lojas ou filiais" value={form.dimensions.stores_or_branches} disabled={readOnly} onChange={(value) => update((current) => ({ ...current, dimensions: { ...current.dimensions, stores_or_branches: value } }))} />
                <NumberField label="Depósitos / almoxarifados" value={form.dimensions.warehouses} disabled={readOnly} onChange={(value) => update((current) => ({ ...current, dimensions: { ...current.dimensions, warehouses: value } }))} />
                <NumberField label="Caixas / terminais PDV" value={form.dimensions.pos_terminals} disabled={readOnly} onChange={(value) => update((current) => ({ ...current, dimensions: { ...current.dimensions, pos_terminals: value } }))} />
                <NumberField label="Vendedores" value={form.dimensions.salespeople} disabled={readOnly} onChange={(value) => update((current) => ({ ...current, dimensions: { ...current.dimensions, salespeople: value } }))} />
                <NumberField label="Unidades produtivas" value={form.dimensions.production_units} disabled={readOnly} onChange={(value) => update((current) => ({ ...current, dimensions: { ...current.dimensions, production_units: value } }))} />
              </div>
              <Field label="Observações de dimensionamento" optional><Textarea disabled={readOnly} rows={3} value={form.dimensions.notes} onChange={(event) => update((current) => ({ ...current, dimensions: { ...current.dimensions, notes: event.target.value } }))} /></Field>
            </CardContent></Card>
          </div>
        )}

        {activeSection === "integrations" && (
          <div className="space-y-5">
            <Card><CardContent className="space-y-4 p-4 sm:p-6">
              <SectionTitle title="Integrações com sistemas externos" description="Cadastre cada plataforma e conte em texto livre o que precisa acontecer. Os detalhes técnicos podem ser completados depois; o nome não confirma compatibilidade, viabilidade, contratação ou prazo." action={!readOnly && <Button variant="outline" size="sm" onClick={addIntegration}><Plus className="h-4 w-4" />Adicionar integração</Button>} />
              <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/15 p-3 text-sm"><Checkbox disabled={readOnly} checked={form.integration_mapping_confirmed} onCheckedChange={(checked) => updateParent({ integration_mapping_confirmed: Boolean(checked) })} /><span><span className="font-medium">Mapeamento revisado: não há outras integrações a registrar</span><span className="mt-0.5 block text-xs text-muted-foreground">Marque somente depois de investigar com o cliente. Isso não aprova tecnicamente nenhuma integração já cadastrada.</span></span></label>
              {form.integrations.length === 0 ? <EmptyHint text="Ainda não há integrações registradas. Use o botão acima ou confirme que não existem integrações identificadas." /> : <div className="space-y-4">
                {form.integrations.map((integration, index) => {
                  const category = catalog.find((option) => option.id === integration.category_id)?.name || "";
                  const ecommerce = /e-commerce|marketplace|integrador de pedidos|hub de integra/i.test(category);
                  const statusLabel = INTEGRATION_STATUS.find((option) => option.value === integration.status)?.label || "Situação a confirmar";
                  return <div key={integration.id} className="space-y-4 rounded-xl border border-border p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <div className="font-semibold">Integração {index + 1}</div>
                        <Badge variant="outline" className="max-w-full whitespace-normal" aria-label={`Situação técnica: ${statusLabel}`}>{statusLabel}</Badge>
                      </div>
                      {!readOnly && <Button variant="ghost" size="icon" aria-label="Remover integração" onClick={() => deleteFrom("integrations", integration.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </div>
                    <Field label="Sistema ou plataforma externa">
                      <Input disabled={readOnly} value={integration.name} onChange={(event) => updateIntegration(integration.id, { name: event.target.value })} placeholder="Ex.: nome informado pelo cliente" />
                    </Field>
                    <Field label="Necessidade da integração" optional hint="Conte com suas palavras o que precisa acontecer entre os sistemas.">
                      <Textarea disabled={readOnly} rows={4} value={integration.data_scope} onChange={(event) => updateIntegration(integration.id, { data_scope: event.target.value })} placeholder="Quais informações o cliente quer enviar ou receber? Para quê?" />
                    </Field>
                    <Field label="Contexto informado pelo cliente" optional>
                      <Textarea disabled={readOnly} rows={3} value={integration.observations} onChange={(event) => updateIntegration(integration.id, { observations: event.target.value })} placeholder="Registre detalhes, acordos ou exemplos que ajudem a entender a necessidade…" />
                    </Field>
                    <Field label="Dúvidas, riscos ou dependências" optional>
                      <Textarea disabled={readOnly} rows={3} value={integration.risks_and_questions} onChange={(event) => updateIntegration(integration.id, { risks_and_questions: event.target.value })} placeholder="O que ainda precisa ser confirmado com cliente, fornecedor ou equipe?" />
                    </Field>
                    <details className="rounded-lg border border-border bg-muted/10 p-3">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                        <span>
                          <span className="block text-sm font-medium">Complementos (opcional)</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">Categoria, situação e dados do fluxo; atualize quando forem confirmados. Faltas relevantes continuam sinalizadas como pendências.</span>
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </summary>
                      <div className="mt-4 space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <Field label="Categoria"><SmallSelect disabled={readOnly} value={integration.category_id} onChange={(value) => updateIntegration(integration.id, { category_id: value, category_name_snapshot: catalog.find((option) => option.id === value)?.name || "" })} options={[{ value: "", label: "A confirmar" }, ...optionsOf("integration_category").map((option) => ({ value: option.id, label: option.name }))]} /></Field>
                          <Field label="Tipo de integração"><SmallSelect disabled={readOnly} value={integration.implementation_type} onChange={(value) => updateIntegration(integration.id, { implementation_type: value })} options={[{ value: "existente", label: "Já existe" }, { value: "a_desenvolver", label: "A desenvolver" }, { value: "nao_definido", label: "A confirmar" }]} /></Field>
                          <Field label="Situação da contratação"><SmallSelect disabled={readOnly} value={integration.contracted_status} onChange={(value) => updateIntegration(integration.id, { contracted_status: value })} options={[{ value: "contratada", label: "Contratada" }, { value: "nao_contratada", label: "Não contratada" }, { value: "a_confirmar", label: "A confirmar" }]} /></Field>
                          <Field label="Situação técnica"><SmallSelect disabled={readOnly} value={integration.status} onChange={(value) => updateIntegration(integration.id, { status: value })} options={INTEGRATION_STATUS.map((option) => ({ value: option.value, label: option.label }))} /></Field>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <Field label="Fabricante / fornecedor" optional><Input disabled={readOnly} value={integration.vendor} onChange={(event) => updateIntegration(integration.id, { vendor: event.target.value })} /></Field>
                          <Field label="Site / referência" optional><Input disabled={readOnly} type="url" value={integration.website} onChange={(event) => updateIntegration(integration.id, { website: event.target.value })} placeholder="https://" /></Field>
                          <Field label="Sistema externo em uso"><SmallSelect disabled={readOnly} value={integration.is_in_use} onChange={(value) => updateIntegration(integration.id, { is_in_use: value })} options={[{ value: "sim", label: "Sim" }, { value: "nao", label: "Não" }, { value: "a_confirmar", label: "A confirmar" }]} /></Field>
                          <Field label="Origem dos dados"><Input disabled={readOnly} value={integration.source_system} onChange={(event) => updateIntegration(integration.id, { source_system: event.target.value })} placeholder={ecommerce ? "Ex.: plataforma de pedidos" : "Sistema de origem"} /></Field>
                          <Field label="Destino dos dados"><Input disabled={readOnly} value={integration.destination_system} onChange={(event) => updateIntegration(integration.id, { destination_system: event.target.value })} placeholder="Sistema de destino" /></Field>
                          <Field label="Direção"><SmallSelect disabled={readOnly} value={integration.direction} onChange={(value) => updateIntegration(integration.id, { direction: value })} options={[{ value: "entrada", label: "Entrada" }, { value: "saida", label: "Saída" }, { value: "bidirecional", label: "Bidirecional" }, { value: "a_confirmar", label: "A confirmar" }]} /></Field>
                          <Field label="Método de comunicação"><SmallSelect disabled={readOnly} value={integration.communication_method} onChange={(value) => updateIntegration(integration.id, { communication_method: value })} options={[{ value: "api", label: "API" }, { value: "arquivo", label: "Arquivo" }, { value: "planilha", label: "Planilha" }, { value: "conector", label: "Conector" }, { value: "outro", label: "Outro" }, { value: "a_confirmar", label: "A confirmar" }]} /></Field>
                          <Field label="Detalhe do método" optional><Input disabled={readOnly} value={integration.method_details} onChange={(event) => updateIntegration(integration.id, { method_details: event.target.value })} placeholder="Conector, formato, frequência…" /></Field>
                          <Field label="Documentação técnica disponível"><SmallSelect disabled={readOnly} value={integration.documentation_status} onChange={(value) => updateIntegration(integration.id, { documentation_status: value })} options={[{ value: "sim", label: "Sim" }, { value: "nao", label: "Não" }, { value: "a_confirmar", label: "A confirmar" }]} /></Field>
                          <Field label="Acesso administrativo disponível"><SmallSelect disabled={readOnly} value={integration.admin_access_status} onChange={(value) => updateIntegration(integration.id, { admin_access_status: value })} options={[{ value: "sim", label: "Sim" }, { value: "nao", label: "Não" }, { value: "a_confirmar", label: "A confirmar" }]} /></Field>
                          <Field label="Responsável técnico do fornecedor" optional><Input disabled={readOnly} value={integration.external_technical_contact} onChange={(event) => updateIntegration(integration.id, { external_technical_contact: event.target.value })} /></Field>
                          <Field label="Custos adicionais"><SmallSelect disabled={readOnly} value={integration.additional_costs} onChange={(value) => updateIntegration(integration.id, { additional_costs: value })} options={[{ value: "sim", label: "Sim" }, { value: "nao", label: "Não" }, { value: "a_confirmar", label: "A confirmar" }]} /></Field>
                          <Field label="Previsão de implantação" optional><Input disabled={readOnly} type="date" value={integration.planned_start_date} onChange={(event) => updateIntegration(integration.id, { planned_start_date: event.target.value })} /></Field>
                          <Field label="Responsável pela análise" optional><Input disabled={readOnly} value={integration.owner} onChange={(event) => updateIntegration(integration.id, { owner: event.target.value })} /></Field>
                        </div>
                      </div>
                    </details>
                  </div>;
                })}
              </div>}
            </CardContent></Card>
          </div>
        )}

        {activeSection === "data" && (
          <div className="space-y-5">
            <Card><CardContent className="space-y-4 p-4 sm:p-6">
              <SectionTitle title="Migração de dados" description="Acompanhe os dados por grupo, origem, formato e situação. Anexos são privados e vinculados ao levantamento." action={!readOnly && <Button variant="outline" size="sm" onClick={addMigration}><Plus className="h-4 w-4" />Adicionar grupo de dados</Button>} />
              <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/15 p-3 text-sm"><Checkbox disabled={readOnly} checked={form.migration_reviewed} onCheckedChange={(checked) => updateParent({ migration_reviewed: Boolean(checked) })} /><span><span className="font-medium">Migração avaliada: não há dados a migrar</span><span className="mt-0.5 block text-xs text-muted-foreground">Marque somente se o cliente e a equipe comercial confirmaram a ausência de migração.</span></span></label>
              {form.migrations.length === 0 ? <EmptyHint text="Nenhum grupo de dados cadastrado. Registre os grupos a migrar ou marque a confirmação de que não há migração." /> : <div className="space-y-4">
                {form.migrations.map((migration, index) => {
                  const migrationFiles = form.files.filter((file) => file.migration_id === migration.id);
                  return <div key={migration.id} className="space-y-4 rounded-xl border border-border p-4 sm:p-5">
                    <div className="flex items-center justify-between"><div className="font-semibold">Grupo de dados {index + 1}</div>{!readOnly && <Button variant="ghost" size="icon" aria-label="Remover grupo de migração" onClick={() => { deleteFrom("migrations", migration.id); update((current) => ({ ...current, files: current.files.map((file) => file.migration_id === migration.id ? { ...file, migration_id: null } : file) })); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <Field label="Grupo de dados"><SmallSelect disabled={readOnly} value={migration.data_group_id} onChange={(value) => updateMigration(migration.id, { data_group_id: value, data_group_snapshot: catalog.find((option) => option.id === value)?.name || "" })} options={[{ value: "", label: "A confirmar" }, ...optionsOf("migration_group").map((option) => ({ value: option.id, label: option.name }))]} /></Field>
                      <Field label="Migração necessária?"><SmallSelect disabled={readOnly} value={migration.necessary_status} onChange={(value) => updateMigration(migration.id, { necessary_status: value })} options={[{ value: "sim", label: "Sim" }, { value: "nao", label: "Não" }, { value: "confirmar", label: "A confirmar" }]} /></Field>
                      <Field label="Sistema de origem" optional><Input disabled={readOnly} value={migration.source_system} onChange={(event) => updateMigration(migration.id, { source_system: event.target.value })} /></Field>
                      <Field label="Formato disponível"><SmallSelect disabled={readOnly} value={migration.available_format} onChange={(value) => updateMigration(migration.id, { available_format: value })} options={[{ value: "excel", label: "Excel" }, { value: "csv", label: "CSV" }, { value: "xml", label: "XML" }, { value: "banco_dados", label: "Banco de dados" }, { value: "api", label: "API" }, { value: "outro", label: "Outro" }, { value: "a_confirmar", label: "A confirmar" }]} /></Field>
                      {migration.available_format === "outro" && <Field label="Especifique o formato"><Input disabled={readOnly} value={migration.format_details} onChange={(event) => updateMigration(migration.id, { format_details: event.target.value })} /></Field>}
                      <Field label="Responsável por fornecer" optional><Input disabled={readOnly} value={migration.data_provider} onChange={(event) => updateMigration(migration.id, { data_provider: event.target.value })} /></Field>
                      <Field label="Previsão de entrega" optional><Input disabled={readOnly} type="date" value={migration.expected_delivery_date} onChange={(event) => updateMigration(migration.id, { expected_delivery_date: event.target.value })} /></Field>
                      <Field label="Situação da preparação"><SmallSelect disabled={readOnly} value={migration.preparation_status} onChange={(value) => updateMigration(migration.id, { preparation_status: value })} options={MIGRATION_STATUS.map((option) => ({ value: option.value, label: option.label }))} /></Field>
                      <Field label="Situação da validação"><SmallSelect disabled={readOnly} value={migration.validation_status} onChange={(value) => updateMigration(migration.id, { validation_status: value })} options={MIGRATION_STATUS.map((option) => ({ value: option.value, label: option.label }))} /></Field>
                    </div>
                    <Field label="Observações" optional><Textarea disabled={readOnly} rows={2} value={migration.observations} onChange={(event) => updateMigration(migration.id, { observations: event.target.value })} /></Field>
                    <div className="rounded-lg border border-dashed border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-medium">Arquivos recebidos</div><div className="text-xs text-muted-foreground">Planilhas e documentos de até 25 MB por arquivo</div></div>
                        {!readOnly && <label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted ${uploadBusy === migration.id ? "pointer-events-none opacity-50" : ""}`}><Upload className="h-4 w-4" />{uploadBusy === migration.id ? "Enviando…" : "Anexar arquivos"}<input className="sr-only" type="file" multiple accept=".xlsx,.xls,.csv,.xml,.pdf,.zip,.png,.jpg,.jpeg" disabled={uploadBusy === migration.id} onChange={(event) => { void uploadFiles(migration.id, event.target.files); event.target.value = ""; }} /></label>}
                      </div>
                      {migrationFiles.length > 0 && <div className="mt-3 space-y-2">{migrationFiles.map((file) => <div key={file.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-3 py-2 text-xs"><button type="button" className="flex min-w-0 items-center gap-2 text-left text-primary hover:underline" onClick={() => void openFile(file.file_path)}><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{file.file_name}</span><span className="shrink-0 text-muted-foreground">{formatBytes(file.file_size)}</span></button>{!readOnly && <Button variant="ghost" size="icon" aria-label="Remover arquivo" onClick={() => void removeFile(file.id)}><X className="h-4 w-4" /></Button>}</div>)}</div>}
                    </div>
                  </div>;
                })}
              </div>}
            </CardContent></Card>

            <Card><CardContent className="space-y-4 p-4 sm:p-6">
              <SectionTitle title="Demandas específicas identificadas" description="O registro documenta o que foi solicitado na negociação. Cada item permanece aguardando análise e não é considerado contratado ou aprovado automaticamente." action={!readOnly && <Button variant="outline" size="sm" onClick={addDemand}><Plus className="h-4 w-4" />Adicionar demanda</Button>} />
              {form.demands.length === 0 ? <EmptyHint text="Nenhuma demanda adicional registrada." /> : <div className="space-y-4">
                {form.demands.map((demand, index) => <div key={demand.id} className="space-y-3 rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between"><div className="font-semibold">Demanda {index + 1}<Badge className="ml-2 bg-amber-500/10 text-amber-700 dark:text-amber-300">Não aprovada automaticamente</Badge></div>{!readOnly && <Button variant="ghost" size="icon" aria-label="Remover demanda" onClick={() => deleteFrom("demands", demand.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                    <Field label="Título"><Input disabled={readOnly} value={demand.title} onChange={(event) => updateDemand(demand.id, { title: event.target.value })} /></Field>
                    <Field label="Categoria"><SmallSelect disabled={readOnly} value={demand.category_id} onChange={(value) => updateDemand(demand.id, { category_id: value, category_name_snapshot: catalog.find((option) => option.id === value)?.name || "" })} options={[{ value: "", label: "A confirmar" }, ...optionsOf("demand_category").map((option) => ({ value: option.id, label: option.name }))]} /></Field>
                    <Field label="Módulo relacionado" optional><select disabled={readOnly} className={SELECT_CLASS} value={demand.related_module} onChange={(event) => updateDemand(demand.id, { related_module: event.target.value })}><option value="">A confirmar</option>{form.modules.map((module) => <option key={module.id} value={catalog.find((option) => option.id === module.catalog_id)?.name || ""}>{catalog.find((option) => option.id === module.catalog_id)?.name}</option>)}</select></Field>
                    <Field label="Prioridade"><SmallSelect disabled={readOnly} value={demand.priority} onChange={(value) => updateDemand(demand.id, { priority: value })} options={[{ value: "baixa", label: "Baixa" }, { value: "media", label: "Média" }, { value: "alta", label: "Alta" }, { value: "critica", label: "Crítica" }]} /></Field>
                    <Field label="Responsável pela análise" optional><Input disabled={readOnly} value={demand.analysis_owner} onChange={(event) => updateDemand(demand.id, { analysis_owner: event.target.value })} /></Field>
                    <Field label="Situação"><SmallSelect disabled={readOnly || !isReviewer} value={demand.status} onChange={(value) => updateDemand(demand.id, { status: value })} options={[{ value: "aguardando_analise", label: "Aguardando análise" }, { value: "aprovada", label: "Aprovada pela equipe" }, { value: "orcamento_adicional", label: "Orçamento adicional" }, { value: "nao_aprovada", label: "Não aprovada" }, { value: "em_desenvolvimento", label: "Em desenvolvimento" }, { value: "concluida", label: "Concluída" }]} /></Field>
                    <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><label className="flex items-center gap-2 text-sm"><Checkbox disabled={readOnly} checked={demand.custom_development} onCheckedChange={(checked) => updateDemand(demand.id, { custom_development: Boolean(checked) })} />Necessita desenvolvimento personalizado</label><label className="flex items-center gap-2 text-sm"><Checkbox disabled={readOnly} checked={demand.additional_budget} onCheckedChange={(checked) => updateDemand(demand.id, { additional_budget: Boolean(checked) })} />Necessita orçamento adicional</label></div>
                  </div>
                  <Field label="Descrição detalhada"><Textarea disabled={readOnly} rows={3} value={demand.description} onChange={(event) => updateDemand(demand.id, { description: event.target.value })} /></Field>
                  <Field label="Observações" optional><Input disabled={readOnly} value={demand.observations} onChange={(event) => updateDemand(demand.id, { observations: event.target.value })} /></Field>
                </div>)}
              </div>}
            </CardContent></Card>
          </div>
        )}

        {activeSection === "review" && (
          <div className="space-y-5">
            <Card><CardContent className="space-y-4 p-4 sm:p-6">
              <SectionTitle title="Infraestrutura e condições de implantação" description="Use “A confirmar” quando a resposta depender do cliente ou de uma avaliação técnica. As perguntas não criam tarefas ou escopo automaticamente." />
              <div className="space-y-3">
                {INFRASTRUCTURE_QUESTIONS.map((question) => {
                  const response = form.infrastructure.find((item) => item.question_key === question.key);
                  if (!response) return null;
                  const detailsVisible = response.answer === "sim" || response.answer === "a_confirmar";
                  return <div key={question.key} className="grid gap-3 rounded-lg border border-border p-3 lg:grid-cols-[minmax(0,1.5fr)_220px_minmax(200px,1fr)] lg:items-center">
                    <div className="text-sm font-medium">{question.label}</div>
                    <SmallSelect disabled={readOnly} value={response.answer} onChange={(value) => update((current) => ({ ...current, infrastructure: current.infrastructure.map((item) => item.id === response.id ? { ...item, answer: value } : item) }))} options={[{ value: "sim", label: "Sim" }, { value: "nao", label: "Não" }, { value: "nao_aplicavel", label: "Não se aplica" }, { value: "a_confirmar", label: "A confirmar" }]} />
                    {detailsVisible && <Input disabled={readOnly} value={response.details} onChange={(event) => update((current) => ({ ...current, infrastructure: current.infrastructure.map((item) => item.id === response.id ? { ...item, details: event.target.value } : item) }))} placeholder="Detalhes, datas, quantidade ou contexto…" />}
                  </div>;
                })}
              </div>
            </CardContent></Card>

            {isReviewer && form.id && form.status === "em_analise" && (
              <Card className="border-violet-500/30"><CardContent className="space-y-4 p-4 sm:p-6">
                <SectionTitle title="Validação técnica da implantação" description="A aprovação técnica é diferente da completude. Confirme os três pontos antes de aprovar para planejamento." />
                <div className="grid gap-3 md:grid-cols-3">
                  {([
                    ["scope", "Escopo, empresas e módulos revisados"],
                    ["dependencies", "Integrações, migração e dependências avaliadas"],
                    ["gaps", "Lacunas, riscos e responsáveis registrados"],
                  ] as const).map(([key, label]) => <label key={key} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm"><Checkbox checked={reviewChecklist[key]} onCheckedChange={(checked) => updateParent({ technical_review_checklist: { ...reviewChecklist, [key]: Boolean(checked) } })} /><span>{label}</span></label>)}
                </div>
                <Field label="Observação da análise técnica" optional><Textarea value={form.review_notes} onChange={(event) => updateParent({ review_notes: event.target.value })} rows={3} placeholder="Riscos, dependências e orientações para o planejamento…" /></Field>
                <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setReturnDialogOpen(true)} disabled={saving}><ArrowLeft className="h-4 w-4" />Devolver para complementação</Button><Button onClick={() => void transition("aprovado_planejamento", form.review_notes, reviewChecklist)} disabled={saving || !reviewChecklist.scope || !reviewChecklist.dependencies || !reviewChecklist.gaps}><BadgeCheck className="h-4 w-4" />Aprovar para planejamento</Button></div>
              </CardContent></Card>
            )}

            <Card><CardContent className="space-y-4 p-4 sm:p-6">
              <SectionTitle title="Pendências e histórico de validação" description="Mudanças de situação registradas automaticamente com responsável e data." />
              {pending.length === 0 ? <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />Nenhuma lacuna automática identificada. Isso não equivale a aprovação técnica.</div> : <div className="space-y-2">{pending.map((item) => <div key={item.key} className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm"><span>{item.message}</span><Badge variant="outline" className="shrink-0">{item.responsible}</Badge></div>)}</div>}
              {form.history.length === 0 ? <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">O histórico aparece após salvar e alterar a situação do levantamento.</div> : <ol className="space-y-3 border-l border-border pl-4">{[...form.history].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((event) => <li key={event.id} className="relative"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" /><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><AssessmentStatusBadge status={event.to_status} /><span className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {event.changed_by_name || "Usuário"}</span></div>{event.note && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{event.note}</p>}</li>)}</ol>}
            </CardContent></Card>
          </div>
        )}

      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:px-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span aria-live="polite">{saving ? "Salvando…" : dirty ? "Alterações não salvas" : savedMessage || "Rascunho salvo"}</span>
              <span aria-hidden="true">·</span>
              <span>{pending.length} pendência(s)</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" aria-label="Ir para a etapa anterior" disabled={activeSectionIndex === 0} onClick={() => setActiveSection(SECTIONS[Math.max(0, activeSectionIndex - 1)].id)}><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Anterior</span></Button>
            {canEdit && <Button variant="outline" size="sm" onClick={() => void save(false)} disabled={saving || !dirty && Boolean(form.id)}><Save className="h-4 w-4" />Salvar rascunho</Button>}
            {hasWorkflowActions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="sm" aria-label="Abrir ações do fluxo"><MoreHorizontal className="h-4 w-4" /><span className="hidden sm:inline">Ações</span></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="w-64">
                  <DropdownMenuLabel>Ações do fluxo</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {canStartReview && <DropdownMenuItem disabled={saving} onSelect={() => void transition("em_analise")}><ShieldCheck className="h-4 w-4" />Iniciar análise técnica</DropdownMenuItem>}
                  {canWaitCommercial && <DropdownMenuItem disabled={saving} onSelect={() => void transition("aguardando_comercial")}><Clock3 className="h-4 w-4" />Aguardar complementação comercial</DropdownMenuItem>}
                  {canWaitClient && <DropdownMenuItem disabled={saving} onSelect={() => void transition("aguardando_cliente")}><Clock3 className="h-4 w-4" />Aguardar retorno do cliente</DropdownMenuItem>}
                  {canReopenReview && <DropdownMenuItem disabled={saving} onSelect={() => void transition("em_analise")}><ShieldCheck className="h-4 w-4" />Reabrir análise técnica</DropdownMenuItem>}
                  {canArchive && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" disabled={saving} onSelect={() => setArchivedDialogOpen(true)}>Arquivar levantamento</DropdownMenuItem></>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {activeSectionIndex < SECTIONS.length - 1 ? (
              <Button size="sm" onClick={() => setActiveSection(SECTIONS[activeSectionIndex + 1].id)}>Próxima seção<ArrowRight className="h-4 w-4" /></Button>
            ) : canSendForReview ? (
              <Button size="sm" onClick={() => void transition("pronto_analise")} disabled={saving}><ArrowRight className="h-4 w-4" />Enviar para análise</Button>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Devolver para complementação</DialogTitle><DialogDescription>Descreva de forma objetiva quais informações precisam ser complementadas e por quem.</DialogDescription></DialogHeader>
          <Textarea rows={5} value={returnMessage} onChange={(event) => setReturnMessage(event.target.value)} placeholder="Ex.: confirmar CNPJ da filial; cliente deve enviar layout de produtos; fornecedor deve compartilhar a documentação da API…" />
          <DialogFooter><Button variant="outline" onClick={() => setReturnDialogOpen(false)}>Cancelar</Button><Button onClick={() => { if (returnMessage.trim().length < 5) return toast.error("Descreva ao menos uma pendência objetiva."); void transition("devolvido", returnMessage); }} disabled={saving || returnMessage.trim().length < 5}>Devolver com pendências</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={catalogDialogOpen} onOpenChange={setCatalogDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Configuração dos catálogos</DialogTitle><DialogDescription>Administradores podem incluir ou desativar módulos e categorias desta base. Opções já usadas são preservadas nos levantamentos existentes.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
            <select className={SELECT_CLASS} value={catalogKind} onChange={(event) => setCatalogKind(event.target.value as CatalogKind)}>{ASSESSMENT_CATALOG_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
            <Input value={catalogName} onChange={(event) => setCatalogName(event.target.value)} placeholder="Nome da nova opção" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addCatalog(); } }} />
            <Button onClick={() => void addCatalog()} disabled={catalogSaving || !catalogName.trim()}><Plus className="h-4 w-4" />Adicionar</Button>
          </div>
          <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">{catalog.filter((option) => option.kind === catalogKind).map((option) => <div key={option.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"><span className={option.active ? "" : "text-muted-foreground line-through"}>{option.name}</span><Button variant="outline" size="sm" onClick={() => void toggleCatalogOption(option)}>{option.active ? "Desativar" : "Reativar"}</Button></div>)}</div>
          <DialogFooter><Button variant="outline" onClick={() => setCatalogDialogOpen(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Prévia de atividades para o cronograma</DialogTitle><DialogDescription>Revise e selecione as sugestões. Nenhuma data, duração ou responsável será presumido. Itens existentes são sinalizados e não serão duplicados.</DialogDescription></DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground"><CircleHelp className="h-4 w-4 shrink-0" />Cada atividade mantém a referência da empresa, módulo, integração ou informação de origem.</div>
          <div className="space-y-2">{previewItems.map((item) => <label key={item.sourceReference} className={`flex items-start gap-3 rounded-lg border p-3 ${item.duplicate ? "bg-muted/30 opacity-70" : ""}`}><Checkbox disabled={item.duplicate || previewBusy} checked={item.selected} onCheckedChange={(checked) => setPreviewItems((current) => current.map((row) => row.sourceReference === item.sourceReference ? { ...row, selected: Boolean(checked) } : row))} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">Origem: {item.sourceLabel}</span></span>{item.duplicate && <Badge variant="outline" className="shrink-0">Já existe</Badge>}</label>)}</div>
          <DialogFooter><Button variant="outline" onClick={() => setPreviewOpen(false)}>Cancelar</Button><Button onClick={() => void createSuggestedActivities()} disabled={previewBusy || !previewItems.some((item) => item.selected && !item.duplicate)}>{previewBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Confirmar atividades</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={archivedDialogOpen} onOpenChange={setArchivedDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>Arquivar levantamento</DialogTitle><DialogDescription>O registro continuará disponível para consulta e impressão, mas não seguirá no fluxo normal de preenchimento.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setArchivedDialogOpen(false)}>Cancelar</Button><Button onClick={() => void transition("arquivado")} disabled={saving}>Arquivar</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">{text}</div>;
}

function NumberField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <Field label={label} optional><Input disabled={disabled} type="number" min="0" step="1" inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value)} placeholder="A confirmar" /></Field>;
}

function RestrictedAssessment() {
  return <div className="min-h-screen bg-background"><AppHeader /><main className="mx-auto max-w-3xl px-4 py-20 text-center"><BackButton to="/levantamento-comercial" /><div className="mt-6 rounded-2xl border border-border bg-card/60 p-8"><h1 className="text-2xl font-semibold">Acesso restrito</h1><p className="mt-2 text-muted-foreground">Você não tem permissão para consultar ou alterar este levantamento.</p></div></main></div>;
}
