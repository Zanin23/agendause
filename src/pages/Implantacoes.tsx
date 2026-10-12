import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  Eye,
  History,
  ListChecks,
  Loader2,
  Pause,
  Pencil,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";

/* ---------------------------------------------------------------------------
   Implantações — a visão cruzada dos dois sistemas no MESMO banco:
   · o relatório (tabela `documentos`) manda no status, progresso, texto,
     "o que já foi feito" e "o que ainda falta";
   · a agenda (cronogramas, itens e visitas) manda no cronograma, nas datas e
     nas visitas — é o que a função `rel_sincronizar_agenda()` publica.
   A view `vw_relatorio_implantacoes` já entrega as duas partes juntas.
--------------------------------------------------------------------------- */

const SITE_RELATORIO = "https://relat-rio-de-implanta-es.vercel.app";

type CronogramaItem = {
  id?: string;
  atividade?: string;
  fase?: string;
  data?: string;
  visitaData?: string;
  concluidoEm?: string;
  responsavel?: string;
  hora?: string;
  categoria?: "etapa" | "visita";
  status?: string;
  progresso?: number | null;
  origem?: string;
};

type DadosRelatorio = {
  id?: string;
  nome?: string;
  tipo?: string;
  status?: string;
  progresso?: number;
  statusText?: string;
  feito?: string[];
  falta?: string[];
  grupo?: string[];
  fases?: [string, string][];
  observacao?: string;
  atualizado?: string;
  historico?: { data?: string; progresso?: number; status?: string; texto?: string }[];
  cronograma?: CronogramaItem[];
};

type Linha = {
  id: string | null;
  nome: string | null;
  ordem: number | null;
  origem: string | null;
  tipo: string | null;
  relatorio: DadosRelatorio | null;
  status_relatorio: string | null;
  progresso_relatorio: number | null;
  status_text: string | null;
  atualizado_relatorio: string | null;
  schedule_id: string | null;
  workspace_id: string | null;
  agenda_status: string | null;
  agenda_progresso: number | null;
  modalidade: string | null;
  cadencia: string | null;
  inicio: string | null;
  equipe: string[] | null;
  pausado: boolean | null;
  motivo_pausa: string | null;
  itens_total: number | null;
  itens_concluidos: number | null;
  itens_abertos: number | null;
  itens_atrasados: number | null;
  visitas_total: number | null;
  visitas_realizadas: number | null;
  visitas_agendadas: number | null;
  visitas_canceladas: number | null;
  proxima_visita_data: string | null;
  proxima_visita_hora: string | null;
  proxima_visita_titulo: string | null;
  cronograma: CronogramaItem[] | null;
};

