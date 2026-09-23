import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  RefreshCw, Printer, Download, Filter, X, Save, FolderOpen, Copy, Trash2, Loader2,
  Building2, ListChecks, CalendarRange, GraduationCap, Code2, AlertCircle, Users, FileText,
  ChevronRight, TrendingUp, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import Clients from "@/pages/Clients";

/* ---------- types ---------- */
type Schedule = { id: string; client_name: string; start_date: string; status: string; use_team: string[] | null; modality: string };
type Phase = { id: string; schedule_id: string; title: string };
type Item = { id: string; phase_id: string; title: string; status: string; assignee: string | null; planned_date: string | null; done_date: string | null; training_id: string | null; notes: string | null };
type Training = { id: string; title: string; client: string | null; scheduled_at: string; status: string; visit_type: string; requires_acceptance: boolean; duration_minutes: number; created_by: string };
type Billing = { id: string; number: string; client: string; title: string; status: string; created_at: string; week_start: string; delivered_at: string | null };
type Accept = { training_id: string; accepted_at: string };

type Activity = Item & {
  client: string; scheduleId: string; module: string; state: "done" | "late" | "progress" | "pending" | "cancelled";
  delay: number;
};

type Filters = {
  client: string; project: string; responsible: string; module: string; projectStatus: string;
  activityStatus: string; from: string; to: string; visitType: string; trainingStatus: string; devStatus: string;
};
const EMPTY: Filters = { client: "", project: "", responsible: "", module: "", projectStatus: "", activityStatus: "", from: "", to: "", visitType: "", trainingStatus: "", devStatus: "" };

type Tab = "geral" | "implantacoes" | "cronograma" | "atividades" | "treinamentos" | "desenvolvimento" | "pendencias" | "responsaveis" | "executivo";
const TABS: { id: Tab; label: string }[] = [
  { id: "geral", label: "Visão Geral" }, { id: "implantacoes", label: "Implantações" }, { id: "cronograma", label: "Cronograma" },
  { id: "atividades", label: "Atividades" }, { id: "treinamentos", label: "Treinamentos" }, { id: "desenvolvimento", label: "Desenvolvimento" },
  { id: "pendencias", label: "Pendências" }, { id: "responsaveis", label: "Responsáveis" }, { id: "executivo", label: "Executivo" },
];

type Saved = { id: string; name: string; tab: Tab; filters: Filters; createdAt: string };
const SAVED_KEY = "treinacheck.savedReports";

/* ---------- helpers ---------- */
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const pd = (s: string | null) => (s ? new Date(s.slice(0, 10) + "T00:00:00") : null);
const diffDays = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);
const fmt = (s: string | null) => (s ? format(pd(s)!, "dd/MM/yyyy") : "—");
const fmtDT = (s: string) => format(new Date(s), "dd/MM/yyyy HH:mm");
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

const STATE_LABEL: Record<Activity["state"], string> = { done: "Concluída", late: "Atrasada", progress: "Em andamento", pending: "Pendente", cancelled: "Cancelada" };
const STATE_CLS: Record<Activity["state"], string> = {
  done: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
  late: "bg-destructive/10 text-destructive border-destructive/30",
  progress: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  pending: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border line-through",
};
type ProjHealth = "ok" | "warn" | "late" | "idle" | "done";
const PH_LABEL: Record<ProjHealth, string> = { ok: "Dentro do prazo", warn: "Atenção", late: "Em atraso", idle: "Não iniciada", done: "Concluída" };
const PH_BAR: Record<ProjHealth, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", late: "bg-destructive", idle: "bg-slate-400", done: "bg-sky-500" };
const PH_CLS: Record<ProjHealth, string> = {
  ok: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  late: "bg-destructive/10 text-destructive border-destructive/30",
  idle: "bg-muted text-muted-foreground border-border",
  done: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
};
const TR_LABEL: Record<string, string> = { agendado: "Agendado", concluido: "Realizado", cancelado: "Cancelado", reagendado: "Reagendado" };
const DEV_LABEL: Record<string, string> = { pending: "Aberta", delivered: "Concluída", rescheduled: "Reprogramada", cancelled: "Cancelada" };
const VT_LABEL: Record<string, string> = { presencial: "Presencial", interno: "Ajuste interno", remoto: "Remoto" };

