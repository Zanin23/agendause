import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertCircle, ArrowRight, Building2, CalendarDays, CheckCircle2, ClipboardCheck,
  FileSearch, Loader2, Plus, Search, Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/usePermissions";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ASSESSMENT_STATUS, STATUS_OPTIONS, type AssessmentStatus } from "@/lib/commercialAssessment";
import { commercialMigrationError } from "@/lib/commercialAssessment";
import { loadAssessmentList, loadImplementationSchedules, type CommercialAssessmentListRow } from "@/lib/commercialAssessmentRepository";

const dateLabel = (value?: string | null) => {
  if (!value) return "—";
  try { return format(parseISO(value), "dd/MM/yyyy", { locale: ptBR }); } catch { return value; }
};

export default function CommercialAssessments() {
  const navigate = useNavigate();
  const { activeId } = useWorkspace();
  const { isAdmin, hasScreenPermission, hasSchedulePermission, loading: permissionsLoading } = usePermissions();
  const [rows, setRows] = useState<CommercialAssessmentListRow[]>([]);
  const [scheduleNames, setScheduleNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [salesOwner, setSalesOwner] = useState("");
  const [status, setStatus] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const canReadAll = isAdmin || hasScreenPermission("commercial_assessments", "read") ||
    hasScreenPermission("commercial_assessments", "write") ||
    hasScreenPermission("commercial_assessments_review", "read") ||
    hasScreenPermission("commercial_assessments_review", "write");
  const canCreate = isAdmin || hasScreenPermission("commercial_assessments", "write");

  const load = useCallback(async () => {
    if (!activeId) return;
    setLoading(true);
    try {
      const [assessments, schedules] = await Promise.all([
        loadAssessmentList(activeId),
        loadImplementationSchedules().catch(() => []),
      ]);
      const names = Object.fromEntries(schedules.map((schedule) => [schedule.id, schedule.client_name]));
      setRows(assessments);
      setScheduleNames(names);
    } catch (error) {
      toast.error(commercialMigrationError(error));
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  useEffect(() => {
    if (!permissionsLoading) void load();
  }, [permissionsLoading, load]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    const owner = salesOwner.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((row) => {
      const scheduleVisible = row.schedule_id ? hasSchedulePermission(row.schedule_id, "read") : false;
      if (!canReadAll && !scheduleVisible) return false;
      const name = `${row.client_name || ""} ${scheduleNames[row.schedule_id] || ""}`.toLocaleLowerCase("pt-BR");
      if (normalized && !name.includes(normalized)) return false;
      if (owner && !(row.sales_owner || "").toLocaleLowerCase("pt-BR").includes(owner)) return false;
      if (status !== "all" && row.status !== status) return false;
      const day = row.surveyed_on || "";
      if (fromDate && (!day || day < fromDate)) return false;
      if (toDate && (!day || day > toDate)) return false;
      return true;
    });
  }, [rows, query, salesOwner, status, fromDate, toDate, canReadAll, hasSchedulePermission, scheduleNames]);

  const metrics = useMemo(() => ({
    total: rows.filter((row) => canReadAll || (row.schedule_id && hasSchedulePermission(row.schedule_id))).length,
    inProgress: rows.filter((row) => ["em_preenchimento", "aguardando_comercial", "aguardando_cliente"].includes(row.status)).length,
    review: rows.filter((row) => ["pronto_analise", "em_analise", "devolvido"].includes(row.status)).length,
    approved: rows.filter((row) => row.status === "aprovado_planejamento").length,
    pending: rows.reduce((sum, row) => sum + Number(row.pending_count || 0), 0),
  }), [rows, canReadAll, hasSchedulePermission]);

  if (permissionsLoading) {
    return <div className="min-h-screen bg-background"><AppHeader /><div className="py-20 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Carregando permissões…</div></div>;
  }

  if (!canReadAll && !rows.some((row) => row.schedule_id && hasSchedulePermission(row.schedule_id, "read"))) {
    return (
      <div className="min-h-screen bg-background">
        <SEO title="Levantamento Comercial — TreinaCheck" description="Cenário comercial e pré-implantação dos clientes ERP." path="/levantamento-comercial" />
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-20 text-center">
          <BackButton to="/" />
          <div className="mt-6 rounded-2xl border border-border bg-card/60 p-8">
            <h1 className="text-2xl font-semibold">Acesso restrito</h1>
            <p className="mt-2 text-muted-foreground">Solicite ao administrador acesso à tela Levantamento Comercial.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Levantamento Comercial — TreinaCheck" description="Cenário comercial e pré-implantação dos clientes ERP." path="/levantamento-comercial" />
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <BackButton to="/" />
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              <ClipboardCheck className="h-7 w-7 text-primary" /> Levantamento Comercial
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Centralize o que foi acordado, o cenário do cliente e os pontos que implantação precisa analisar antes do planejamento.
            </p>
          </div>
          {canCreate && <Button onClick={() => navigate("/levantamento-comercial/novo")}><Plus className="h-4 w-4" />Novo levantamento</Button>}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { label: "Levantamentos", value: metrics.total, icon: FileSearch, tone: "text-primary" },
            { label: "Em preenchimento", value: metrics.inProgress, icon: Users, tone: "text-amber-600" },
            { label: "Em análise", value: metrics.review, icon: AlertCircle, tone: "text-violet-600" },
            { label: "Aprovados", value: metrics.approved, icon: CheckCircle2, tone: "text-emerald-600" },
            { label: "Pendências", value: metrics.pending, icon: CalendarDays, tone: "text-orange-600" },
          ].map(({ label, value, icon: Icon, tone }) => (
            <Card key={label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{label}</span><Icon className={`h-4 w-4 ${tone}`} /></div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Pesquisar cliente ou grupo…" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <Input placeholder="Responsável comercial" value={salesOwner} onChange={(event) => setSalesOwner(event.target.value)} aria-label="Filtrar por responsável comercial" />
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar por situação">
              <option value="all">Todas as situações</option>
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2 lg:col-span-5 lg:grid-cols-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" />Período do levantamento</div>
              <Input aria-label="Data inicial" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              <Input aria-label="Data final" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
              <Button variant="ghost" onClick={() => { setQuery(""); setSalesOwner(""); setStatus("all"); setFromDate(""); setToDate(""); }}>Limpar filtros</Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Carregando levantamentos…</CardContent></Card>
        ) : visible.length === 0 ? (
          <Card><CardContent className="py-12 text-center">
            <Building2 className="mx-auto h-9 w-9 text-muted-foreground/60" />
            <p className="mt-3 font-medium">Nenhum levantamento encontrado</p>
            <p className="mt-1 text-sm text-muted-foreground">Ajuste os filtros ou inicie um novo levantamento comercial.</p>
            {canCreate && <Button className="mt-4" onClick={() => navigate("/levantamento-comercial/novo")}><Plus className="h-4 w-4" />Criar levantamento</Button>}
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {visible.map((row) => {
              const meta = ASSESSMENT_STATUS[row.status as AssessmentStatus] ?? ASSESSMENT_STATUS.em_preenchimento;
              const projectName = row.schedule_id ? scheduleNames[row.schedule_id] : null;
              return (
                <button key={row.id} type="button" onClick={() => navigate(`/levantamento-comercial/${row.id}`)} className="w-full text-left">
                  <Card className="transition-colors hover:border-primary/50">
                    <CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(160px,.8fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{row.client_name}</div>
                        {projectName && <div className="mt-1 truncate text-xs text-muted-foreground">Projeto: {projectName}</div>}
                        {!row.schedule_id && <div className="mt-1 text-xs text-muted-foreground">Sem cronograma vinculado</div>}
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Responsável comercial</div>
                        <div className="mt-1 truncate text-sm">{row.sales_owner || "A definir"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Datas</div>
                        <div className="mt-1 text-sm">Levantamento {dateLabel(row.surveyed_on)}</div>
                        <div className="text-xs text-muted-foreground">Contratação {dateLabel(row.contracted_on)}</div>
                      </div>
                      <div className="space-y-1.5">
                        <Badge className={meta.tone}>{meta.label}</Badge>
                        <div className="text-xs text-muted-foreground">Implantação: {row.implementation_owner || "A definir"}</div>
                      </div>
                      <div className="flex items-center justify-between gap-3 lg:justify-end">
                        <div className="text-right">
                          <div className={`text-sm font-semibold ${Number(row.pending_count) ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>
                            {Number(row.pending_count) ? `${row.pending_count} pendência(s)` : "Sem pendências"}
                          </div>
                          <div className="text-xs text-muted-foreground">{row.completion_percent || 0}% completo</div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>
        )}
        <div className="text-xs text-muted-foreground">As pendências de preenchimento não significam reprovação técnica. A aprovação depende do fluxo de análise da implantação.</div>
      </main>
    </div>
  );
}
