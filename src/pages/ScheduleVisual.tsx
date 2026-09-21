import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactFlow, {
  Background,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { CalendarClock, CalendarDays, CheckCircle2, Clock3, Search } from "lucide-react";
import { format, isAfter, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/schedule";
import { cn } from "@/lib/utils";

type Filter = "all" | "visits" | "pending" | "done";

type Training = {
  id: string;
  title: string;
  scheduled_at: string;
  status: string;
  visit_type: string;
};

type ScheduleItem = {
  id: string;
  phase_id: string;
  position: number;
  title: string;
  planned_date: string | null;
  done_date: string | null;
  status: string;
  training_id: string | null;
  training: Training | null;
};

type Phase = {
  id: string;
  position: number;
  title: string;
};

type ScheduleNodeData = {
  title: string;
  kind: "phase" | "item";
  phaseNumber?: number;
  phaseProgress?: number;
  status?: string;
  plannedDate?: string | null;
  doneDate?: string | null;
  training?: Training | null;
  overdue?: boolean;
};

const parseLocalDate = (value: string) => parseISO(`${value}T12:00:00`);
const formatLocalDate = (value: string) => format(parseLocalDate(value), "dd MMM", { locale: ptBR });

const ScheduleNode = ({ data }: NodeProps<ScheduleNodeData>) => {
  if (data.kind === "phase") {
    return (
      <div className="w-72 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 shadow-lg shadow-primary/10">
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-background !bg-primary" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase text-primary">Fase {data.phaseNumber}</span>
          <span className="text-xs font-semibold text-muted-foreground">{data.phaseProgress}%</span>
        </div>
        <div className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-foreground" title={data.title}>
          {data.title}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${data.phaseProgress ?? 0}%` }} />
        </div>
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-background !bg-primary" />
        <Handle type="source" position={Position.Bottom} id="items" className="!h-2.5 !w-2.5 !border-background !bg-primary" />
      </div>
    );
  }

  const status = data.status ?? "pending";
  const hasVisit = Boolean(data.training);

  return (
    <div
      className={cn(
        "group w-72 rounded-md border bg-card px-4 py-3 text-card-foreground shadow-md transition-shadow",
        hasVisit ? "border-primary/60 shadow-primary/10" : "border-border",
        data.overdue && "border-destructive/70",
        hasVisit && "cursor-pointer hover:shadow-lg hover:shadow-primary/20",
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-background !bg-border" />
      <div className="flex items-start justify-between gap-2">
        <div className="line-clamp-2 min-h-10 text-sm font-semibold leading-5" title={data.title}>
          {data.title}
        </div>
        {hasVisit && <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", STATUS_COLORS[status])}>
          {STATUS_LABELS[status] ?? status}
        </span>
        {data.overdue && (
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-destructive">
            Atrasada
          </span>
        )}
      </div>

      <div className="mt-3 space-y-1.5 border-t border-border/70 pt-2 text-xs">
        {data.plannedDate && (
          <div className="flex items-center justify-between gap-3 text-muted-foreground">
            <span>Prevista</span>
            <strong className="font-semibold text-foreground">{formatLocalDate(data.plannedDate)}</strong>
          </div>
        )}
        {data.training && (
          <div className="rounded-md bg-primary/10 px-2.5 py-2">
            <div className="flex items-center justify-between gap-3 font-semibold text-primary">
              <span>Visita agendada</span>
              <span>{format(parseISO(data.training.scheduled_at), "dd MMM · HH:mm", { locale: ptBR })}</span>
            </div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground">{data.training.title}</div>
          </div>
        )}
        {data.doneDate && (
          <div className="flex items-center justify-between gap-3 text-muted-foreground">
            <span>Concluída</span>
            <strong className="font-semibold text-foreground">{formatLocalDate(data.doneDate)}</strong>
          </div>
        )}
        {!data.plannedDate && !data.training && !data.doneDate && (
          <span className="text-muted-foreground">Sem data definida</span>
        )}
      </div>
    </div>
  );
};

const nodeTypes = { schedule: ScheduleNode };

export default function ScheduleVisual() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [phases, setPhases] = useState<Phase[]>([]);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientName, setClientName] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);

      const [{ data: schedule, error: scheduleError }, { data: phaseRows, error: phasesError }] = await Promise.all([
        supabase.from("implementation_schedules").select("client_name").eq("id", id).single(),
        supabase.from("schedule_phases").select("id,position,title").eq("schedule_id", id).order("position"),
      ]);

      if (scheduleError || phasesError) {
        toast.error("Não foi possível carregar o organograma.");
        setLoading(false);
        return;
      }

      const nextPhases = (phaseRows ?? []) as Phase[];
      const phaseIds = nextPhases.map((phase) => phase.id);
      const { data: itemRows, error: itemsError } = phaseIds.length
        ? await supabase
            .from("schedule_items")
            .select("id,phase_id,position,title,planned_date,done_date,status,training_id,trainings(id,title,scheduled_at,status,visit_type)")
            .in("phase_id", phaseIds)
            .order("position")
        : { data: [], error: null };

      if (itemsError) {
        toast.error("Não foi possível carregar as visitas do cronograma.");
        setLoading(false);
        return;
      }

      const normalizedItems = (itemRows ?? []).map((item) => {
        const related = item.trainings;
        const training = Array.isArray(related) ? related[0] ?? null : related ?? null;
        return {
          id: item.id,
          phase_id: item.phase_id,
          position: item.position,
          title: item.title,
          planned_date: item.planned_date,
          done_date: item.done_date,
          status: item.status,
          training_id: item.training_id,
          training,
        } as ScheduleItem;
      });

      setClientName(schedule.client_name);
      setPhases(nextPhases);
      setItems(normalizedItems);
      setLoading(false);
    };

    fetchData();
  }, [id]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return items.filter((item) => {
      const matchesSearch = !term || item.title.toLocaleLowerCase("pt-BR").includes(term) || item.training?.title.toLocaleLowerCase("pt-BR").includes(term);
      if (!matchesSearch) return false;
      if (filter === "visits") return Boolean(item.training);
      if (filter === "pending") return item.status !== "done" && item.status !== "not_applicable";
      if (filter === "done") return item.status === "done";
      return true;
    });
  }, [filter, items, search]);

  const stats = useMemo(() => {
    const considered = items.filter((item) => item.status !== "not_applicable");
    const done = considered.filter((item) => item.status === "done").length;
    const visits = items.filter((item) => item.training);
    const upcoming = visits
      .filter((item) => item.training && isAfter(parseISO(item.training.scheduled_at), new Date()))
      .sort((a, b) => parseISO(a.training?.scheduled_at ?? "").getTime() - parseISO(b.training?.scheduled_at ?? "").getTime())[0];
    return {
      progress: considered.length ? Math.round((done / considered.length) * 100) : 0,
      visits: visits.length,
      pending: considered.length - done,
      upcoming,
    };
  }, [items]);

  const { nodes, edges } = useMemo(() => {
    const nextNodes: Node<ScheduleNodeData>[] = [];
    const nextEdges: Edge[] = [];
    let currentX = 40;
    const phaseGap = 340;
    const itemStartY = 165;
    const itemGapY = 200;

    phases.forEach((phase, phaseIndex) => {
      const allPhaseItems = items.filter((item) => item.phase_id === phase.id);
      const phaseItems = visibleItems.filter((item) => item.phase_id === phase.id);
      if (phaseItems.length === 0 && (filter !== "all" || search.trim())) return;

      const done = allPhaseItems.filter((item) => item.status === "done").length;
      const applicable = allPhaseItems.filter((item) => item.status !== "not_applicable").length;
      const phaseProgress = applicable ? Math.round((done / applicable) * 100) : 0;
      const phaseNodeId = `phase-${phase.id}`;

      nextNodes.push({
        id: phaseNodeId,
        type: "schedule",
        data: { title: phase.title, kind: "phase", phaseNumber: phaseIndex + 1, phaseProgress },
        position: { x: currentX, y: 30 },
        draggable: false,
      });

      const previousPhase = [...nextNodes].reverse().find((node) => node.data.kind === "phase" && node.id !== phaseNodeId);
      if (previousPhase) {
        nextEdges.push({
          id: `edge-${previousPhase.id}-${phaseNodeId}`,
          source: previousPhase.id,
          target: phaseNodeId,
          animated: true,
          style: { stroke: "var(--color-primary)", strokeWidth: 2 },
        });
      }

      phaseItems.forEach((item, itemIndex) => {
        const planned = item.planned_date ? parseLocalDate(item.planned_date) : null;
        const overdue = Boolean(planned && isAfter(new Date(), planned) && !isSameDay(new Date(), planned) && item.status !== "done" && item.status !== "not_applicable");
        const itemNodeId = `item-${item.id}`;
        nextNodes.push({
          id: itemNodeId,
          type: "schedule",
          data: {
            title: item.title,
            kind: "item",
            status: item.status,
            plannedDate: item.planned_date,
            doneDate: item.done_date,
            training: item.training,
            overdue,
          },
          position: { x: currentX, y: itemStartY + itemIndex * itemGapY },
          draggable: false,
        });
        nextEdges.push({
          id: `edge-${phaseNodeId}-${itemNodeId}`,
          source: phaseNodeId,
          sourceHandle: "items",
          target: itemNodeId,
          style: { stroke: "var(--color-border)", strokeWidth: 1.5 },
        });
      });

      currentX += phaseGap;
    });

    return { nodes: nextNodes, edges: nextEdges };
  }, [filter, items, phases, search, visibleItems]);

  useEffect(() => {
    if (!flow || loading) return;
    const timer = window.setTimeout(() => {
      if (filter !== "all" || search.trim()) {
        flow.fitView({ padding: 0.15, duration: 350, maxZoom: 0.9 });
        return;
      }
      const zoom = window.innerWidth < 640 ? 0.72 : 0.82;
      flow.setViewport({ x: 16, y: 18, zoom }, { duration: 350 });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [filter, flow, loading, search]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node<ScheduleNodeData>) => {
    if (node.data.kind === "item" && node.data.training?.id) navigate(`/treinamento/${node.data.training.id}`);
  }, [navigate]);

  const filterOptions: Array<{ value: Filter; label: string }> = [
    { value: "all", label: "Tudo" },
    { value: "visits", label: "Com visita" },
    { value: "pending", label: "Pendentes" },
    { value: "done", label: "Concluídas" },
  ];

  return (
    <div className="flex h-screen min-h-[640px] flex-col bg-background">
      <SEO title={`Organograma — ${clientName}`} description={`Agenda visual do cronograma de implantação para ${clientName}`} path={`/cronogramas/${id}/visualizar`} />
      <AppHeader />

      <div className="border-b border-border bg-card/70">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <BackButton />
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold sm:text-xl">Agenda do cronograma</h1>
                <p className="truncate text-xs text-muted-foreground sm:text-sm">{clientName}</p>
              </div>
            </div>
            {stats.upcoming?.training && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/treinamento/${stats.upcoming?.training?.id}`)}>
                <CalendarClock />
                <span className="hidden sm:inline">Próxima:</span>
                {format(parseISO(stats.upcoming.training.scheduled_at), "dd/MM · HH:mm")}
              </Button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-md border border-border bg-background/60">
            <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
              <div><strong className="block text-sm sm:text-base">{stats.progress}%</strong><span className="hidden text-xs text-muted-foreground sm:block">concluído</span></div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
              <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
              <div><strong className="block text-sm sm:text-base">{stats.visits}</strong><span className="hidden text-xs text-muted-foreground sm:block">visitas vinculadas</span></div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
              <Clock3 className="h-4 w-4 shrink-0 text-primary" />
              <div><strong className="block text-sm sm:text-base">{stats.pending}</strong><span className="hidden text-xs text-muted-foreground sm:block">etapas pendentes</span></div>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar etapa ou visita" className="pl-9" />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0" aria-label="Filtros do organograma">
              {filterOptions.map((option) => (
                <Button key={option.value} size="sm" variant={filter === option.value ? "default" : "outline"} onClick={() => setFilter(option.value)}>
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
            <p className="text-sm text-muted-foreground">Carregando agenda visual...</p>
          </div>
        ) : nodes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <p className="font-semibold">Nenhuma etapa encontrada</p>
            <p className="text-sm text-muted-foreground">Tente outro filtro ou termo de busca.</p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={setFlow}
            onNodeClick={handleNodeClick}
            defaultViewport={{ x: 16, y: 18, zoom: 0.82 }}
            minZoom={0.15}
            maxZoom={1.5}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
          >
            <Background color="var(--color-border)" gap={24} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              className="!hidden !border !border-border !bg-card sm:!block"
              nodeColor={(node) => node.data?.kind === "phase" ? "var(--color-primary)" : "var(--color-muted)"}
              maskColor="color-mix(in oklch, var(--color-background) 72%, transparent)"
              pannable
              zoomable
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}