function downloadCSV(name: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "\uFEFF" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${name}-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- main ---------- */
export default function ManagementReports() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [billing, setBilling] = useState<Billing[]>([]);
  const [accepts, setAccepts] = useState<Accept[]>([]);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [f, setF] = useState<Filters>(EMPTY);
  const [tab, setTab] = useState<Tab>("geral");
  const [showFilters, setShowFilters] = useState(true);
  const [lateBucket, setLateBucket] = useState<"all" | "0" | "1-7" | "8-15" | "16-30" | "30+">("all");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [chronoView, setChronoView] = useState<"grafico" | "tabela" | "projeto">("grafico");
  const [saved, setSaved] = useState<Saved[]>(() => { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch { return []; } });
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, p, i, t, b, a] = await Promise.all([
      supabase.from("implementation_schedules").select("id,client_name,start_date,status,use_team,modality"),
      supabase.from("schedule_phases").select("id,schedule_id,title"),
      supabase.from("schedule_items").select("id,phase_id,title,status,assignee,planned_date,done_date,training_id,notes").limit(10000),
      supabase.from("trainings").select("id,title,client,scheduled_at,status,visit_type,requires_acceptance,duration_minutes,created_by").limit(5000),
      supabase.from("billing_requests").select("id,number,client,title,status,created_at,week_start,delivered_at").limit(5000),
      supabase.from("training_acceptances").select("training_id,accepted_at").limit(10000),
    ]);
    if (s.error || i.error || t.error) toast.error("Não foi possível carregar alguns dados.");
    setSchedules((s.data as Schedule[]) || []);
    setPhases((p.data as Phase[]) || []);
    setItems((i.data as Item[]) || []);
    setTrainings((t.data as Training[]) || []);
    setBilling((b.data as Billing[]) || []);
    setAccepts((a.data as Accept[]) || []);
    setUpdatedAt(new Date());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  /* ---- derived base data ---- */
  const today = today0();
  const phaseMap = useMemo(() => new Map(phases.map((p) => [p.id, p])), [phases]);
  const schedMap = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules]);

  const activities: Activity[] = useMemo(() => items.flatMap((it) => {
    const ph = phaseMap.get(it.phase_id); if (!ph) return [];
    const sc = schedMap.get(ph.schedule_id); if (!sc) return [];
    const planned = pd(it.planned_date);
    let state: Activity["state"];
    if (it.status === "done") state = "done";
    else if (it.status === "not_applicable") state = "cancelled";
    else if (planned && planned < today) state = "late";
    else if (it.status === "in_progress") state = "progress";
    else state = "pending";
    const end = it.status === "done" ? pd(it.done_date) ?? today : today;
    const delay = planned && state !== "cancelled" ? Math.max(0, diffDays(end, planned)) : 0;
    return [{ ...it, client: sc.client_name, scheduleId: sc.id, module: ph.title, state, delay }];
  }), [items, phaseMap, schedMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const acceptSet = useMemo(() => {
    const m = new Map<string, string>(); accepts.forEach((a) => { if (!m.has(a.training_id)) m.set(a.training_id, a.accepted_at); }); return m;
  }, [accepts]);

  const projHealth = useCallback((scId: string): { h: ProjHealth; progress: number; total: number; done: number; late: number } => {
    const acts = activities.filter((a) => a.scheduleId === scId && a.state !== "cancelled");
    const done = acts.filter((a) => a.state === "done").length;
    const late = acts.filter((a) => a.state === "late").length;
    const progress = pct(done, acts.length);
    let h: ProjHealth;
    if (acts.length && done === acts.length) h = "done";
    else if (done === 0 && !acts.some((a) => a.state === "progress")) h = late ? "late" : "idle";
    else if (late >= 3 || acts.some((a) => a.delay > 15)) h = "late";
    else if (late > 0) h = "warn";
    else h = "ok";
    return { h, progress, total: acts.length, done, late };
  }, [activities]);

  /* ---- filter option lists ---- */
  const opts = useMemo(() => ({
    clients: [...new Set([...schedules.map((s) => s.client_name), ...trainings.map((t) => t.client || "").filter(Boolean)])].sort(),
    responsibles: [...new Set([...items.map((i) => i.assignee || "").filter(Boolean), ...schedules.flatMap((s) => s.use_team || [])])].sort(),
    modules: [...new Set(phases.map((p) => p.title))].sort(),
  }), [schedules, trainings, items, phases]);

  /* ---- filtered data ---- */
  const inPeriod = useCallback((d: string | null) => {
    if (!f.from && !f.to) return true; if (!d) return false;
    const x = d.slice(0, 10); return (!f.from || x >= f.from) && (!f.to || x <= f.to);
  }, [f.from, f.to]);
  const clientMatch = useCallback((c: string | null) => !f.client || norm(c || "") === norm(f.client), [f.client]);

  const fSchedules = useMemo(() => schedules.filter((s) =>
    clientMatch(s.client_name) && (!f.project || s.id === f.project) &&
    (!f.projectStatus || projHealth(s.id).h === f.projectStatus) &&
    (!f.responsible || (s.use_team || []).includes(f.responsible) || activities.some((a) => a.scheduleId === s.id && a.assignee === f.responsible))
  ), [schedules, f, clientMatch, projHealth, activities]);
  const fSchedIds = useMemo(() => new Set(fSchedules.map((s) => s.id)), [fSchedules]);

  const fActs = useMemo(() => activities.filter((a) =>
    fSchedIds.has(a.scheduleId) && (!f.module || a.module === f.module) && (!f.responsible || a.assignee === f.responsible) &&
    (!f.activityStatus || a.state === f.activityStatus) && inPeriod(a.planned_date)
  ), [activities, fSchedIds, f, inPeriod]);

  const fTrainings = useMemo(() => trainings.filter((t) =>
    clientMatch(t.client) && (!f.project || norm(t.client || "") === norm(schedMap.get(f.project)?.client_name || "")) &&
    (!f.visitType || t.visit_type === f.visitType) && (!f.trainingStatus || t.status === f.trainingStatus) && inPeriod(t.scheduled_at)
  ), [trainings, f, clientMatch, inPeriod, schedMap]);

  const devDue = (b: Billing) => { const d = pd(b.week_start)!; d.setDate(d.getDate() + 6); return d; };
  const fBilling = useMemo(() => billing.filter((b) =>
    clientMatch(b.client) && (!f.project || norm(b.client) === norm(schedMap.get(f.project)?.client_name || "")) &&
    (!f.devStatus || b.status === f.devStatus) && inPeriod(b.created_at)
  ), [billing, f, clientMatch, inPeriod, schedMap]);

  const valid = fActs.filter((a) => a.state !== "cancelled");
  const lateActs = valid.filter((a) => a.state === "late").sort((a, b) => b.delay - a.delay);
  const pendencias = valid.filter((a) => a.state !== "done");
  const projStats = fSchedules.map((s) => ({ s, ...projHealth(s.id) }));
  const trDone = fTrainings.filter((t) => t.status === "concluido");
  const trNoSign = trDone.filter((t) => t.requires_acceptance && !acceptSet.has(t.id));
  const devOpen = fBilling.filter((b) => b.status === "pending");
  const devLate = devOpen.filter((b) => devDue(b) < today);

  const pendOwner = (a: Activity): string => {
    const s = norm(a.assignee || "");
    if (!s) return "Outros";
    if (/client|cliente/.test(s)) return "Cliente";
    if (/dev|desenv|programa/.test(s)) return "Desenvolvimento";
    if (/consult/.test(s)) return "Consultoria";
    return "Implantação";
  };

  const apply = () => { setF(draft); };
  const clear = () => { setDraft(EMPTY); setF(EMPTY); setLateBucket("all"); setOnlyOverdue(false); };
  const quick = (patch: Partial<Filters>, t?: Tab) => { const n = { ...f, ...patch }; setDraft(n); setF(n); if (t) setTab(t); };

  /* ---- saved reports ---- */
  const persist = (list: Saved[]) => { setSaved(list); localStorage.setItem(SAVED_KEY, JSON.stringify(list)); };
  const saveReport = () => {
    const name = window.prompt("Nome do relatório", `${TABS.find((t) => t.id === tab)?.label} — ${format(new Date(), "MMMM/yyyy", { locale: ptBR })}`);
    if (!name) return;
    persist([{ id: crypto.randomUUID(), name, tab, filters: f, createdAt: new Date().toISOString() }, ...saved]);
    toast.success("Relatório salvo");
  };
  const openReport = (r: Saved) => { setDraft(r.filters); setF(r.filters); setTab(r.tab); toast.success(`Aberto: ${r.name}`); };

  /* ---- export ---- */
  const exportExcel = () => {
    const tag = TABS.find((t) => t.id === tab)!.label.toLowerCase().replace(/\s/g, "-");
    if (tab === "treinamentos") return downloadCSV(`treinamentos`, ["Cliente", "Treinamento", "Tipo", "Data", "Status", "Exige aceite", "Assinatura", "Data assinatura"],
      fTrainings.map((t) => [t.client || "", t.title, VT_LABEL[t.visit_type] || t.visit_type, fmtDT(t.scheduled_at), TR_LABEL[t.status] || t.status, t.requires_acceptance ? "Sim" : "Não", acceptSet.has(t.id) ? "Assinado" : t.requires_acceptance ? "Pendente" : "—", acceptSet.get(t.id) ? fmtDT(acceptSet.get(t.id)!) : ""]));
    if (tab === "desenvolvimento") return downloadCSV(`solicitacoes`, ["Número", "Cliente", "Solicitação", "Data", "Prazo", "Status", "Dias em aberto"],
      fBilling.map((b) => [b.number, b.client, b.title, fmt(b.created_at), format(devDue(b), "dd/MM/yyyy"), DEV_LABEL[b.status] || b.status, b.status === "pending" ? diffDays(today, pd(b.created_at)!) : ""]));
    if (tab === "geral" || tab === "implantacoes" || tab === "executivo" || tab === "responsaveis") return downloadCSV(`implantacoes`, ["Cliente", "Início", "Equipe", "Atividades", "Concluídas", "Atrasadas", "% conclusão", "Situação"],
      projStats.map((p) => [p.s.client_name, fmt(p.s.start_date), (p.s.use_team || []).join(", "), p.total, p.done, p.late, p.progress + "%", PH_LABEL[p.h]]));
    const src = tab === "atividades" ? lateActs : tab === "pendencias" ? pendencias : fActs;
    downloadCSV(tag, ["Cliente", "Módulo/Etapa", "Atividade", "Responsável", "Data prevista", "Data realizada", "Status", "Dias de atraso"],
      src.map((a) => [a.client, a.module, a.title, a.assignee || "", fmt(a.planned_date), fmt(a.done_date), STATE_LABEL[a.state], a.delay]));
  };

  const filterSummary = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}: ${k === "project" ? schedMap.get(v)?.client_name : v}`).join(" · ");

  /* ---------- render ---------- */
  return (
    <div className="space-y-6 mgmt-report">
      {/* print header */}
      <div className="hidden print:block border-b border-border pb-3 mb-4">
        <div className="text-lg font-semibold">TreinaCheck · Use Sistemas — Relatório: {TABS.find((t) => t.id === tab)?.label}</div>
        <div className="text-xs text-muted-foreground">Gerado em {format(new Date(), "dd/MM/yyyy HH:mm")} · Filtros: {filterSummary || "nenhum"}</div>
      </div>

      {/* header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Relatórios</h2>
          <p className="text-sm text-muted-foreground mt-1">Acompanhe o andamento das implantações, atividades, treinamentos e pendências.</p>
          {updatedAt && <p className="text-[11px] text-muted-foreground mt-1">Atualizado às {format(updatedAt, "HH:mm")}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />Atualizar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><FolderOpen className="h-4 w-4 mr-1.5" />Salvos ({saved.length})</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem onClick={saveReport}><Save className="h-4 w-4 mr-2" />Salvar relatório atual</DropdownMenuItem>
              {saved.length > 0 && <DropdownMenuSeparator />}
              {saved.map((r) => (
                <div key={r.id} className="flex items-center gap-1 px-2 py-1.5 text-sm">
                  <button className="flex-1 text-left truncate hover:text-primary" onClick={() => openReport(r)}>{r.name}</button>
                  <button title="Renomear" className="p-1 text-muted-foreground hover:text-foreground" onClick={() => { const n = window.prompt("Novo nome", r.name); if (n) persist(saved.map((x) => x.id === r.id ? { ...x, name: n, filters: f, tab } : x)); }}><FileText className="h-3.5 w-3.5" /></button>
                  <button title="Duplicar" className="p-1 text-muted-foreground hover:text-foreground" onClick={() => persist([{ ...r, id: crypto.randomUUID(), name: r.name + " (cópia)" }, ...saved])}><Copy className="h-3.5 w-3.5" /></button>
                  <button title="Excluir" className="p-1 text-muted-foreground hover:text-destructive" onClick={() => { if (window.confirm(`Excluir o relatório salvo "${r.name}"?`)) persist(saved.filter((x) => x.id !== r.id)); }}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm"><Download className="h-4 w-4 mr-1.5" />Exportar relatório</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => window.print()}><FileText className="h-4 w-4 mr-2" />PDF (formatado)</DropdownMenuItem>
              <DropdownMenuItem onClick={exportExcel}><Download className="h-4 w-4 mr-2" />Excel (dados filtrados)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Imprimir</Button>
        </div>
      </div>

      {/* filters */}
      <div className="rounded-xl border border-border bg-card/60 print:hidden">
        <button onClick={() => setShowFilters((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium">
          <span className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" />Filtros {filterSummary && <Badge variant="secondary" className="font-normal">{Object.values(f).filter(Boolean).length} ativos</Badge>}</span>
          <span className="text-xs text-muted-foreground">{showFilters ? "Ocultar" : "Mostrar"}</span>
        </button>
        {showFilters && (
          <div className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Sel label="Cliente" value={draft.client} onChange={(v) => setDraft({ ...draft, client: v })} options={opts.clients.map((c) => [c, c])} />
              <Sel label="Projeto / Implantação" value={draft.project} onChange={(v) => setDraft({ ...draft, project: v })} options={schedules.map((s) => [s.id, `${s.client_name} · ${fmt(s.start_date)}`])} />
              <Sel label="Responsável / Consultor" value={draft.responsible} onChange={(v) => setDraft({ ...draft, responsible: v })} options={opts.responsibles.map((c) => [c, c])} />
              <Sel label="Módulo (etapa)" value={draft.module} onChange={(v) => setDraft({ ...draft, module: v })} options={opts.modules.map((c) => [c, c])} />
              <Sel label="Status do projeto" value={draft.projectStatus} onChange={(v) => setDraft({ ...draft, projectStatus: v })} options={Object.entries(PH_LABEL)} />
              <Sel label="Status das atividades" value={draft.activityStatus} onChange={(v) => setDraft({ ...draft, activityStatus: v })} options={Object.entries(STATE_LABEL)} />
              <label className="text-xs text-muted-foreground space-y-1"><span>Período inicial</span><Input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="h-9" /></label>
              <label className="text-xs text-muted-foreground space-y-1"><span>Período final</span><Input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="h-9" /></label>
              <Sel label="Tipo de atividade" value={draft.visitType} onChange={(v) => setDraft({ ...draft, visitType: v })} options={Object.entries(VT_LABEL)} />
              <Sel label="Situação do treinamento" value={draft.trainingStatus} onChange={(v) => setDraft({ ...draft, trainingStatus: v })} options={Object.entries(TR_LABEL)} />
              <Sel label="Situação das solicitações" value={draft.devStatus} onChange={(v) => setDraft({ ...draft, devStatus: v })} options={Object.entries(DEV_LABEL)} />
              <div className="flex items-end gap-2">
                <Button size="sm" className="flex-1" onClick={apply}>Aplicar</Button>
                <Button size="sm" variant="ghost" onClick={clear}><X className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border print:hidden -mx-1 px-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {tab === "geral" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                <Kpi icon={Building2} title="Implantações" big={projStats.length} rows={[
                  ["Em andamento", projStats.filter((p) => p.h === "ok" || p.h === "warn").length, () => quick({ projectStatus: "ok" }, "implantacoes")],
                  ["Concluídas", projStats.filter((p) => p.h === "done").length, () => quick({ projectStatus: "done" }, "implantacoes")],
                  ["Em atraso", projStats.filter((p) => p.h === "late").length, () => quick({ projectStatus: "late" }, "implantacoes"), "bad"],
                  ["Não iniciadas", projStats.filter((p) => p.h === "idle").length, () => quick({ projectStatus: "idle" }, "implantacoes")],
                ]} />
                <Kpi icon={ListChecks} title="Atividades" big={valid.length} rows={[
                  ["Concluídas", valid.filter((a) => a.state === "done").length, () => quick({ activityStatus: "done" }, "cronograma")],
                  ["Em andamento", valid.filter((a) => a.state === "progress").length, () => quick({ activityStatus: "progress" }, "cronograma")],
                  ["Pendentes", valid.filter((a) => a.state === "pending").length, () => quick({ activityStatus: "pending" }, "cronograma")],
                  ["Atrasadas", lateActs.length, () => setTab("atividades"), "bad"],
                ]} />
                <Kpi icon={CalendarRange} title="Cronograma" big={`${pct(valid.filter((a) => a.state === "done").length, valid.length)}%`} sub="cumprimento médio" trend={lateActs.length ? "down" : "up"} rows={[
                  ["Previstas no período", valid.filter((a) => a.planned_date).length],
                  ["Concluídas", valid.filter((a) => a.state === "done").length],
                  ["Atrasadas", lateActs.length, () => setTab("atividades"), "bad"],
                  ["Concluídas no prazo", valid.filter((a) => a.state === "done" && a.delay === 0).length],
                ]} />
                <Kpi icon={GraduationCap} title="Treinamentos" big={fTrainings.length} rows={[
                  ["Planejados", fTrainings.filter((t) => t.status !== "concluido" && t.status !== "cancelado").length, () => quick({ trainingStatus: "agendado" }, "treinamentos")],
                  ["Realizados", trDone.length, () => quick({ trainingStatus: "concluido" }, "treinamentos")],
                  ["Cancelados", fTrainings.filter((t) => t.status === "cancelado").length, () => quick({ trainingStatus: "cancelado" }, "treinamentos")],
                  ["Sem assinatura", trNoSign.length, () => quick({ trainingStatus: "concluido" }, "treinamentos"), "bad"],
                ]} />
                <Kpi icon={Code2} title="Desenvolvimento" big={fBilling.length} sub="solicitações" rows={[
                  ["Abertas", devOpen.length, () => quick({ devStatus: "pending" }, "desenvolvimento")],
                  ["Concluídas", fBilling.filter((b) => b.status === "delivered").length, () => quick({ devStatus: "delivered" }, "desenvolvimento")],
                  ["Reprogramadas", fBilling.filter((b) => b.status === "rescheduled").length],
                  ["Atrasadas", devLate.length, () => quick({ devStatus: "pending" }, "desenvolvimento"), "bad"],
                ]} />
                <Kpi icon={AlertCircle} title="Pendências" big={pendencias.length} rows={[
                  ["Internas (implantação)", pendencias.filter((a) => pendOwner(a) === "Implantação").length, () => setTab("pendencias")],
                  ["Do cliente", pendencias.filter((a) => pendOwner(a) === "Cliente").length, () => setTab("pendencias")],
                  ["Do desenvolvimento", pendencias.filter((a) => pendOwner(a) === "Desenvolvimento").length, () => setTab("pendencias")],
                  ["Vencidas", lateActs.length, () => { setOnlyOverdue(true); setTab("pendencias"); }, "bad"],
                ]} />
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <Panel title="Implantações por situação">
                  <Donut data={(Object.keys(PH_LABEL) as ProjHealth[]).map((h) => ({ label: PH_LABEL[h], value: projStats.filter((p) => p.h === h).length, cls: PH_BAR[h], onClick: () => quick({ projectStatus: h }, "implantacoes") }))} />
                </Panel>
                <Panel title="Atividades por status">
                  <Donut data={(["done", "progress", "pending", "late"] as const).map((s) => ({ label: STATE_LABEL[s], value: valid.filter((a) => a.state === s).length, cls: { done: "bg-sky-500", progress: "bg-amber-500", pending: "bg-slate-400", late: "bg-destructive" }[s], onClick: () => s === "late" ? setTab("atividades") : quick({ activityStatus: s }, "cronograma") }))} />
                </Panel>
              </div>
              <Panel title="Andamento das implantações">
                <ProjectBars stats={projStats} onOpen={(id) => navigate(`/clientes/${id}`)} />
              </Panel>
            </div>
          )}

          {tab === "implantacoes" && (
            <div className="space-y-6">
              <Panel title="Andamento das implantações"><ProjectBars stats={projStats} onOpen={(id) => navigate(`/clientes/${id}`)} /></Panel>
              <Clients embedded />
            </div>
          )}

          {tab === "cronograma" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Mini label="Previstas" value={valid.length} />
                <Mini label="Realizadas" value={valid.filter((a) => a.state === "done").length} tone="info" />
                <Mini label="Atrasadas" value={lateActs.length} tone="bad" onClick={() => setTab("atividades")} />
                <Mini label="Futuras" value={valid.filter((a) => a.state !== "done" && pd(a.planned_date) && pd(a.planned_date)! >= today).length} />
              </div>
              <Seg<typeof chronoView> value={chronoView} onChange={setChronoView} options={[["grafico", "Gráfico"], ["tabela", "Tabela"], ["projeto", "Por projeto"]]} />
              {chronoView === "grafico" && (
                <div className="grid lg:grid-cols-2 gap-4">
                  <Panel title="Planejado x Realizado (por mês)"><PlanVsDone acts={valid} /></Panel>
                  <Panel title="Evolução acumulada da implantação"><Evolution acts={valid} /></Panel>
                </div>
              )}
              {chronoView === "tabela" && <ActTable acts={fActs} />}
              {chronoView === "projeto" && (
                <div className="space-y-3">
                  {projStats.map((p) => (
                    <Panel key={p.s.id} title={`${p.s.client_name} — ${p.progress}%`}>
                      <ActTable acts={fActs.filter((a) => a.scheduleId === p.s.id)} compact />
                    </Panel>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "atividades" && (
            <div className="space-y-4">
              <Panel title="Atividades atrasadas por período">
                <HBars data={(["0", "1-7", "8-15", "16-30", "30+"] as const).map((k) => ({
                  label: k === "0" ? "Hoje" : k === "30+" ? "Mais de 30 dias" : `${k} dias`,
                  value: lateActs.filter((a) => bucketOf(a.delay) === k).length, cls: "bg-destructive", onClick: () => setLateBucket(k),
                }))} />
              </Panel>
              <Seg<typeof lateBucket> value={lateBucket} onChange={setLateBucket} options={[["all", "Todas"], ["0", "Hoje"], ["1-7", "1–7 dias"], ["8-15", "8–15 dias"], ["16-30", "16–30 dias"], ["30+", "+30 dias"]]} />
              <ActTable acts={lateActs.filter((a) => lateBucket === "all" || bucketOf(a.delay) === lateBucket)} showPriority />
            </div>
          )}

          {tab === "treinamentos" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                <Mini label="Total" value={fTrainings.length} />
                <Mini label="Agendados" value={fTrainings.filter((t) => !["concluido", "cancelado"].includes(t.status)).length} />
                <Mini label="Realizados" value={trDone.length} tone="info" />
                <Mini label="Cancelados" value={fTrainings.filter((t) => t.status === "cancelado").length} />
                <Mini label="Pendentes" value={fTrainings.filter((t) => !["concluido", "cancelado"].includes(t.status) && new Date(t.scheduled_at) < new Date()).length} tone="warn" />
                <Mini label="Com assinatura" value={trDone.filter((t) => acceptSet.has(t.id)).length} tone="good" />
                <Mini label="Sem assinatura" value={trNoSign.length} tone="bad" />
              </div>
              <Panel title="Treinamentos realizados por mês"><MonthBars dates={trDone.map((t) => t.scheduled_at)} /></Panel>
              <TableWrap head={["Cliente", "Treinamento", "Tipo", "Data", "Duração", "Status", "Assinatura", "Data assinatura"]}>
                {fTrainings.sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)).map((t) => {
                  const missing = t.status === "concluido" && t.requires_acceptance && !acceptSet.has(t.id);
                  return (
                    <tr key={t.id} onClick={() => navigate(`/treinamento/${t.id}`)} className={`cursor-pointer hover:bg-muted/40 ${missing ? "bg-destructive/5" : ""}`}>
                      <td className="px-3 py-2">{t.client || "—"}</td><td className="px-3 py-2 font-medium">{t.title}</td>
                      <td className="px-3 py-2">{VT_LABEL[t.visit_type] || t.visit_type}</td><td className="px-3 py-2 tabular-nums">{fmtDT(t.scheduled_at)}</td>
                      <td className="px-3 py-2 tabular-nums">{t.duration_minutes} min</td>
                      <td className="px-3 py-2"><Badge variant="outline">{TR_LABEL[t.status] || t.status}</Badge></td>
                      <td className="px-3 py-2">{!t.requires_acceptance ? <span className="text-muted-foreground">Não exige</span> : acceptSet.has(t.id) ? <Badge variant="outline" className={PH_CLS.ok}>Assinado</Badge> : <Badge variant="outline" className={PH_CLS.late}>Pendente</Badge>}</td>
                      <td className="px-3 py-2 tabular-nums">{acceptSet.get(t.id) ? fmtDT(acceptSet.get(t.id)!) : "—"}</td>
                    </tr>
                  );
                })}
              </TableWrap>
            </div>
          )}

          {tab === "desenvolvimento" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Baseado nas Solicitações a cobrar. Prazo = fim da semana da solicitação.</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Mini label="Total" value={fBilling.length} />
                <Mini label="Abertas" value={devOpen.length} tone="warn" onClick={() => quick({ devStatus: "pending" })} />
                <Mini label="Concluídas" value={fBilling.filter((b) => b.status === "delivered").length} tone="good" onClick={() => quick({ devStatus: "delivered" })} />
                <Mini label="Reprogramadas" value={fBilling.filter((b) => b.status === "rescheduled").length} onClick={() => quick({ devStatus: "rescheduled" })} />
                <Mini label="Atrasadas" value={devLate.length} tone="bad" />
              </div>
              <Panel title="Distribuição por status">
                <HBars data={Object.entries(DEV_LABEL).map(([k, l]) => ({ label: l, value: fBilling.filter((b) => b.status === k).length, cls: k === "delivered" ? "bg-emerald-500" : k === "pending" ? "bg-amber-500" : "bg-slate-400", onClick: () => quick({ devStatus: k }) }))} />
              </Panel>
              <TableWrap head={["Nº", "Cliente", "Solicitação", "Data", "Prazo", "Status", "Dias em aberto"]}>
                {fBilling.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((b) => {
                  const late = b.status === "pending" && devDue(b) < today;
                  return (
                    <tr key={b.id} className={late ? "bg-destructive/5" : ""}>
                      <td className="px-3 py-2 tabular-nums font-medium">{b.number}</td><td className="px-3 py-2">{b.client}</td><td className="px-3 py-2">{b.title}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(b.created_at)}</td><td className={`px-3 py-2 tabular-nums ${late ? "text-destructive font-medium" : ""}`}>{format(devDue(b), "dd/MM/yyyy")}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{DEV_LABEL[b.status] || b.status}</Badge></td>
                      <td className="px-3 py-2 tabular-nums">{b.status === "pending" ? diffDays(today, pd(b.created_at)!) : "—"}</td>
                    </tr>
                  );
                })}
              </TableWrap>
            </div>
          )}

          {tab === "pendencias" && (() => {
            const list = pendencias.filter((a) => !onlyOverdue || a.state === "late");
            const owners = ["Cliente", "Consultoria", "Desenvolvimento", "Implantação", "Outros"];
            return (
              <div className="space-y-4">
                <div className="grid lg:grid-cols-2 gap-4">
                  <Panel title="Pendências por responsável"><HBars data={owners.map((o) => ({ label: o, value: list.filter((a) => pendOwner(a) === o).length, cls: "bg-primary" }))} /></Panel>
                  <Panel title="Pendências por status"><HBars data={(["late", "progress", "pending"] as const).map((s) => ({ label: STATE_LABEL[s], value: list.filter((a) => a.state === s).length, cls: s === "late" ? "bg-destructive" : s === "progress" ? "bg-amber-500" : "bg-slate-400", onClick: () => quick({ activityStatus: s }) }))} /></Panel>
                </div>
                <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} className="accent-primary" />Somente vencidas</label>
                <ActTable acts={list} showPriority />
              </div>
            );
          })()}

          {tab === "responsaveis" && (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {fSchedules.map((s) => {
                const byMod = new Map<string, Set<string>>();
                activities.filter((a) => a.scheduleId === s.id && a.assignee).forEach((a) => { if (!byMod.has(a.module)) byMod.set(a.module, new Set()); byMod.get(a.module)!.add(a.assignee!); });
                return (
                  <div key={s.id} className="rounded-xl border border-border bg-card/60 p-4">
                    <div className="text-center">
                      <div className="inline-block rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-semibold">{s.client_name}</div>
                      <div className="mx-auto h-4 w-px bg-border" />
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {(s.use_team || []).length ? s.use_team!.map((m) => <span key={m} className="rounded-md border border-border bg-background px-2 py-1 text-xs">{m}</span>) : <span className="text-xs text-muted-foreground">Equipe não definida</span>}
                      </div>
                    </div>
                    {byMod.size > 0 && (
                      <div className="mt-4 border-t border-border pt-3 space-y-1.5">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Responsáveis por módulo</div>
                        {[...byMod].map(([m, set]) => (
                          <div key={m} className="flex justify-between gap-2 text-xs"><span className="text-muted-foreground truncate">{m}</span><span className="font-medium text-right">{[...set].join(", ")}</span></div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <Panel title="Desempenho operacional por responsável" className="md:col-span-2 xl:col-span-3">
                <TableWrap head={["Responsável", "Projetos", "Atribuídas", "Concluídas", "Pendentes", "Atrasadas", "% concluído"]}>
                  {opts.responsibles.map((r) => {
                    const a = valid.filter((x) => x.assignee === r);
                    const proj = new Set([...a.map((x) => x.scheduleId), ...fSchedules.filter((s) => (s.use_team || []).includes(r)).map((s) => s.id)]);
                    const d = a.filter((x) => x.state === "done").length;
                    return (
                      <tr key={r} className="hover:bg-muted/40 cursor-pointer" onClick={() => quick({ responsible: r }, "cronograma")}>
                        <td className="px-3 py-2 font-medium">{r}</td><td className="px-3 py-2 tabular-nums">{proj.size}</td><td className="px-3 py-2 tabular-nums">{a.length}</td>
                        <td className="px-3 py-2 tabular-nums">{d}</td><td className="px-3 py-2 tabular-nums">{a.length - d}</td>
                        <td className="px-3 py-2 tabular-nums text-destructive">{a.filter((x) => x.state === "late").length}</td><td className="px-3 py-2 tabular-nums">{pct(d, a.length)}%</td>
                      </tr>
                    );
                  })}
                </TableWrap>
              </Panel>
            </div>
          )}

          {tab === "executivo" && <Executive stats={projStats} acts={valid} trainings={fTrainings} trNoSign={trNoSign} devOpen={devOpen} devLate={devLate} />}
        </>
      )}
    </div>
  );
}

const bucketOf = (d: number) => (d === 0 ? "0" : d <= 7 ? "1-7" : d <= 15 ? "8-15" : d <= 30 ? "16-30" : "30+");
const priorityOf = (d: number) => (d > 15 ? ["Alta", "late"] : d > 7 ? ["Média", "warn"] : ["Baixa", "idle"]) as [string, ProjHealth];

/* ---------- executive ---------- */
function Executive({ stats, acts, trainings, trNoSign, devOpen, devLate }: {
  stats: { s: Schedule; h: ProjHealth; progress: number; total: number; done: number; late: number }[];
  acts: Activity[]; trainings: Training[]; trNoSign: Training[]; devOpen: Billing[]; devLate: Billing[];
}) {
  const done = acts.filter((a) => a.state === "done").length;
  const late = acts.filter((a) => a.state === "late");
  const overall: ProjHealth = !acts.length ? "idle" : done === acts.length ? "done" : late.length >= 3 ? "late" : late.length ? "warn" : "ok";
  const next = acts.filter((a) => a.state !== "done" && a.state !== "late" && a.planned_date).sort((a, b) => a.planned_date!.localeCompare(b.planned_date!)).slice(0, 8);
  const points = [
    late.length && `${late.length} atividade(s) estão atrasadas`,
    stats.filter((s) => s.h === "late").length && `${stats.filter((s) => s.h === "late").length} implantação(ões) em atraso`,
    trNoSign.length && `${trNoSign.length} treinamento(s) realizados estão sem assinatura`,
    devLate.length && `${devLate.length} solicitação(ões) ultrapassaram o prazo`,
    late.filter((a) => /client|cliente/i.test(a.assignee || "")).length && `${late.filter((a) => /client|cliente/i.test(a.assignee || "")).length} pendência(s) do cliente estão vencidas`,
  ].filter(Boolean) as string[];
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/60 p-5 flex flex-col md:flex-row md:items-center gap-5">
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Status geral</div>
          <div className="flex items-center gap-3 mt-1"><span className="text-4xl font-semibold tabular-nums">{pct(done, acts.length)}%</span><Badge variant="outline" className={PH_CLS[overall]}>{PH_LABEL[overall]}</Badge></div>
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full ${PH_BAR[overall]}`} style={{ width: `${pct(done, acts.length)}%` }} /></div>
          <p className="text-xs text-muted-foreground mt-2">{stats.length === 1 ? stats[0].s.client_name : `${stats.length} implantações no filtro atual`}</p>
        </div>
        <div className="grid grid-cols-3 gap-3 md:w-[420px]">
          <Mini label="Concluídas" value={done} tone="info" /><Mini label="Pendentes" value={acts.length - done} /><Mini label="Atrasadas" value={late.length} tone="bad" />
          <Mini label="Treinamentos realizados" value={trainings.filter((t) => t.status === "concluido").length} /><Mini label="Pendências abertas" value={acts.length - done} /><Mini label="Solicitações abertas" value={devOpen.length} />
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Pontos de atenção">
          {points.length ? <ul className="space-y-2">{points.map((p) => <li key={p} className="flex gap-2 text-sm"><AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />{p}</li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhum ponto crítico no filtro atual.</p>}
        </Panel>
        <Panel title="Próximos passos">
          {next.length ? <ul className="divide-y divide-border">{next.map((a) => (
            <li key={a.id} className="py-2 flex justify-between gap-3 text-sm"><span className="min-w-0"><span className="font-medium">{a.title}</span><span className="block text-xs text-muted-foreground truncate">{a.client} · {a.module}{a.assignee ? ` · ${a.assignee}` : ""}</span></span><span className="tabular-nums text-xs text-muted-foreground shrink-0">{fmt(a.planned_date)}</span></li>
          ))}</ul> : <p className="text-sm text-muted-foreground">Sem atividades futuras previstas.</p>}
        </Panel>
      </div>
      <Panel title="Andamento por implantação"><ProjectBars stats={stats} /></Panel>
    </div>
  );
}

