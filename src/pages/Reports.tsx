import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addDays, addWeeks, endOfWeek, format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FileText,
  Users,
  Search,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarX2,
  CalendarClock,
  CheckCircle2,
  TrendingUp,
  Building2,
  Copy,
  Printer,
  AlertTriangle,
  Filter,
  X as XIcon,
  ArrowUp,
  ArrowDown,
  Minus,
  FileCheck2,
} from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type TrainingRow = {
  id: string;
  title: string;
  client: string | null;
  scheduled_at: string;
  location: string | null;
  status: string;
  user_count: number;
  guest_count: number;
};

const Reports = () => {
  const [rows, setRows] = useState<TrainingRow[]>([]);
  const [query, setQuery] = useState("");
  const [filterClient, setFilterClient] = useState<string>("__all__");
  const [filterStatus, setFilterStatus] = useState<"all" | "agendado" | "cancelado" | "concluido">("all");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<Date>(() => {
    // default to last week's Monday
    const thisMon = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addWeeks(thisMon, -1);
  });
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  const [comparison, setComparison] = useState<any | null>(null);
  // Date range for AI report (defaults: last full week Mon–Sun)
  const [rangeStart, setRangeStart] = useState<string>(() => {
    const thisMon = startOfWeek(new Date(), { weekStartsOn: 1 });
    return format(addWeeks(thisMon, -1), "yyyy-MM-dd");
  });
  const [rangeEnd, setRangeEnd] = useState<string>(() => {
    const thisMon = startOfWeek(new Date(), { weekStartsOn: 1 });
    return format(addDays(addWeeks(thisMon, -1), 6), "yyyy-MM-dd");
  });

  useEffect(() => {
    (async () => {
      const [{ data: trainings }, { data: ua }, { data: ga }] = await Promise.all([
        supabase.from("trainings").select("id, title, client, scheduled_at, location, status").order("scheduled_at", { ascending: false }),
        supabase.from("training_acceptances").select("training_id"),
        supabase.from("guest_acceptances").select("training_id"),
      ]);

      const userMap = new Map<string, number>();
      ((ua as any[]) || []).forEach((r) => userMap.set(r.training_id, (userMap.get(r.training_id) || 0) + 1));
      const guestMap = new Map<string, number>();
      ((ga as any[]) || []).forEach((r) => guestMap.set(r.training_id, (guestMap.get(r.training_id) || 0) + 1));

      setRows(
        ((trainings as any[]) || []).map((t) => ({
          ...t,
          user_count: userMap.get(t.id) || 0,
          guest_count: guestMap.get(t.id) || 0,
        }))
      );
      setLoading(false);
    })();
  }, []);

  const distinctClients = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const c = (r.client || "").trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const activeFilterCount =
    (filterClient !== "__all__" ? 1 : 0) +
    (filterStatus !== "all" ? 1 : 0) +
    (filterLocation.trim() ? 1 : 0) +
    (filterFrom ? 1 : 0) +
    (filterTo ? 1 : 0);

  const filtered = rows.filter((r) => {
    const q = query.toLowerCase().trim();
    if (q) {
      const inText =
        r.title.toLowerCase().includes(q) ||
        (r.client || "").toLowerCase().includes(q) ||
        (r.location || "").toLowerCase().includes(q);
      if (!inText) return false;
    }
    if (filterClient !== "__all__" && (r.client || "") !== filterClient) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterLocation.trim() && !(r.location || "").toLowerCase().includes(filterLocation.toLowerCase().trim())) return false;
    const ts = new Date(r.scheduled_at).getTime();
    if (filterFrom) {
      const f = new Date(filterFrom + "T00:00:00").getTime();
      if (ts < f) return false;
    }
    if (filterTo) {
      const t = new Date(filterTo + "T23:59:59").getTime();
      if (ts > t) return false;
    }
    return true;
  });

  const summary = useMemo(() => {
    const total = filtered.length;
    let withAcc = 0;
    let participants = 0;
    let upcoming = 0;
    const now = Date.now();
    filtered.forEach((t) => {
      const a = t.user_count + t.guest_count;
      participants += a;
      if (a > 0) withAcc += 1;
      if (new Date(t.scheduled_at).getTime() >= now && t.status !== "cancelado") upcoming += 1;
    });
    return { total, withAcc, without: total - withAcc, participants, upcoming };
  }, [filtered]);

  // Group by year-month for visual hierarchy
  const grouped = useMemo(() => {
    const map = new Map<string, TrainingRow[]>();
    filtered.forEach((t) => {
      const d = new Date(t.scheduled_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries()).map(([key, items]) => {
      const [y, m] = key.split("-").map(Number);
      return { key, date: new Date(y, m, 1), items };
    });
  }, [filtered]);

  const clearFilters = () => {
    setQuery("");
    setFilterClient("__all__");
    setFilterStatus("all");
    setFilterLocation("");
    setFilterFrom("");
    setFilterTo("");
  };

  const rangeStartDate = useMemo(() => new Date(rangeStart + "T00:00:00"), [rangeStart]);
  const rangeEndDate = useMemo(() => new Date(rangeEnd + "T00:00:00"), [rangeEnd]);
  const periodDays = Math.max(
    1,
    Math.round((rangeEndDate.getTime() - rangeStartDate.getTime()) / (24 * 60 * 60 * 1000)) + 1
  );
  const rangeLabel = `${format(rangeStartDate, "d MMM", { locale: ptBR })} – ${format(rangeEndDate, "d MMM yyyy", { locale: ptBR })}`;

  const generateReport = async () => {
    if (rangeEndDate.getTime() < rangeStartDate.getTime()) {
      toast({ title: "Intervalo inválido", description: "A data final deve ser igual ou posterior à inicial.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    setReport(null);
    setStats(null);
    setComparison(null);
    try {
      const { data, error } = await supabase.functions.invoke("weekly-report", {
        body: { start_date: rangeStart, end_date: rangeEnd },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setReport((data as any).report);
      setStats((data as any).stats);
      setComparison((data as any).comparison ?? null);
    } catch (e: any) {
      toast({ title: "Erro ao gerar relatório", description: e.message || String(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Relatórios de aceite — TreinaCheck"
        description="Veja quantos participantes confirmaram cada treinamento e imprima os termos de aceite."
        path="/relatorios"
      />
      <AppHeader />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div className="min-w-0">
            <BackButton to="/" />
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-2 flex items-center gap-2">
              <FileCheck2 className="h-7 w-7 text-primary" /> Relatórios de aceite
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">Veja quantos participantes confirmaram cada treinamento e imprima os termos.</p>
          </div>
        </div>

        <WeeklyAIReport
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          setRangeStart={setRangeStart}
          setRangeEnd={setRangeEnd}
          rangeLabel={rangeLabel}
          periodDays={periodDays}
          generating={generating}
          report={report}
          stats={stats}
          comparison={comparison}
          onGenerate={generateReport}
        />

        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por título, cliente ou local..."
                className="pl-9"
              />
            </div>
            <Button
              variant={filtersOpen || activeFilterCount > 0 ? "secondary" : "outline"}
              size="sm"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <Filter className="h-4 w-4" /> Filtros
              {activeFilterCount > 0 && (
                <Badge variant="default" className="ml-1 h-5 px-1.5 text-[10px]">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
            {(activeFilterCount > 0 || query) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <XIcon className="h-3.5 w-3.5" /> Limpar
              </Button>
            )}
          </div>

          {filtersOpen && (
            <div className="rounded-lg border bg-muted/20 p-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Cliente</label>
                <select
                  value={filterClient}
                  onChange={(e) => setFilterClient(e.target.value)}
                  className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
                >
                  <option value="__all__">Todos os clientes</option>
                  {distinctClients.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
                >
                  <option value="all">Todos</option>
                  <option value="agendado">Agendado</option>
                  <option value="cancelado">Cancelado</option>
                  <option value="concluido">Concluído</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Local contém</label>
                <Input
                  value={filterLocation}
                  onChange={(e) => setFilterLocation(e.target.value)}
                  placeholder="Ex: matriz, online..."
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">De</label>
                <Input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Até</label>
                <Input
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="flex items-end justify-end text-xs text-muted-foreground">
                {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              Nenhum treinamento encontrado.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <SummaryStat label="Treinamentos" value={summary.total} icon={<CalendarClock className="h-4 w-4" />} />
              <SummaryStat label="Com aceite" value={summary.withAcc} icon={<CheckCircle2 className="h-4 w-4" />} accent />
              <SummaryStat label="Sem aceite" value={summary.without} icon={<AlertTriangle className="h-4 w-4" />} muted />
              <SummaryStat label="Participantes" value={summary.participants} icon={<Users className="h-4 w-4" />} />
            </div>

            <div className="space-y-8">
              {grouped.map((g) => (
                <section key={g.key} className="space-y-2">
                  <div className="flex items-baseline gap-3 px-1">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground capitalize">
                      {format(g.date, "MMMM 'de' yyyy", { locale: ptBR })}
                    </h2>
                    <div className="h-px flex-1 bg-border/60" aria-hidden />
                    <span className="text-[11px] text-muted-foreground">{g.items.length}</span>
                  </div>
                  <Card className="overflow-hidden">
                    <ul className="divide-y divide-border/60">
                      {g.items.map((t) => {
                        const total = t.user_count + t.guest_count;
                        const hasAcc = total > 0;
                        const date = new Date(t.scheduled_at);
                        return (
                          <li
                            key={t.id}
                            className={`group relative flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 transition-colors ${
                              hasAcc ? "hover:bg-primary/5" : "hover:bg-muted/40"
                            }`}
                          >
                            {/* Date chip */}
                            <div
                              className={`shrink-0 w-12 sm:w-14 rounded-xl border text-center py-1.5 ${
                                hasAcc
                                  ? "border-primary/40 bg-primary/10 text-primary"
                                  : "border-border bg-muted/40 text-muted-foreground"
                              }`}
                            >
                              <div className="text-[9px] uppercase tracking-widest font-semibold leading-none">
                                {format(date, "MMM", { locale: ptBR })}
                              </div>
                              <div className="text-lg sm:text-xl font-bold leading-tight mt-0.5">
                                {format(date, "d")}
                              </div>
                              <div className="text-[9px] uppercase tracking-widest text-muted-foreground leading-none">
                                {format(date, "EEE", { locale: ptBR })}
                              </div>
                            </div>

                            {/* Title + meta */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-medium truncate">{t.title}</h3>
                                {t.client && (
                                  <Badge variant="secondary" className="text-[10px] font-normal">
                                    {t.client}
                                  </Badge>
                                )}
                                {t.status === "cancelado" && (
                                  <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                                    Cancelado
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2.5 flex-wrap mt-1">
                                <span className="inline-flex items-center gap-1">
                                  <CalendarClock className="h-3 w-3" />
                                  {format(date, "HH:mm")}
                                </span>
                                {t.location && (
                                  <span className="inline-flex items-center gap-1 truncate max-w-[160px] sm:max-w-none">
                                    <Building2 className="h-3 w-3" /> {t.location}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Aceite badge */}
                            <div
                              className={`hidden sm:flex shrink-0 flex-col items-center justify-center min-w-[56px] rounded-lg px-2 py-1.5 border ${
                                hasAcc
                                  ? "border-primary/30 bg-primary/5 text-primary"
                                  : "border-dashed border-border text-muted-foreground/70"
                              }`}
                              title={`${total} aceite${total === 1 ? "" : "s"}`}
                            >
                              <Users className="h-3 w-3" />
                              <span className="text-sm font-semibold leading-none mt-1">{total}</span>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                              <Link to={`/treinamento/${t.id}`} aria-label="Detalhes">
                                <Button variant="ghost" size="sm" className="h-9 px-2 sm:px-3">
                                  <span className="hidden sm:inline">Detalhes</span>
                                  <ChevronRight className="h-4 w-4 sm:hidden" />
                                </Button>
                              </Link>
                              <Link to={`/treinamento/${t.id}/termo`} aria-label="Termo">
                                <Button
                                  variant={hasAcc ? "default" : "outline"}
                                  size="sm"
                                  className="h-9 px-2 sm:px-3"
                                >
                                  <FileText className="h-4 w-4" />
                                  <span className="hidden sm:inline">Termo</span>
                                </Button>
                              </Link>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

const SummaryStat = ({
  label,
  value,
  icon,
  accent,
  muted,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: boolean;
  muted?: boolean;
}) => (
  <Card
    className={`overflow-hidden ${
      accent ? "border-primary/30 bg-primary/5" : muted ? "bg-muted/30" : ""
    }`}
  >
    <CardContent className="p-3 sm:p-4 flex items-center gap-3">
      <div
        className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
          accent
            ? "bg-primary/15 text-primary"
            : muted
            ? "bg-muted text-muted-foreground"
            : "bg-primary/10 text-primary"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xl sm:text-2xl font-semibold leading-none tracking-tight">{value}</div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
      </div>
    </CardContent>
  </Card>
);

type WeeklyStats = {
  total_visits: number;
  cancelled_count: number;
  concluded_count: number;
  scheduled_count: number;
  confirmation_rate_pct: number;
  confirmed_trainings: number;
  total_acceptances: number;
  top_clients: { name: string; count: number }[];
  cancellations: { title: string; client: string | null; reason: string | null; date: string }[];
};

const WeeklyAIReport = ({
  weekStart,
  setWeekStart,
  weekLabel,
  weeksCount,
  setWeeksCount,
  generating,
  report,
  stats,
  comparison,
  onGenerate,
}: {
  weekStart: Date;
  setWeekStart: (fn: (d: Date) => Date) => void;
  weekLabel: string;
  weeksCount: number;
  setWeeksCount: (n: number) => void;
  generating: boolean;
  report: string | null;
  stats: WeeklyStats | null;
  comparison: any | null;
  onGenerate: () => void;
}) => {
  const copyReport = async () => {
    if (!report) return;
    await navigator.clipboard.writeText(report);
    toast({ title: "Relatório copiado" });
  };

  return (
    <Card className="overflow-hidden border-primary/20">
      {/* Hero */}
      <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-4 sm:px-6 py-4 sm:py-5 border-b">
        <div className="flex items-start justify-between gap-3 sm:gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight">
                Relatório {weeksCount === 1 ? "semanal" : `de ${weeksCount} semanas`} com IA
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                {weeksCount === 1 ? "Semana" : "Período"} de {weekLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
            <select
              value={weeksCount}
              onChange={(e) => setWeeksCount(Number(e.target.value))}
              disabled={generating}
              className="h-9 px-2 rounded-md border border-input bg-background text-sm"
              aria-label="Quantidade de semanas"
              title="Quantidade de semanas"
            >
              <option value={1}>1 semana</option>
              <option value={2}>2 semanas</option>
              <option value={4}>4 semanas</option>
              <option value={8}>8 semanas</option>
              <option value={12}>12 semanas</option>
            </select>
            <Button variant="outline" size="icon" onClick={() => setWeekStart((d) => addWeeks(d, -1))} disabled={generating} aria-label="Semana anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart(() => startOfWeek(new Date(), { weekStartsOn: 1 }))}
              disabled={generating}
              title="Voltar para a semana atual"
              className="flex-1 sm:flex-none"
            >
              {(() => {
                const thisMon = startOfWeek(new Date(), { weekStartsOn: 1 });
                const diff = Math.round(
                  (weekStart.getTime() - thisMon.getTime()) / (7 * 24 * 60 * 60 * 1000)
                );
                if (diff === 0) return "Semana atual";
                if (diff === -1) return "Semana passada";
                if (diff === 1) return "Próxima semana";
                if (diff < -1) return `Há ${Math.abs(diff)} semanas`;
                return `Em ${diff} semanas`;
              })()}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setWeekStart((d) => addWeeks(d, 1))} disabled={generating} aria-label="Próxima semana">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button onClick={onGenerate} disabled={generating} size="sm" className="ml-0 sm:ml-2 w-full sm:w-auto">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Gerando..." : report ? "Atualizar" : "Gerar relatório"}
            </Button>
          </div>
        </div>
      </div>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Empty state */}
        {!stats && !generating && (
          <div className="text-center py-10 px-4">
            <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="font-medium">Gere um resumo inteligente da semana</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
              A IA analisa visitas, cancelamentos, taxa de confirmação dos clientes e gera recomendações para a próxima semana.
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {generating && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-lg border bg-muted/30 animate-pulse" />
              ))}
            </div>
            <div className="h-2 rounded bg-muted animate-pulse" />
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-4 rounded bg-muted/60 animate-pulse" style={{ width: `${90 - i * 10}%` }} />
              ))}
            </div>
          </div>
        )}

        {/* Stats grid */}
        {stats && !generating && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                icon={CalendarClock}
                label="Total de visitas"
                value={stats.total_visits}
                tint="primary"
                delta={comparison?.total_visits?.delta_pct}
                deltaInvert={false}
              />
              <MetricCard
                icon={CheckCircle2}
                label="Concluídas"
                value={stats.concluded_count}
                tint="success"
                hint={stats.total_visits > 0 ? `${Math.round((stats.concluded_count / stats.total_visits) * 100)}% do total` : undefined}
              />
              <MetricCard
                icon={CalendarX2}
                label="Canceladas"
                value={stats.cancelled_count}
                tint="destructive"
                hint={stats.total_visits > 0 ? `${Math.round((stats.cancelled_count / stats.total_visits) * 100)}% do total` : undefined}
                delta={comparison?.cancelled_count?.delta_pct}
                deltaInvert={true}
              />
              <MetricCard
                icon={TrendingUp}
                label="Confirmação cliente"
                value={`${stats.confirmation_rate_pct}%`}
                tint="primary"
                hint={`${stats.confirmed_trainings} confirmadas`}
                delta={comparison?.confirmation_rate_pct?.delta_pct}
                deltaInvert={false}
                deltaSuffix="p.p."
              />
            </div>

            {/* Confirmation progress */}
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Taxa de confirmação dos clientes
                </span>
                <span className="text-muted-foreground">
                  {stats.total_acceptances} aceite{stats.total_acceptances === 1 ? "" : "s"} totais
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all"
                  style={{ width: `${Math.min(stats.confirmation_rate_pct, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {stats.confirmed_trainings} de {stats.total_visits - stats.cancelled_count} visitas não-canceladas tiveram pelo menos um aceite.
              </p>
            </div>

            {/* Two-column: cancellations + top clients */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Cancellations */}
              <div className="rounded-lg border">
                <div className="px-4 py-3 border-b flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <h3 className="text-sm font-medium">Cancelamentos</h3>
                  <Badge variant="destructive" className="ml-auto">{stats.cancelled_count}</Badge>
                </div>
                <div className="p-3 space-y-2 max-h-64 overflow-auto">
                  {stats.cancellations.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Nenhuma visita cancelada nesta semana 🎉
                    </p>
                  ) : (
                    stats.cancellations.map((c, i) => (
                      <div key={i} className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{c.title}</span>
                          <span className="text-muted-foreground shrink-0">
                            {format(new Date(c.date), "d MMM", { locale: ptBR })}
                          </span>
                        </div>
                        {c.client && <div className="text-muted-foreground mt-0.5">{c.client}</div>}
                        {c.reason && <div className="text-destructive mt-1 italic">"{c.reason}"</div>}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Top clients */}
              <div className="rounded-lg border">
                <div className="px-4 py-3 border-b flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-medium">Clientes mais atendidos</h3>
                </div>
                <div className="p-3 space-y-2 max-h-64 overflow-auto">
                  {stats.top_clients.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Nenhum cliente registrado.
                    </p>
                  ) : (
                    stats.top_clients.map((c, i) => {
                      const max = stats.top_clients[0].count || 1;
                      const pct = (c.count / max) * 100;
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium truncate">{c.name}</span>
                            <span className="text-muted-foreground">{c.count} visita{c.count === 1 ? "" : "s"}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* AI narrative */}
            {report && (
              <div className="rounded-lg border bg-card">
                <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-medium">Resumo executivo</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={copyReport}>
                      <Copy className="h-3.5 w-3.5" /> Copiar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => window.print()}>
                      <Printer className="h-3.5 w-3.5" /> Imprimir
                    </Button>
                  </div>
                </div>
                <div className="p-5">
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-p:leading-relaxed prose-li:my-0.5 prose-strong:text-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

const MetricCard = ({
  icon: Icon,
  label,
  value,
  hint,
  tint,
  delta,
  deltaInvert,
  deltaSuffix,
}: {
  icon: any;
  label: string;
  value: string | number;
  hint?: string;
  tint: "primary" | "success" | "destructive";
  delta?: number;
  deltaInvert?: boolean;
  deltaSuffix?: string;
}) => {
  const tintMap = {
    primary: "bg-primary/10 text-primary border-primary/20",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
  } as const;
  let deltaNode: JSX.Element | null = null;
  if (typeof delta === "number") {
    const isUp = delta > 0;
    const isDown = delta < 0;
    const good = (isUp && !deltaInvert) || (isDown && deltaInvert);
    const bad = (isDown && !deltaInvert) || (isUp && deltaInvert);
    const color = delta === 0 ? "text-muted-foreground" : good ? "text-emerald-600 dark:text-emerald-400" : bad ? "text-destructive" : "text-muted-foreground";
    const Arrow = delta === 0 ? Minus : isUp ? ArrowUp : ArrowDown;
    deltaNode = (
      <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${color}`}>
        <Arrow className="h-3 w-3" />
        {Math.abs(delta)}{deltaSuffix || "%"} vs semana anterior
      </span>
    );
  }
  return (
    <div className="rounded-lg border bg-card p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className={`h-8 w-8 rounded-md border flex items-center justify-center ${tintMap[tint]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-2xl font-semibold mt-3 tracking-tight tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      {hint && <div className="text-[11px] text-muted-foreground/80 mt-1">{hint}</div>}
      {deltaNode && <div className="mt-1">{deltaNode}</div>}
    </div>
  );
};

export default Reports;