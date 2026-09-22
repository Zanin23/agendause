import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Building2,
  Search,
  ArrowUpDown,
  AlertTriangle,
  CalendarClock,
  FileQuestion,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronRight,
  BellRing,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

type ClientRow = {
  scheduleId: string;
  client: string;
  startDate: string;
  scheduleStatus: string;
  total: number;
  done: number;
  overdue: number;
  dueSoon: number;
  worstDelay: number;
  progress: number;
  health: HealthLevel;
  surveyStatus: string;
  surveyAnswered: boolean;
  nextVisit: string | null;
  lastVisit: string | null;
  pendingApprovals: number;
  visits: number;
};

export default function Clients() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { hasScreenPermission, hasSchedulePermission, loading: roleLoading } = usePermissions();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | HealthLevel | "survey" | "approval">("all");
  const [sort, setSort] = useState<"risk" | "name">("risk");

  const load = async () => {
    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [{ data: schedules, error: e1 }, { data: trainings }, { data: surveys }] = await Promise.all([
      supabase
        .from("implementation_schedules")
        .select("id,client_name,start_date,status")
        .order("start_date", { ascending: false }),
      supabase
        .from("trainings")
        .select("id,client,scheduled_at,status,approval_status"),
      supabase.from("process_surveys").select("id,schedule_id,status,submitted_at"),
    ]);
    if (e1) toast.error(e1.message);

    const scheduleList = schedules || [];
    const scheduleIds = scheduleList.map((s) => s.id);

    const { data: phases } = scheduleIds.length
      ? await supabase.from("schedule_phases").select("id,schedule_id").in("schedule_id", scheduleIds)
      : { data: [] as any[] };
    const phaseList = phases || [];
    const phaseIds = phaseList.map((p: any) => p.id);
    const phaseToSchedule = new Map<string, string>(phaseList.map((p: any) => [p.id, p.schedule_id]));

    let items: any[] = [];
    for (let i = 0; i < phaseIds.length; i += 400) {
      const chunk = phaseIds.slice(i, i + 400);
      const { data } = await supabase
        .from("schedule_items")
        .select("phase_id,status,planned_date")
        .in("phase_id", chunk);
      items = items.concat(data || []);
    }

    const built: ClientRow[] = scheduleList.map((s) => {
      const own = items.filter((it) => phaseToSchedule.get(it.phase_id) === s.id);
      const total = own.length;
      const done = own.filter((it) => it.status === "done").length;
      let overdue = 0;
      let dueSoon = 0;
      let worstDelay = 0;
      own.forEach((it) => {
        if (it.status === "done" || it.status === "not_applicable") return;
        const d = parseDateOnly(it.planned_date);
        if (!d) return;
        const diff = daysBetween(today, d);
        if (diff > 0) {
          overdue += 1;
          worstDelay = Math.max(worstDelay, diff);
        } else if (diff >= -7) {
          dueSoon += 1;
        }
      });

      const clientTrainings = (trainings || []).filter(
        (t: any) => (t.client || "").trim().toLowerCase() === s.client_name.trim().toLowerCase()
      );
      const alive = clientTrainings.filter((t: any) => t.status !== "cancelado");
      const future = alive
        .filter((t: any) => new Date(t.scheduled_at) >= today)
        .sort((a: any, b: any) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
      const past = alive
        .filter((t: any) => new Date(t.scheduled_at) < today)
        .sort((a: any, b: any) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at));
      const pendingApprovals = alive.filter((t: any) => t.approval_status === "pending").length;

      const survey = (surveys || []).find((sv: any) => sv.schedule_id === s.id);

      return {
        scheduleId: s.id,
        client: s.client_name,
        startDate: s.start_date,
        scheduleStatus: s.status,
        total,
        done,
        overdue,
        dueSoon,
        worstDelay,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
        health: computeHealth({ scheduleStatus: s.status, total, done, overdue, dueSoon }),
        surveyStatus: survey ? survey.status : "none",
        surveyAnswered: !!survey?.submitted_at,
        nextVisit: future[0]?.scheduled_at ?? null,
        lastVisit: past[0]?.scheduled_at ?? null,
        pendingApprovals,
        visits: alive.length,
      };
    });

    setRows(built);
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user?.id]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows.filter((r) => hasSchedulePermission(r.scheduleId));
    if (q) list = list.filter((r) => r.client.toLowerCase().includes(q));
    if (filter === "survey") list = list.filter((r) => !r.surveyAnswered);
    else if (filter === "approval") list = list.filter((r) => r.pendingApprovals > 0);
    else if (filter !== "all") list = list.filter((r) => r.health === filter);
    return [...list].sort((a, b) => {
      if (sort === "name") return a.client.localeCompare(b.client, "pt-BR");
      const order: Record<HealthLevel, number> = { late: 0, warn: 1, ok: 2, done: 3 };
      if (order[a.health] !== order[b.health]) return order[a.health] - order[b.health];
      return b.worstDelay - a.worstDelay;
    });
  }, [rows, query, filter, sort, hasSchedulePermission]);

  const stats = useMemo(() => {
    const mine = rows.filter((r) => hasSchedulePermission(r.scheduleId));
    const late = mine.filter((r) => r.health === "late");
    const avgDelay = late.length
      ? Math.round(late.reduce((a, r) => a + r.worstDelay, 0) / late.length)
      : 0;
    const weekEnd = new Date();
    weekEnd.setHours(23, 59, 59, 999);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const visitsWeek = mine.filter((r) => r.nextVisit && new Date(r.nextVisit) <= weekEnd).length;
    return {
      total: mine.length,
      late: late.length,
      warn: mine.filter((r) => r.health === "warn").length,
      ok: mine.filter((r) => r.health === "ok").length,
      done: mine.filter((r) => r.health === "done").length,
      avgDelay,
      surveysPending: mine.filter((r) => !r.surveyAnswered).length,
      approvals: mine.reduce((a, r) => a + r.pendingApprovals, 0),
      visitsWeek,
    };
  }, [rows, hasSchedulePermission]);

  if (roleLoading) return <div className="p-8 text-center text-muted-foreground">Carregando permissões…</div>;

  if (!hasScreenPermission("clients") && !hasScreenPermission("schedules")) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="max-w-3xl mx-auto px-4 py-20 text-center">
          <BackButton to="/" />
          <div className="mt-6 p-8 rounded-2xl border border-border bg-card/60">
            <h1 className="text-2xl font-semibold">Acesso restrito</h1>
            <p className="text-muted-foreground mt-2">Você não tem permissão para ver os clientes.</p>
          </div>
        </main>
      </div>
    );
  }

  const StatTile = ({
    label,
    value,
    hint,
    icon: Icon,
    onClick,
    active,
    tone,
  }: {
    label: string;
    value: number | string;
    hint?: string;
    icon: any;
    onClick?: () => void;
    active?: boolean;
    tone?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60 ${
        active ? "border-primary bg-primary/5" : "border-border bg-card/60"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${tone || "text-primary"}`} />
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </button>
  );

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Clientes — TreinaCheck"
        description="Histórico de visitas, levantamentos e saúde dos prazos de implantação por cliente."
        path="/clientes"
      />
      <AppHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <div>
          <BackButton to="/" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-2 flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" /> Clientes
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Quem já agendou, o que respondeu no levantamento e como está a saúde dos prazos.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatTile
            label="Clientes"
            value={stats.total}
            hint="Implantações na base"
            icon={Building2}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <StatTile
            label="Atrasados"
            value={stats.late}
            hint={stats.avgDelay ? `Média ${stats.avgDelay} dias` : "Nenhum atraso"}
            icon={AlertTriangle}
            tone="text-destructive"
            active={filter === "late"}
            onClick={() => setFilter("late")}
          />
          <StatTile
            label="Atenção"
            value={stats.warn}
            hint="Etapas nos próximos 7 dias"
            icon={CalendarClock}
            tone="text-amber-500"
            active={filter === "warn"}
            onClick={() => setFilter("warn")}
          />
          <StatTile
            label="Levantamentos"
            value={stats.surveysPending}
            hint="Ainda sem resposta"
            icon={FileQuestion}
            active={filter === "survey"}
            onClick={() => setFilter("survey")}
          />
          <StatTile
            label="Datas do cliente"
            value={stats.approvals}
            hint="Aguardando aprovação"
            icon={BellRing}
            tone="text-amber-500"
            active={filter === "approval"}
            onClick={() => setFilter("approval")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar empresa…"
              className="pl-9"
            />
          </div>
          {(["all", "late", "warn", "ok", "done"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "Todos" : HEALTH_LABELS[f]}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSort(sort === "risk" ? "name" : "risk")}>
            <ArrowUpDown className="h-4 w-4" /> {sort === "risk" ? "Por risco" : "Por nome"}
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Carregando clientes…
            </CardContent>
          </Card>
        ) : visible.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground/60" />
              <p className="text-muted-foreground">Nenhum cliente encontrado com esse filtro.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {visible.map((r) => (
              <Card
                key={r.scheduleId}
                className="group cursor-pointer hover:border-primary/60 transition-colors"
                onClick={() => navigate(`/clientes/${r.scheduleId}`)}
              >
                <CardContent className="p-4 sm:p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <h3 className="font-semibold break-words flex items-center gap-2">
                        {r.client}
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                      </h3>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        <span>Início: {format(new Date(r.startDate + "T00:00:00"), "d MMM yyyy", { locale: ptBR })}</span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />
                          Próxima:{" "}
                          {r.nextVisit
                            ? format(new Date(r.nextVisit), "d MMM, HH:mm", { locale: ptBR })
                            : "—"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Última:{" "}
                          {r.lastVisit
                            ? format(new Date(r.lastVisit), "d MMM yyyy", { locale: ptBR })
                            : "—"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> {r.visits} visitas
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.pendingApprovals > 0 && (
                        <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                          {r.pendingApprovals} data(s) do cliente
                        </Badge>
                      )}
                      <Badge variant="outline" className={HEALTH_CLASSES[r.health]}>
                        {HEALTH_LABELS[r.health]}
                        {r.health === "late" ? ` · ${r.worstDelay}d` : ""}
                      </Badge>
                      <Badge variant={r.surveyAnswered ? "success" : "outline"}>
                        {SURVEY_STATUS_LABELS[r.surveyStatus] ?? r.surveyStatus}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {r.done}/{r.total} etapas concluídas
                        {r.overdue > 0 && (
                          <span className="text-destructive font-medium"> · {r.overdue} atrasadas</span>
                        )}
                        {r.dueSoon > 0 && (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            {" "}
                            · {r.dueSoon} vencendo
                          </span>
                        )}
                      </span>
                      <span className="font-semibold tabular-nums">{r.progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full transition-all ${HEALTH_BAR[r.health]}`}
                        style={{ width: `${r.progress}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