/* ---------- ui pieces ---------- */
function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="text-xs text-muted-foreground space-y-1 min-w-0">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
        <option value="">Todos</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Kpi({ icon: Icon, title, big, sub, rows, trend }: {
  icon: React.ComponentType<{ className?: string }>; title: string; big: number | string; sub?: string; trend?: "up" | "down";
  rows: [string, number, (() => void)?, "bad"?][];
}) {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium"><span className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Icon className="h-4 w-4" /></span>{title}</div>
        {trend && (trend === "up" ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : <TrendingDown className="h-4 w-4 text-destructive" />)}
      </div>
      <div className="mt-3 flex items-baseline gap-2"><span className="text-3xl font-semibold tabular-nums tracking-tight">{big}</span><span className="text-xs text-muted-foreground">{sub ?? "total"}</span></div>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {rows.map(([l, v, on, tone]) => (
          <button key={l} disabled={!on} onClick={on}
            className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-left transition-colors ${on ? "hover:bg-muted" : "cursor-default"} ${tone === "bad" && v > 0 ? "text-destructive" : "text-muted-foreground"}`}>
            <span className="truncate">{l}</span><span className="font-semibold tabular-nums text-foreground ml-2">{v}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Mini({ label, value, tone, onClick }: { label: string; value: number; tone?: "bad" | "good" | "warn" | "info"; onClick?: () => void }) {
  const c = tone === "bad" ? "text-destructive" : tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : tone === "info" ? "text-sky-600 dark:text-sky-400" : "text-foreground";
  return (
    <button onClick={onClick} disabled={!onClick} className={`rounded-lg border border-border bg-card/60 p-3 text-left ${onClick ? "hover:border-primary/40" : "cursor-default"}`}>
      <div className={`text-2xl font-semibold tabular-nums ${c}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{label}</div>
    </button>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-card/60 p-4 break-inside-avoid ${className}`}>
      <h3 className="text-sm font-semibold mb-3">{title}</h3>{children}
    </section>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-border p-0.5 bg-card/60 print:hidden">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={`px-3 py-1.5 text-xs rounded-md ${value === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
      ))}
    </div>
  );
}

