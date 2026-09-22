import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Building2,
  Printer,
  Loader2,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Users,
  FileQuestion,
  Network,
  ClipboardList,
  Link2,
  Paperclip,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getVisitType } from "@/lib/visitType";
import { publicUrl } from "@/lib/publicUrl";
import {
  HEALTH_BAR,
  HEALTH_CLASSES,
  HEALTH_LABELS,
  HealthLevel,
  SURVEY_STATUS_LABELS,
  computeHealth,
  daysBetween,
  parseDateOnly,
} from "@/lib/clientHealth";

type Training = {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  visit_type: string;
  approval_status: string;
  requested_by: string | null;
  location: string | null;
  requires_acceptance: boolean;
  signers: number;
};

type Item = {
  id: string;
  title: string;
  status: string;
  planned_date: string | null;
  done_date: string | null;
  notes: string | null;
};

type Phase = { id: string; title: string; position: number; items: Item[] };

const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendada",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<any>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [survey, setSurvey] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [files, setFiles] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data: sched, error } = await supabase
        .from("implementation_schedules")
        .select("id,client_name,client_email,start_date,status,cadence,modality,public_token,accepted_at")
        .eq("id", id)
        .maybeSingle();
      if (error) toast.error(error.message);
      if (!sched) {
        setLoading(false);
        return;
      }
      setSchedule(sched);

      const { data: ph } = await supabase
        .from("schedule_phases")
        .select("id,title,position")
        .eq("schedule_id", id)
        .order("position");
      const phaseIds = (ph || []).map((p) => p.id);
      const { data: its } = phaseIds.length
        ? await supabase
            .from("schedule_items")
            .select("id,phase_id,title,status,planned_date,done_date,notes,position")
            .in("phase_id", phaseIds)
            .order("position")
        : { data: [] as any[] };
      setPhases(
        (ph || []).map((p) => ({
          ...p,
          items: (its || []).filter((it: any) => it.phase_id === p.id),
        }))
      );

      const { data: tr } = await supabase
        .from("trainings")
        .select(
          "id,title,description,scheduled_at,duration_minutes,status,visit_type,approval_status,requested_by,location,requires_acceptance"
        )
        .ilike("client", sched.client_name)
        .order("scheduled_at", { ascending: false });
      const trIds = (tr || []).map((t: any) => t.id);
      let userAcc: any[] = [];
      let guestAcc: any[] = [];
      if (trIds.length) {
        const [a, b] = await Promise.all([
          supabase.from("training_acceptances").select("training_id").in("training_id", trIds),
          supabase.from("guest_acceptances").select("training_id").in("training_id", trIds),
        ]);
        userAcc = a.data || [];
        guestAcc = b.data || [];
      }
      setTrainings(
        (tr || []).map((t: any) => ({
          ...t,
          signers:
            userAcc.filter((x) => x.training_id === t.id).length +
            guestAcc.filter((x) => x.training_id === t.id).length,
        }))
      );

      const { data: sv } = await supabase
        .from("process_surveys")
        .select("id,title,status,respondent_name,respondent_email,submitted_at,public_token")
        .eq("schedule_id", id)
        .maybeSingle();
      setSurvey(sv || null);
      if (sv) {
        const [{ data: qs }, { data: ans }, { data: fs }] = await Promise.all([
          supabase
            .from("survey_questions")
            .select("id,section,position,label,type,options")
            .eq("survey_id", sv.id)
            .order("position"),
          supabase.from("survey_answers").select("question_id,value,value_json").eq("survey_id", sv.id),
          supabase.from("survey_files").select("id,question_id,file_name,file_path").eq("survey_id", sv.id),
        ]);
        setQuestions(qs || []);
        const map: Record<string, any> = {};
        (ans || []).forEach((a: any) => (map[a.question_id] = a));
        setAnswers(map);
        setFiles(fs || []);
      }
      setLoading(false);
    })();
  }, [id]);

  const metrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const items = phases.flatMap((p) => p.items);
    const total = items.length;
    const done = items.filter((i) => i.status === "done").length;
    let overdue = 0;
    let dueSoon = 0;
    let worstDelay = 0;
    items.forEach((i) => {
      if (i.status === "done" || i.status === "not_applicable") return;
      const d = parseDateOnly(i.planned_date);
      if (!d) return;
      const diff = daysBetween(today, d);
      if (diff > 0) {
        overdue += 1;
        worstDelay = Math.max(worstDelay, diff);
      } else if (diff >= -7) dueSoon += 1;
    });
    const alive = trainings.filter((t) => t.status !== "cancelado");
    const minutes = alive.reduce((a, t) => a + (t.duration_minutes || 0), 0);
    const plannedDates = items
      .map((i) => parseDateOnly(i.planned_date))
      .filter(Boolean)
      .sort((a: any, b: any) => +a - +b) as Date[];
    const start = schedule ? parseDateOnly(schedule.start_date) : null;
    const health: HealthLevel = computeHealth({
      scheduleStatus: schedule?.status ?? "active",
      total,
      done,
      overdue,
      dueSoon,
    });
    return {
      total,
      done,
      pending: total - done,
      overdue,
      dueSoon,
      worstDelay,
      progress: total ? Math.round((done / total) * 100) : 0,
      visits: alive.length,
      hours: Math.round((minutes / 60) * 10) / 10,
      daysRunning: start ? Math.max(0, daysBetween(today, start)) : 0,
      forecast: plannedDates.length ? plannedDates[plannedDates.length - 1] : null,
      health,
      pendingApprovals: alive.filter((t) => t.approval_status === "pending").length,
    };
  }, [phases, trainings, schedule]);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    trainings
      .filter((t) => t.status !== "cancelado")
      .forEach((t) => {
        const k = format(new Date(t.scheduled_at), "MMM/yy", { locale: ptBR });
        map.set(k, (map.get(k) || 0) + 1);
      });
    const entries = Array.from(map.entries()).reverse();
    const max = Math.max(1, ...entries.map(([, v]) => v));
    return { entries, max };
  }, [trainings]);

  const byType = useMemo(() => {
    const map = new Map<string, number>();
    trainings
      .filter((t) => t.status !== "cancelado")
      .forEach((t) => map.set(t.visit_type, (map.get(t.visit_type) || 0) + 1));
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0) || 1;
    return { entries: Array.from(map.entries()), total };
  }, [trainings]);

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("survey-files").createSignedUrl(path, 300);
    if (error || !data) return toast.error("Não foi possível abrir o arquivo");
    window.open(data.signedUrl, "_blank");
  };

  const answerText = (q: any) => {
    const a = answers[q.id];
    if (!a) return null;
    if (Array.isArray(a.value_json)) return a.value_json.join(", ");
    if (a.value === "true") return "Sim";
    if (a.value === "false") return "Não";
    return a.value || null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="py-20 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Carregando cliente…
        </div>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="max-w-3xl mx-auto px-4 py-20 text-center">
          <BackButton to="/clientes" />
          <p className="mt-6 text-muted-foreground">Cliente não encontrado.</p>
        </main>
      </div>
    );
  }

  const sections = Array.from(new Set(questions.map((q) => q.section || "Geral")));

  const Metric = ({ label, value, hint, icon: Icon, tone }: any) => (
    <div className="rounded-2xl border border-border bg-card/60 p-4 print:break-inside-avoid">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${tone || "text-primary"}`} />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground print:bg-white print:text-black">
      <SEO
        title={`${schedule.client_name} — Clientes`}
        description={`Histórico de visitas, levantamento e prazos de implantação de ${schedule.client_name}.`}
        path={`/clientes/${schedule.id}`}
      />
      <div className="print:hidden">
        <AppHeader />
      </div>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
        <div className="print:hidden">
          <BackButton to="/clientes" />
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <Building2 className="h-7 w-7 text-primary print:hidden" /> {schedule.client_name}
            </h1>
            <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4">
              <span>
                Início: {format(new Date(schedule.start_date + "T00:00:00"), "d MMM yyyy", { locale: ptBR })}
              </span>
              <span>Cadência: {schedule.cadence}</span>
              <span>Modalidade: {schedule.modality}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Badge variant="outline" className={HEALTH_CLASSES[metrics.health]}>
              {HEALTH_LABELS[metrics.health]}
              {metrics.health === "late" ? ` · ${metrics.worstDelay} dias` : ""}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimir / PDF
            </Button>
          </div>
        </div>

        {/* RESUMO */}
        <section className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric label="Visitas" value={metrics.visits} hint={`${metrics.hours}h de treinamento`} icon={Users} />
            <Metric
              label="Etapas concluídas"
              value={`${metrics.done}/${metrics.total}`}
              hint={`${metrics.progress}% do cronograma`}
              icon={CheckCircle2}
            />
            <Metric
              label="Atrasadas"
              value={metrics.overdue}
              hint={metrics.overdue ? `Maior atraso: ${metrics.worstDelay} dias` : "Nenhuma etapa atrasada"}
              icon={AlertTriangle}
              tone="text-destructive"
            />
            <Metric
              label="Dias de implantação"
              value={metrics.daysRunning}
              hint={
                metrics.forecast
                  ? `Previsão de término: ${format(metrics.forecast, "d MMM yyyy", { locale: ptBR })}`
                  : "Sem datas previstas"
              }
              icon={Clock}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardContent className="p-4 sm:p-5">
                <h3 className="text-sm font-semibold mb-4">Visitas por mês</h3>
                {byMonth.entries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma visita registrada.</p>
                ) : (
                  <div className="flex items-end gap-2 h-36">
                    {byMonth.entries.map(([k, v]) => (
                      <div key={k} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs font-semibold tabular-nums">{v}</span>
                        <div
                          className="w-full rounded-t-md bg-primary/80 transition-all"
                          style={{ height: `${(v / byMonth.max) * 100}%`, minHeight: 4 }}
                        />
                        <span className="text-[10px] text-muted-foreground">{k}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-5">
                <h3 className="text-sm font-semibold mb-4">Tipos de visita</h3>
                {byType.entries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma visita registrada.</p>
                ) : (
                  <div className="space-y-3">
                    {byType.entries.map(([type, v]) => {
                      const vt = getVisitType(type);
                      const pct = Math.round((v / byType.total) * 100);
                      return (
                        <div key={type} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="inline-flex items-center gap-1.5">
                              <vt.icon className="h-3.5 w-3.5" style={{ color: vt.color }} /> {vt.short}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {v} · {pct}%
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: vt.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* HISTÓRICO DE VISITAS */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary print:hidden" /> Histórico de visitas
          </h2>
          {trainings.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma visita registrada para este cliente.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {trainings.map((t) => {
                const vt = getVisitType(t.visit_type);
                const pending = t.approval_status === "pending" && t.status !== "cancelado";
                return (
                  <Card
                    key={t.id}
                    className={`cursor-pointer transition-colors hover:border-primary/60 print:break-inside-avoid ${
                      pending ? "border-amber-500/60 bg-amber-500/5" : ""
                    }`}
                    onClick={() => navigate(`/treinamento/${t.id}`)}
                  >
                    <CardContent className="p-4 flex gap-3">
                      <div className="w-1.5 rounded-full shrink-0" style={{ background: vt.color }} />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="font-medium break-words">{t.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                              <span>
                                {format(new Date(t.scheduled_at), "EEE, d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                              </span>
                              <span>{t.duration_minutes} min</span>
                              <span className="inline-flex items-center gap-1">
                                <vt.icon className="h-3 w-3" style={{ color: vt.color }} /> {vt.short}
                              </span>
                              {t.location && <span>{t.location}</span>}
                              <span className="inline-flex items-center gap-1">
                                <Users className="h-3 w-3" /> {t.signers} assinatura(s)
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {pending && (
                              <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                                Data pedida{t.requested_by ? ` por ${t.requested_by}` : " pelo cliente"}
                              </Badge>
                            )}
                            <Badge
                              variant={
                                t.status === "concluido"
                                  ? "success"
                                  : t.status === "cancelado"
                                  ? "destructive"
                                  : "outline"
                              }
                            >
                              {STATUS_LABEL[t.status] ?? t.status}
                            </Badge>
                          </div>
                        </div>
                        {t.description && (
                          <p className="text-sm text-muted-foreground whitespace-pre-line border-l-2 border-border pl-3 mt-2">
                            {t.description}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* LEVANTAMENTO */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileQuestion className="h-5 w-5 text-primary print:hidden" /> Levantamento de processos
          </h2>
          {!survey ? (
            <Card>
              <CardContent className="py-8 text-center space-y-2 text-sm text-muted-foreground">
                Nenhum levantamento criado para este cliente.
                <div className="print:hidden">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/cronogramas/${schedule.id}`)}>
                    Abrir cronograma para criar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4 sm:p-5 space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-medium">{survey.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4">
                      <span>Respondido por: {survey.respondent_name || "—"}</span>
                      <span>{survey.respondent_email || ""}</span>
                      <span>
                        Finalizado em:{" "}
                        {survey.submitted_at
                          ? format(new Date(survey.submitted_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })
                          : "—"}
                      </span>
                      <span>
                        {Object.keys(answers).length}/{questions.length} respostas · {files.length} arquivo(s)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={survey.submitted_at ? "success" : "outline"}>
                      {SURVEY_STATUS_LABELS[survey.status] ?? survey.status}
                    </Badge>
                    {survey.submitted_at && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="print:hidden"
                        onClick={() => navigate(`/levantamentos/${survey.id}/relatorio`)}
                      >
                        Relatório completo <ChevronRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {sections.map((sec) => (
                  <div key={sec} className="space-y-2">
                    <h4 className="text-xs uppercase tracking-wider text-primary font-semibold">{sec}</h4>
                    <div className="grid gap-2">
                      {questions
                        .filter((q) => (q.section || "Geral") === sec)
                        .map((q) => {
                          const txt = answerText(q);
                          const qFiles = files.filter((f) => f.question_id === q.id);
                          return (
                            <div
                              key={q.id}
                              className="rounded-xl border border-border bg-muted/20 p-3 print:break-inside-avoid"
                            >
                              <div className="text-sm font-medium">{q.label}</div>
                              <div className="text-sm mt-1">
                                {txt ? (
                                  <span className="whitespace-pre-line">{txt}</span>
                                ) : (
                                  <span className="text-muted-foreground">Sem resposta</span>
                                )}
                              </div>
                              {qFiles.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {qFiles.map((f) => (
                                    <Button
                                      key={f.id}
                                      variant="link"
                                      size="sm"
                                      className="h-auto p-0 text-xs"
                                      onClick={() => openFile(f.file_path)}
                                    >
                                      <Paperclip className="h-3 w-3" /> {f.file_name}
                                    </Button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>

        {/* CRONOGRAMA */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary print:hidden" /> Cronograma
            </h2>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button variant="outline" size="sm" onClick={() => navigate(`/cronogramas/${schedule.id}`)}>
                <ClipboardList className="h-4 w-4" /> Editar
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(`/cronogramas/${schedule.id}/visualizar`)}>
                <Network className="h-4 w-4" /> Organograma
              </Button>
              {schedule.public_token && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(publicUrl(`/c/${schedule.public_token}`));
                    toast.success("Link do cliente copiado");
                  }}
                >
                  <Link2 className="h-4 w-4" /> Link do cliente
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {metrics.done}/{metrics.total} etapas · {metrics.overdue} atrasadas · {metrics.dueSoon} vencendo
              </span>
              <span className="font-semibold tabular-nums">{metrics.progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className={`h-full ${HEALTH_BAR[metrics.health]}`} style={{ width: `${metrics.progress}%` }} />
            </div>
          </div>

          <div className="grid gap-2">
            {phases.map((p) => {
              const total = p.items.length;
              const done = p.items.filter((i) => i.status === "done").length;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              return (
                <Card key={p.id} className="print:break-inside-avoid">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-sm">
                        {p.position}. {p.title}
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {done}/{total}
                      </span>
                    </div>
                    <div className="grid gap-1">
                      {p.items.map((it) => {
                        const d = parseDateOnly(it.planned_date);
                        const late = it.status !== "done" && d && daysBetween(today, d) > 0;
                        return (
                          <div
                            key={it.id}
                            className={`flex items-center justify-between gap-3 text-xs rounded-lg px-2 py-1.5 ${
                              late ? "bg-destructive/10 text-destructive" : "text-muted-foreground"
                            }`}
                          >
                            <span className="truncate">{it.title}</span>
                            <span className="shrink-0 tabular-nums">
                              {it.status === "done"
                                ? `Concluída ${
                                    it.done_date
                                      ? format(parseDateOnly(it.done_date)!, "dd/MM/yyyy")
                                      : ""
                                  }`
                                : d
                                ? `Previsto ${format(d, "dd/MM/yyyy")}`
                                : "Sem data"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