/* rótulos iguais aos do app do relatório */
const STATUS: Record<string, { label: string; cls: string }> = {
  cliente: { label: "Aguardando cliente", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  desenvolvimento: { label: "Aguardando desenvolvimento", cls: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30" },
  andamento: { label: "Em andamento", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30" },
  risco: { label: "Atenção / risco", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  concluido: { label: "Concluído", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
};

const SITUACAO_ITEM: Record<string, { label: string; cls: string }> = {
  concluido: { label: "Concluído", cls: "text-emerald-600 dark:text-emerald-400" },
  andamento: { label: "Em andamento", cls: "text-sky-600 dark:text-sky-400" },
  risco: { label: "Bloqueado", cls: "text-destructive" },
  pendente: { label: "Pendente", cls: "text-muted-foreground" },
  "": { label: "—", cls: "text-muted-foreground" },
};

const TIPOS = ["Nova implantação", "Reimplantação", "Migração Cloud", "Treinamento", "Suporte / ajustes", "Outro"];

const dia = (iso?: string | null) => (iso ? format(parseISO(iso.slice(0, 10) + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "—");
const diaCurto = (iso?: string | null) => (iso ? format(parseISO(iso.slice(0, 10) + "T00:00:00"), "dd/MM", { locale: ptBR }) : "—");
const linhas = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const texto = (arr?: string[] | null) => (arr || []).join("\n");

/* guarda a última sincronização desta sessão, para não repetir a cada troca de tela */
let jaSincronizou = false;

const Implantacoes = () => {
  const { isAdmin, hasScreenPermission, loading: roleLoading } = usePermissions();
  const [dados, setDados] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroSetup, setErroSetup] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "risco" | "andamento" | "concluido" | "sem-relatorio" | "sem-agenda">("todos");
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const [editando, setEditando] = useState<Linha | null>(null);
  const timer = useRef<number | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("vw_relatorio_implantacoes")
      .select("*")
      .order("ordem", { ascending: true, nullsFirst: false })
      .order("nome", { ascending: true });

    if (error) {
      const falhouTabela = /does not exist|schema cache|relation/i.test(error.message);
      setErroSetup(
        falhouTabela
          ? "A integração ainda não foi publicada neste projeto Supabase. Rode o arquivo supabase/migrations/20261012120000_integracao_relatorio_implantacoes.sql no SQL Editor e recarregue."
          : error.message,
      );
      setCarregando(false);
      return;
    }
    setErroSetup(null);
    setDados((data || []) as unknown as Linha[]);
    setCarregando(false);
  }, []);

  const sincronizar = useCallback(
    async (silencioso = false) => {
      setSincronizando(true);
      try {
        const { data, error } = await supabase.rpc("rel_sincronizar_agenda");
        if (error) throw error;
        const r = (data || {}) as { criados?: number; atualizados?: number };
        if (!silencioso || (r.criados || 0) > 0) {
          toast({
            title: "Cronogramas publicados no relatório",
            description: `${r.criados || 0} empresa(s) criada(s) · ${r.atualizados || 0} atualizada(s).`,
          });
        }
        await carregar();
      } catch (e) {
        if (!silencioso) {
          toast({
            title: "Não foi possível sincronizar",
            description: (e as Error).message,
            variant: "destructive",
          });
        }
      } finally {
        setSincronizando(false);
      }
    },
    [carregar],
  );

  // sincroniza sozinho ao abrir a tela (é o "automático ao abrir" combinado)
  useEffect(() => {
    if (roleLoading) return;
    void (async () => {
      await carregar();
      if (!jaSincronizou) {
        jaSincronizou = true;
        void sincronizar(true);
      }
    })();
  }, [roleLoading, carregar, sincronizar]);

  // tempo real: qualquer mudança em documentos (do relatório ou da agenda) aparece aqui
  useEffect(() => {
    const canal = supabase
      .channel("relatorio-implantacoes")
      .on("postgres_changes", { event: "*", schema: "public", table: "documentos" }, () => {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void carregar(), 400);
      })
      .subscribe();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      void supabase.removeChannel(canal);
    };
  }, [carregar]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return dados.filter((l) => {
      if (q && !(l.nome || "").toLowerCase().includes(q)) return false;
      if (filtro === "sem-relatorio") return l.origem === "agenda";
      if (filtro === "sem-agenda") return l.origem === "relatorio";
      if (filtro !== "todos") return l.status_relatorio === filtro;
      return true;
    });
  }, [dados, busca, filtro]);

  const kpis = useMemo(() => {
    const comAgenda = dados.filter((l) => !!l.schedule_id);
    const risco = dados.filter((l) => l.status_relatorio === "risco" || (l.itens_atrasados || 0) > 0).length;
    const concluidas = dados.filter((l) => l.status_relatorio === "concluido").length;
    const atrasados = dados.reduce((a, l) => a + (l.itens_atrasados || 0), 0);
    const abertos = dados.reduce((a, l) => a + (l.itens_abertos || 0), 0);
    const agendadas = dados.reduce((a, l) => a + (l.visitas_agendadas || 0), 0);
    const progresso = dados.length ? Math.round(dados.reduce((a, l) => a + (l.progresso_relatorio || 0), 0) / dados.length) : 0;
    const em7dias = dados.filter((l) => {
      if (!l.proxima_visita_data) return false;
      const d = differenceInCalendarDays(parseISO(l.proxima_visita_data + "T00:00:00"), new Date());
      return d >= 0 && d <= 7;
    }).length;
    return { total: dados.length, comAgenda: comAgenda.length, risco, concluidas, atrasados, abertos, agendadas, progresso, em7dias };
  }, [dados]);

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="p-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (!isAdmin && !hasScreenPermission("reports")) {
    return (
      <div className="min-h-screen bg-background">
        <SEO title="Acesso restrito — TreinaCheck" description="Página restrita." path="/implantacoes" />
        <AppHeader />
        <main className="max-w-3xl mx-auto px-4 py-20 text-center">
          <BackButton to="/" />
          <div className="mt-6 p-8 rounded-2xl border border-border bg-card/60">
            <h1 className="text-2xl font-semibold">Acesso Restrito</h1>
            <p className="text-muted-foreground mt-2">Você não tem permissão para ver as implantações.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Implantações — TreinaCheck"
        description="Cronogramas da agenda e status do relatório de implantações no mesmo lugar."
        path="/implantacoes"
      />
      <AppHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <BackButton to="/" />
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-2 flex items-center gap-2">
              <Building2 className="h-7 w-7 text-primary" /> Implantações
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base max-w-2xl">
              O cronograma e as visitas vêm daqui da agenda; o status, o progresso e as listas continuam sendo editados
              no relatório. Tudo no mesmo banco — o que muda de um lado aparece do outro.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void sincronizar()} disabled={sincronizando}>
              {sincronizando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Publicar cronogramas
            </Button>
            <Button asChild variant="outline">
              <a href={SITE_RELATORIO} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" /> Abrir relatório
              </a>
            </Button>
          </div>
        </div>

        {erroSetup && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-4 flex gap-3 text-sm">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Integração pendente</p>
                <p className="text-muted-foreground mt-1">{erroSetup}</p>
                <p className="text-muted-foreground mt-2">
                  Passo a passo completo em <code className="text-xs">docs/integracao-relatorio-implantacoes.md</code>.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Empresas", valor: kpis.total, hint: `${kpis.comAgenda} com cronograma` },
            { label: "Progresso médio", valor: `${kpis.progresso}%`, hint: "no relatório" },
            { label: "Precisam de atenção", valor: kpis.risco, hint: "risco ou itens atrasados" },
            { label: "Itens abertos", valor: kpis.abertos, hint: `${kpis.atrasados} atrasados` },
            { label: "Visitas agendadas", valor: kpis.agendadas, hint: `${kpis.em7dias} em 7 dias` },
            { label: "Concluídas", valor: kpis.concluidas, hint: "no relatório" },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-semibold tabular-nums mt-0.5">{k.valor}</p>
                <p className="text-[11px] text-muted-foreground truncate">{k.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa…" className="pl-9" />
          </div>
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as typeof filtro)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="todos">Todas</option>
            <option value="risco">Atenção / risco</option>
            <option value="andamento">Em andamento</option>
            <option value="cliente">Aguardando cliente</option>
            <option value="concluido">Concluídas</option>
            <option value="sem-agenda">Só no relatório (sem cronograma)</option>
            <option value="sem-relatorio">Só na agenda (sem relatório)</option>
          </select>
          <span className="text-sm text-muted-foreground">{lista.length} de {dados.length}</span>
        </div>

        {carregando ? (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          </div>
        ) : lista.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              Nada por aqui. {dados.length === 0 ? "Crie um cronograma na agenda e clique em “Publicar cronogramas”." : "Ajuste a busca ou o filtro."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {lista.map((l) => {
              const id = l.id || l.nome || "";
              const expandido = !!aberto[id];
              const st = STATUS[l.status_relatorio || ""] || STATUS.andamento;
              const crono = (l.cronograma || []) as CronogramaItem[];
              const fases = crono.reduce<Record<string, CronogramaItem[]>>((acc, item) => {
                const f = (item.fase || "Sem fase").trim() || "Sem fase";
                (acc[f] = acc[f] || []).push(item);
                return acc;
              }, {});
              return (
                <Card key={id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="p-4 sm:p-5 flex flex-wrap items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-lg font-semibold truncate">{l.nome || "(sem nome)"}</h2>
                          <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                          {l.origem === "agenda" && <Badge variant="outline">só na agenda</Badge>}
                          {l.origem === "relatorio" && <Badge variant="outline">só no relatório</Badge>}
                          {l.pausado && (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
                              <Pause className="h-3 w-3 mr-1" /> pausado
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {l.tipo || "—"}
                          {l.status_text ? ` · ${l.status_text}` : ""}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                          <span>relatório: {dia(l.atualizado_relatorio)}</span>
                          {l.schedule_id && (
                            <span>
                              agenda: {l.modalidade || "—"} · {l.cadencia || "—"} · início {diaCurto(l.inicio)}
                            </span>
                          )}
                          {l.equipe && l.equipe.length > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3 w-3" /> {l.equipe.join(", ")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-[11px] text-muted-foreground">relatório</p>
                            <p className="text-sm font-semibold tabular-nums">{l.progresso_relatorio ?? 0}%</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] text-muted-foreground">agenda</p>
                            <p className="text-sm font-semibold tabular-nums">{l.agenda_progresso ?? 0}%</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEditando(l)}>
                            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar relatório
                          </Button>
                          {l.schedule_id && (
                            <Button size="sm" variant="outline" asChild>
                              <Link to={`/cronogramas/${l.schedule_id}`}>
                                <ClipboardList className="h-3.5 w-3.5 mr-1.5" /> Cronograma
                              </Link>
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setAberto((a) => ({ ...a, [id]: !expandido }))}>
                            {expandido ? <X className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            <span className="sr-only">Detalhes</span>
                            <ChevronDown className={`h-3.5 w-3.5 ml-1 transition-transform ${expandido ? "rotate-180" : ""}`} />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* barras */}
                    <div className="px-4 sm:px-5 pb-4 grid sm:grid-cols-2 gap-3">
                      <div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${l.progresso_relatorio ?? 0}%` }} />
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">progresso informado no relatório</p>
                      </div>
                      <div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-sky-500" style={{ width: `${l.agenda_progresso ?? 0}%` }} />
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          itens do cronograma: {l.itens_concluidos || 0}/{l.itens_total || 0} concluídos
                          {(l.itens_atrasados || 0) > 0 ? ` · ${l.itens_atrasados} atrasado(s)` : ""}
                        </p>
                      </div>
                    </div>

                    {/* linha de visitas */}
                    <div className="px-4 sm:px-5 pb-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {l.visitas_realizadas || 0} realizadas
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5 text-sky-600" /> {l.visitas_agendadas || 0} agendadas
                      </span>
                      {(l.visitas_canceladas || 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> {l.visitas_canceladas} cancelada(s)
                        </span>
                      )}
                      {l.proxima_visita_data && (
                        <span>
                          próxima: {diaCurto(l.proxima_visita_data)} às {l.proxima_visita_hora} — {l.proxima_visita_titulo}
                        </span>
                      )}
                    </div>

                    {expandido && (
                      <div className="border-t border-border bg-muted/30 p-4 sm:p-5 grid lg:grid-cols-3 gap-5">
                        <div className="lg:col-span-2 space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                              <ListChecks className="h-4 w-4 text-primary" /> Cronograma ({crono.length} itens)
                            </h3>
                            {crono.length === 0 ? (
                              <p className="text-sm text-muted-foreground mt-2">
                                Nenhum item publicado. {l.schedule_id ? "Confira o cronograma e clique em “Publicar cronogramas”." : "Esta empresa ainda não tem cronograma na agenda."}
                              </p>
                            ) : (
                              <div className="mt-3 space-y-3">
                                {Object.entries(fases).map(([fase, itens]) => (
                                  <div key={fase}>
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{fase}</p>
                                    <ul className="mt-1 divide-y divide-border/60">
                                      {itens.map((item, i) => {
                                        const s = SITUACAO_ITEM[item.status || ""] || SITUACAO_ITEM[""];
                                        return (
                                          <li key={item.id || `${fase}-${i}`} className="py-1.5 flex items-start gap-2 text-sm">
                                            <span className={`text-xs font-medium w-24 shrink-0 ${s.cls}`}>{s.label}</span>
                                            <span className="min-w-0 flex-1">
                                              {item.atividade}
                                              {item.categoria === "visita" && (
                                                <Badge variant="outline" className="ml-2 text-[10px]">visita</Badge>
                                              )}
                                              <span className="block text-[11px] text-muted-foreground">
                                                {item.data ? `previsto ${diaCurto(item.data)}` : "sem data prevista"}
                                                {item.visitaData ? ` · visita ${diaCurto(item.visitaData)}${item.hora ? ` ${item.hora}` : ""}` : ""}
                                                {item.concluidoEm ? ` · concluído ${diaCurto(item.concluidoEm)}` : ""}
                                                {item.responsavel ? ` · ${item.responsavel}` : ""}
                                              </span>
                                            </span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold">O que já foi feito</h3>
                            {(l.relatorio?.feito || []).length ? (
                              <ul className="mt-1 text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                                {(l.relatorio?.feito || []).map((f, i) => <li key={i}>{f}</li>)}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted-foreground mt-1">—</p>
                            )}
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold">O que ainda falta</h3>
                            {(l.relatorio?.falta || []).length ? (
                              <ul className="mt-1 text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                                {(l.relatorio?.falta || []).map((f, i) => <li key={i}>{f}</li>)}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted-foreground mt-1">—</p>
                            )}
                          </div>
                          {(l.relatorio?.grupo || []).length > 0 && (
                            <div>
                              <h3 className="text-sm font-semibold">Outras empresas do grupo</h3>
                              <p className="text-sm text-muted-foreground mt-1">{(l.relatorio?.grupo || []).join(" · ")}</p>
                            </div>
                          )}
                          <div>
                            <h3 className="text-sm font-semibold">Matriz de fases do relatório</h3>
                            <div className="mt-1 flex gap-1">
                              {(l.relatorio?.fases || []).map((f, i) => {
                                const cor =
                                  f[0] === "done" ? "bg-emerald-500" :
                                  f[0] === "now" ? "bg-amber-500" :
                                  f[0] === "pend" ? "bg-slate-400" : "bg-muted";
                                return <span key={i} title={`${["Cadastros básicos", "Produtos & Estoque", "Comercial / Vendas", "Financeiro & PCP", "Fiscal / Cloud"][i]}: ${f[1] || f[0]}`} className={`h-2 flex-1 rounded-full ${cor}`} />;
                              })}
                            </div>
                          </div>
                          {l.relatorio?.observacao && (
                            <div>
                              <h3 className="text-sm font-semibold">Observação</h3>
                              <p className="text-sm text-muted-foreground mt-1">{l.relatorio.observacao}</p>
                            </div>
                          )}
                          {(l.relatorio?.historico || []).length > 0 && (
                            <div>
                              <h3 className="text-sm font-semibold flex items-center gap-2">
                                <History className="h-4 w-4" /> Últimas movimentações
                              </h3>
                              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                                {(l.relatorio?.historico || []).slice(0, 5).map((h, i) => (
                                  <li key={i}>
                                    {dia(h.data)} · {h.progresso}% · {h.texto}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <Button size="sm" variant="link" className="px-0" asChild>
                            <a href={SITE_RELATORIO} target="_blank" rel="noreferrer">
                              Ver no relatório completo <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <EditarRelatorio linha={editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); void carregar(); }} />
    </div>
  );
};

/* ---------------------------------------------------------------------------
   Edição dos campos que pertencem ao RELATÓRIO (a agenda não manda neles)
--------------------------------------------------------------------------- */
const EditarRelatorio = ({
  linha,
  onFechar,
  onSalvo,
}: {
  linha: Linha | null;
  onFechar: () => void;
  onSalvo: () => void;
}) => {
  const dados = (linha?.relatorio || {}) as DadosRelatorio;
  const [tipo, setTipo] = useState(dados.tipo || "Nova implantação");
  const [status, setStatus] = useState(dados.status || "andamento");
  const [progresso, setProgresso] = useState(String(dados.progresso ?? 0));
  const [statusText, setStatusText] = useState(dados.statusText || "");
  const [feito, setFeito] = useState(texto(dados.feito));
  const [falta, setFalta] = useState(texto(dados.falta));
  const [grupo, setGrupo] = useState(texto(dados.grupo));
  const [observacao, setObservacao] = useState(dados.observacao || "");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const d = (linha?.relatorio || {}) as DadosRelatorio;
    setTipo(d.tipo || "Nova implantação");
    setStatus(d.status || "andamento");
    setProgresso(String(d.progresso ?? 0));
    setStatusText(d.statusText || "");
    setFeito(texto(d.feito));
    setFalta(texto(d.falta));
    setGrupo(texto(d.grupo));
    setObservacao(d.observacao || "");
  }, [linha]);

  if (!linha) return null;

  const salvar = async () => {
    if (!linha.id) return;
    setSalvando(true);
    try {
      const prog = Math.max(0, Math.min(100, Number(progresso.replace("%", "")) || 0));
      const anterior = (linha.relatorio || {}) as DadosRelatorio;
      const historico = [
        {
          data: format(new Date(), "yyyy-MM-dd"),
          progresso: prog,
          status,
          texto: "Atualizado pelo TreinaCheck",
        },
        ...(anterior.historico || []),
      ].slice(0, 30);

      const novos: DadosRelatorio = {
        ...anterior,
        id: linha.id,
        nome: anterior.nome || linha.nome || "",
        tipo,
        status,
        progresso: prog,
        statusText: statusText.trim(),
        feito: linhas(feito),
        falta: linhas(falta),
        grupo: linhas(grupo),
        observacao: observacao.trim(),
        atualizado: format(new Date(), "yyyy-MM-dd"),
        historico,
        cronograma: anterior.cronograma || (linha.cronograma as CronogramaItem[]) || [],
      };

      const { error } = await supabase
        .from("documentos")
        .upsert({ id: linha.id, dados: novos, ordem: linha.ordem ?? 0 }, { onConflict: "id" });
      if (error) throw error;
      toast({ title: "Relatório atualizado", description: `${linha.nome} — salvo para todo mundo.` });
      onSalvo();
    } catch (e) {
      toast({ title: "Não foi possível salvar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!linha} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar no relatório — {linha.nome}</DialogTitle>
          <DialogDescription>
            Estes campos são do relatório de implantações. O cronograma e as visitas continuam vindo da agenda.
          </DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="tipo">Tipo de trabalho</Label>
            <select
              id="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Array.from(new Set([tipo, ...TIPOS])).filter(Boolean).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="status">Situação</Label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="progresso">Progresso (%)</Label>
            <Input id="progresso" value={progresso} onChange={(e) => setProgresso(e.target.value)} inputMode="numeric" />
            <p className="text-[11px] text-muted-foreground mt-1">
              a agenda calcula {linha.agenda_progresso ?? 0}% a partir dos itens concluídos
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="statusText">Status atual (a frase que aparece no topo do card)</Label>
            <Input id="statusText" value={statusText} onChange={(e) => setStatusText(e.target.value)} maxLength={400} />
          </div>
          <div>
            <Label htmlFor="feito">O que já foi feito (uma linha por item)</Label>
            <Textarea id="feito" value={feito} onChange={(e) => setFeito(e.target.value)} rows={4} />
          </div>
          <div>
            <Label htmlFor="falta">O que ainda falta fazer (uma linha por item)</Label>
            <Textarea id="falta" value={falta} onChange={(e) => setFalta(e.target.value)} rows={4} />
          </div>
          <div>
            <Label htmlFor="grupo">Outras empresas do grupo (uma linha por item)</Label>
            <Textarea id="grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)} rows={3} />
          </div>
          <div>
            <Label htmlFor="observacao">Observação interna</Label>
            <Textarea id="observacao" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter className="flex-row justify-end gap-2">
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar no relatório
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Implantacoes;