function TableWrap({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border overflow-x-auto bg-card/60">
      <table className="w-full text-sm min-w-[720px]">
        <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{head.map((h) => <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

function ActTable({ acts, showPriority, compact }: { acts: Activity[]; showPriority?: boolean; compact?: boolean }) {
  const navigate = useNavigate();
  const head = ["Cliente", "Módulo/Etapa", "Atividade", "Responsável", "Prevista", "Realizada", "Status", "Atraso", ...(showPriority ? ["Prioridade"] : [])];
  if (!acts.length) return <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma atividade encontrada.</p>;
  const list = compact ? acts : acts.slice(0, 500);
  return (
    <TableWrap head={compact ? head.slice(1) : head}>
      {list.map((a) => {
        const [pl, pt] = priorityOf(a.delay);
        return (
          <tr key={a.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => navigate(`/cronogramas/${a.scheduleId}`)}>
            {!compact && <td className="px-3 py-2 whitespace-nowrap">{a.client}</td>}
            <td className="px-3 py-2 text-muted-foreground">{a.module}</td><td className="px-3 py-2 font-medium">{a.title}</td>
            <td className="px-3 py-2">{a.assignee || "—"}</td><td className="px-3 py-2 tabular-nums">{fmt(a.planned_date)}</td><td className="px-3 py-2 tabular-nums">{fmt(a.done_date)}</td>
            <td className="px-3 py-2"><Badge variant="outline" className={STATE_CLS[a.state]}>{STATE_LABEL[a.state]}</Badge></td>
            <td className={`px-3 py-2 tabular-nums ${a.delay ? "text-destructive font-medium" : "text-muted-foreground"}`}>{a.delay ? `${a.delay} d` : "—"}</td>
            {showPriority && <td className="px-3 py-2"><Badge variant="outline" className={PH_CLS[pt]}>{pl}</Badge></td>}
          </tr>
        );
      })}
    </TableWrap>
  );
}

function ProjectBars({ stats, onOpen }: { stats: { s: Schedule; h: ProjHealth; progress: number; total: number; done: number; late: number }[]; onOpen?: (id: string) => void }) {
  if (!stats.length) return <p className="text-sm text-muted-foreground">Nenhuma implantação no filtro.</p>;
  return (
    <div className="space-y-2.5">
      {[...stats].sort((a, b) => b.late - a.late || a.progress - b.progress).map((p) => (
        <button key={p.s.id} onClick={() => onOpen?.(p.s.id)} className="w-full grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[200px_minmax(0,1fr)_auto] items-center gap-3 text-left group">
          <span className="text-sm font-medium truncate group-hover:text-primary">{p.s.client_name}</span>
          <Tooltip><TooltipTrigger asChild>
            <span className="hidden sm:block h-2.5 rounded-full bg-muted overflow-hidden"><span className={`block h-full ${PH_BAR[p.h]}`} style={{ width: `${Math.max(p.progress, 2)}%` }} /></span>
          </TooltipTrigger><TooltipContent>{p.done}/{p.total} concluídas · {p.late} atrasadas</TooltipContent></Tooltip>
          <span className="flex items-center gap-2"><span className="text-sm tabular-nums w-10 text-right">{p.progress}%</span><Badge variant="outline" className={`${PH_CLS[p.h]} hidden md:inline-flex`}>{PH_LABEL[p.h]}</Badge>{onOpen && <ChevronRight className="h-4 w-4 text-muted-foreground print:hidden" />}</span>
        </button>
      ))}
    </div>
  );
}

function HBars({ data }: { data: { label: string; value: number; cls: string; onClick?: () => void }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <Tooltip key={d.label}><TooltipTrigger asChild>
          <button onClick={d.onClick} disabled={!d.onClick} className="w-full grid grid-cols-[120px_minmax(0,1fr)_40px] items-center gap-2 text-left text-xs group">
            <span className="text-muted-foreground truncate group-hover:text-foreground">{d.label}</span>
            <span className="h-5 rounded bg-muted/60 overflow-hidden"><span className={`block h-full ${d.cls} transition-all group-hover:opacity-80`} style={{ width: `${(d.value / max) * 100}%` }} /></span>
            <span className="tabular-nums text-right font-medium">{d.value}</span>
          </button>
        </TooltipTrigger><TooltipContent>{d.label}: {d.value}{d.onClick ? " · clique para filtrar" : ""}</TooltipContent></Tooltip>
      ))}
    </div>
  );
}

function Donut({ data }: { data: { label: string; value: number; cls: string; onClick?: () => void }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const COLORS: Record<string, string> = { "bg-emerald-500": "stroke-emerald-500", "bg-amber-500": "stroke-amber-500", "bg-destructive": "stroke-destructive", "bg-sky-500": "stroke-sky-500", "bg-slate-400": "stroke-slate-400" };
  let acc = 0;
  const r = 40, c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" className="stroke-muted" strokeWidth="14" />
        {total > 0 && data.map((d) => {
          const len = (d.value / total) * c; const off = acc; acc += len;
          return d.value ? <circle key={d.label} cx="50" cy="50" r={r} fill="none" strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} className={`${COLORS[d.cls] || "stroke-primary"} cursor-pointer hover:opacity-80`} onClick={d.onClick}><title>{`${d.label}: ${d.value}`}</title></circle> : null;
        })}
      </svg>
      <div className="flex-1 space-y-1.5">
        {data.map((d) => (
          <button key={d.label} onClick={d.onClick} className="w-full flex items-center justify-between text-xs hover:text-primary">
            <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-sm ${d.cls}`} />{d.label}</span>
            <span className="tabular-nums font-medium">{d.value} <span className="text-muted-foreground">({pct(d.value, total)}%)</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}

function monthKeys(dates: string[]) {
  const ks = [...new Set(dates.map((d) => d.slice(0, 7)))].sort();
  return ks.slice(-12);
}
function MonthBars({ dates }: { dates: string[] }) {
  const ks = monthKeys(dates);
  if (!ks.length) return <p className="text-sm text-muted-foreground">Sem dados no período.</p>;
  const counts = ks.map((k) => dates.filter((d) => d.startsWith(k)).length);
  const max = Math.max(1, ...counts);
  return (
    <div className="flex items-end gap-2 h-40">
      {ks.map((k, i) => (
        <Tooltip key={k}><TooltipTrigger asChild>
          <div className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            <span className="text-[10px] tabular-nums">{counts[i]}</span>
            <div className="w-full rounded-t bg-primary hover:opacity-80" style={{ height: `${(counts[i] / max) * 100}%` }} />
            <span className="text-[10px] text-muted-foreground">{format(new Date(k + "-01T00:00:00"), "MMM/yy", { locale: ptBR })}</span>
          </div>
        </TooltipTrigger><TooltipContent>{counts[i]} em {format(new Date(k + "-01T00:00:00"), "MMMM yyyy", { locale: ptBR })}</TooltipContent></Tooltip>
      ))}
    </div>
  );
}
function PlanVsDone({ acts }: { acts: Activity[] }) {
  const ks = monthKeys([...acts.map((a) => a.planned_date || "").filter(Boolean), ...acts.map((a) => a.done_date || "").filter(Boolean)]);
  if (!ks.length) return <p className="text-sm text-muted-foreground">Sem datas previstas.</p>;
  const plan = ks.map((k) => acts.filter((a) => a.planned_date?.startsWith(k)).length);
  const done = ks.map((k) => acts.filter((a) => a.state === "done" && a.done_date?.startsWith(k)).length);
  const max = Math.max(1, ...plan, ...done);
  return (
    <div>
      <div className="flex items-end gap-2 h-40">
        {ks.map((k, i) => (
          <Tooltip key={k}><TooltipTrigger asChild>
            <div className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <div className="w-full flex items-end gap-0.5 h-full">
                <div className="flex-1 rounded-t bg-slate-400" style={{ height: `${(plan[i] / max) * 100}%` }} />
                <div className="flex-1 rounded-t bg-primary" style={{ height: `${(done[i] / max) * 100}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground">{format(new Date(k + "-01T00:00:00"), "MMM/yy", { locale: ptBR })}</span>
            </div>
          </TooltipTrigger><TooltipContent>Planejado {plan[i]} · Realizado {done[i]}</TooltipContent></Tooltip>
        ))}
      </div>
      <div className="flex gap-4 mt-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-400" />Planejado</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />Realizado</span></div>
    </div>
  );
}
function Evolution({ acts }: { acts: Activity[] }) {
  const ks = monthKeys(acts.map((a) => a.planned_date || "").filter(Boolean));
  if (!ks.length || !acts.length) return <p className="text-sm text-muted-foreground">Sem dados.</p>;
  const n = acts.length;
  const planned = ks.map((k) => acts.filter((a) => a.planned_date && a.planned_date.slice(0, 7) <= k).length / n * 100);
  const real = ks.map((k) => acts.filter((a) => a.state === "done" && (a.done_date || "").slice(0, 7) <= k && a.done_date).length / n * 100);
  const W = 300, H = 120, x = (i: number) => (ks.length === 1 ? W / 2 : (i / (ks.length - 1)) * W), y = (v: number) => H - (v / 100) * H;
  const path = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return (
    <div>
      <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} className="w-full h-40">
        {[0, 50, 100].map((g) => <line key={g} x1="0" x2={W} y1={y(g)} y2={y(g)} className="stroke-border" strokeDasharray="3 3" />)}
        <path d={path(planned)} fill="none" className="stroke-muted-foreground" strokeWidth="2" strokeDasharray="4 3" />
        <path d={path(real)} fill="none" className="stroke-primary" strokeWidth="2.5" />
        {real.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.5" className="fill-primary"><title>{`${ks[i]}: realizado ${Math.round(v)}% · planejado ${Math.round(planned[i])}%`}</title></circle>)}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">{ks.map((k) => <span key={k}>{format(new Date(k + "-01T00:00:00"), "MMM/yy", { locale: ptBR })}</span>)}</div>
    </div>
  );
}
