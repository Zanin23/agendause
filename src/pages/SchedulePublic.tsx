import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarPlus, CheckCircle2, Clock3, List, Network } from "lucide-react";
import ReactFlow, { Background, Controls, Edge, Handle, MiniMap, Node, NodeProps, Position } from "reactflow";
import "reactflow/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/schedule";

type PublicNodeData = {
  kind: "phase" | "item";
  title: string;
  phaseNumber?: number;
  progress?: number;
  item?: any;
  onSchedule?: (item: any) => void;
};

const PublicScheduleNode = ({ data }: NodeProps<PublicNodeData>) => {
  if (data.kind === "phase") {
    return (
      <div className="w-72 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 shadow-lg shadow-primary/10">
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-background !bg-primary" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Fase {data.phaseNumber}</span>
          <span className="text-xs font-semibold text-muted-foreground">{data.progress}%</span>
        </div>
        <div className="mt-1 line-clamp-2 text-sm font-bold leading-snug" title={data.title}>{data.title}</div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${data.progress ?? 0}%` }} />
        </div>
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-background !bg-primary" />
        <Handle type="source" position={Position.Bottom} id="items" className="!h-2.5 !w-2.5 !border-background !bg-primary" />
      </div>
    );
  }

  const it = data.item;
  const canSchedule = it.status !== "done" && it.status !== "not_applicable";
  const label = it.approval_status === "pending" || it.scheduled_date ? "Trocar data" : "Agendar data";

  return (
    <div className="w-72 rounded-xl border border-border bg-card px-4 py-3 text-card-foreground shadow-md">
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-background !bg-border" />
      <div className="flex items-start justify-between gap-2">
        <div className="line-clamp-2 text-sm font-semibold leading-snug" title={it.title}>{it.title}</div>
        <span className={`shrink-0 rounded px-2 py-1 text-[10px] ${STATUS_COLORS[it.status]}`}>{STATUS_LABELS[it.status]}</span>
      </div>
      <div className="mt-2 space-y-1">
        {it.scheduled_date && (
          <div className="text-xs text-muted-foreground">Visita agendada: {format(new Date(it.scheduled_date), "dd/MM/yyyy 'às' HH:mm")}</div>
        )}
        {it.planned_date && !it.scheduled_date && (
          <div className="text-xs text-muted-foreground">Previsto: {format(new Date(it.planned_date), "dd/MM/yyyy")}</div>
        )}
        {it.approval_status === "pending" && (
          <Badge variant="outline" className="gap-1 text-[10px]"><Clock3 className="h-3 w-3" /> Aguardando confirmação</Badge>
        )}
        {it.approval_status === "approved" && it.scheduled_date && (
          <Badge variant="success" className="gap-1 text-[10px]"><CheckCircle2 className="h-3 w-3" /> Data confirmada</Badge>
        )}
        {it.approval_status === "rejected" && (
          <Badge variant="destructive" className="text-[10px]">Data recusada — escolha outra</Badge>
        )}
      </div>
      {canSchedule && (
        <Button size="sm" className="nodrag mt-2 h-8 w-full gap-1.5 text-xs" onClick={() => data.onSchedule?.(it)}>
          <CalendarPlus className="h-3.5 w-3.5" /> {label}
        </Button>
      )}
    </div>
  );
};

const publicNodeTypes = { publicSchedule: PublicScheduleNode };


export default function SchedulePublic() {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [view, setView] = useState<"lista" | "mapa">("lista");
  const [requestItem, setRequestItem] = useState<any>(null);
  const [requestDate, setRequestDate] = useState("");
  const [requestTime, setRequestTime] = useState("09:00");
  const [requestName, setRequestName] = useState("");
  const [sending, setSending] = useState(false);
  const { mapNodes, mapEdges } = useMemo(() => {
    const nodes: Node<PublicNodeData>[] = [];
    const edges: Edge[] = [];
    const phases = (data as any)?.phases ?? [];
    let x = 40;
    phases.forEach((p: any, i: number) => {
      const items = p.items ?? [];
      const applicable = items.filter((it: any) => it.status !== "not_applicable").length;
      const done = items.filter((it: any) => it.status === "done").length;
      const phaseId = `phase-${p.id}`;
      nodes.push({
        id: phaseId,
        type: "publicSchedule",
        position: { x, y: 30 },
        draggable: false,
        data: { kind: "phase", title: p.title, phaseNumber: i + 1, progress: applicable ? Math.round((done / applicable) * 100) : 0 },
      });
      if (i > 0) {
        edges.push({
          id: `edge-${phases[i - 1].id}-${p.id}`,
          source: `phase-${phases[i - 1].id}`,
          target: phaseId,
          animated: true,
          style: { stroke: "var(--color-primary)", strokeWidth: 2 },
        });
      }
      items.forEach((it: any, idx: number) => {
        const itemId = `item-${it.id}`;
        nodes.push({
          id: itemId,
          type: "publicSchedule",
          position: { x, y: 175 + idx * 210 },
          draggable: false,
          data: { kind: "item", title: it.title, item: it, onSchedule: openRequest },
        });
        edges.push({
          id: `edge-${phaseId}-${itemId}`,
          source: phaseId,
          sourceHandle: "items",
          target: itemId,
          style: { stroke: "var(--color-border)", strokeWidth: 1.5 },
        });
      });
      x += 340;
    });
    return { mapNodes: nodes, mapEdges: edges };
  }, [data]);

  const openRequest = (item: any) => {
    setRequestItem(item);
    setRequestDate(item.planned_date ?? "");
    setRequestTime("09:00");
  };

  const sendRequest = async () => {
    if (!requestDate) return toast.error("Escolha uma data");
    if (!requestName.trim()) return toast.error("Informe seu nome");
    setSending(true);
    const { error } = await supabase.rpc("request_schedule_visit" as any, {
      _token: token,
      _item_id: requestItem.id,
      _date: requestDate,
      _time: requestTime,
      _name: requestName.trim(),
    } as any);
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success("Data enviada! Aguarde a confirmação da equipe.");
    setRequestItem(null);
    await load();
  };

  const load = async () => {
    if (!token) return;
    setLoading(true);
    const { data: res, error } = await supabase.rpc("get_schedule_by_token", { _token: token });
    if (error) toast.error(error.message);

    const typedRes = res as any;
    if (typedRes && typedRes.phases) {
      typedRes.phases.sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
      typedRes.phases.forEach((p: any) => {
        if (p.items) {
          p.items.sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
        }
      });
    }
    setData(typedRes);
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  const accept = async () => {
    if (!name.trim()) return toast.error("Informe seu nome");
    setAccepting(true);
    const ip = await fetch("https://api.ipify.org?format=json").then((r) => r.json()).then((d) => d.ip).catch(() => null);
    const { error } = await supabase.rpc("accept_schedule_by_token", { _token: token, _name: name.trim(), _ip: ip });
    if (error) { toast.error(error.message); setAccepting(false); return; }
    toast.success("Cronograma aceito!");
    await load();
    setAccepting(false);
  };

  if (loading) return <div className="p-10 text-sm text-muted-foreground">Carregando…</div>;
  if (!data || !data.schedule) return <div className="p-10 text-sm">Cronograma não encontrado.</div>;

  const { schedule, phases } = data;

  const canSchedule = (it: any) => it.status !== "done" && it.status !== "not_applicable";
  const scheduleLabel = (it: any) =>
    it.approval_status === "pending" || it.scheduled_date ? "Trocar data" : "Agendar data";

  const ItemBadges = ({ it }: { it: any }) => (
    <>
      {it.approval_status === "pending" && (
        <Badge variant="outline" className="mt-1 gap-1 text-[10px]">
          <Clock3 className="h-3 w-3" /> Aguardando confirmação da equipe
        </Badge>
      )}
      {it.approval_status === "approved" && it.scheduled_date && (
        <Badge variant="success" className="mt-1 gap-1 text-[10px]">
          <CheckCircle2 className="h-3 w-3" /> Data confirmada
        </Badge>
      )}
      {it.approval_status === "rejected" && (
        <Badge variant="destructive" className="mt-1 gap-1 text-[10px]">
          Data recusada — escolha outra
        </Badge>
      )}
    </>
  );

  const ItemDates = ({ it }: { it: any }) => (
    <>
      {it.scheduled_date && (
        <div className="text-xs text-muted-foreground">
          Visita agendada: {format(new Date(it.scheduled_date), "dd/MM/yyyy 'às' HH:mm")}
        </div>
      )}
      {it.planned_date && !it.scheduled_date && (
        <div className="text-xs text-muted-foreground">
          Previsto: {format(new Date(it.planned_date), "dd/MM/yyyy")}
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <SEO title={`Cronograma — ${schedule.client_name}`}
        description={`Cronograma de implantação ERP USE para ${schedule.client_name}.`}
        path={`/c/${token}`} />
      <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <img src={logoAsset.url} alt="Use Sistemas" className="h-7 w-auto" />
          <span className="font-semibold tracking-tight">TreinaCheck · Cronograma</span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{schedule.client_name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Início: {format(new Date(schedule.start_date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
              {" · "}{schedule.modality}{" · "}{schedule.cadence}
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-border p-1 self-start">
            <Button size="sm" variant={view === "lista" ? "default" : "ghost"} className="h-8 gap-1.5 text-xs" onClick={() => setView("lista")}>
              <List className="h-3.5 w-3.5" /> Lista
            </Button>
            <Button size="sm" variant={view === "mapa" ? "default" : "ghost"} className="h-8 gap-1.5 text-xs" onClick={() => setView("mapa")}>
              <Network className="h-3.5 w-3.5" /> Organograma
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          Para escolher a data de uma etapa, use o botão <strong>Agendar data</strong> em cada etapa. A equipe Use Sistemas confirma a data em seguida.
        </div>

        {view === "lista" && phases.map((p: any, i: number) => (
          <Card key={p.id}>
            <CardContent className="p-4 space-y-2">
              <h2 className="font-semibold">{String(i + 1).padStart(2, "0")}. {p.title}</h2>
              <ul className="space-y-1.5">
                {p.items.map((it: any) => (
                  <li key={it.id} className="flex flex-col gap-2 border-b border-border/40 pb-2 text-sm last:border-0 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-1 items-start gap-2">
                      <span className="text-muted-foreground">›</span>
                      <div className="min-w-0">
                        <div>{it.title}</div>
                        <ItemDates it={it} />
                        <ItemBadges it={it} />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:pl-2">
                      {canSchedule(it) && (
                        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => openRequest(it)}>
                          <CalendarPlus className="h-3.5 w-3.5" />
                          {scheduleLabel(it)}
                        </Button>
                      )}
                      <span className={`text-[10px] px-2 py-1 rounded shrink-0 ${STATUS_COLORS[it.status]}`}>
                        {STATUS_LABELS[it.status]}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}

        {view === "mapa" && (
          <div className="-mx-4 sm:mx-0">
            <div className="h-[72vh] min-h-[420px] overflow-hidden border-y border-border bg-card/30 sm:rounded-xl sm:border">
              <ReactFlow
                nodes={mapNodes}
                edges={mapEdges}
                nodeTypes={publicNodeTypes}
                defaultViewport={{ x: 16, y: 18, zoom: 0.8 }}
                minZoom={0.2}
                maxZoom={1.4}
                nodesDraggable={false}
                nodesConnectable={false}
                panOnScroll
                zoomOnDoubleClick={false}
                fitView
                fitViewOptions={{ padding: 0.15, maxZoom: 0.9 }}
              >
                <Background color="var(--color-border)" gap={24} size={1} />
                <Controls showInteractive={false} />
                <MiniMap
                  className="!hidden !border !border-border !bg-card sm:!block"
                  nodeColor={(n) => (n.data?.kind === "phase" ? "var(--color-primary)" : "var(--color-muted)")}
                  maskColor="color-mix(in oklch, var(--color-background) 72%, transparent)"
                  pannable
                  zoomable
                />
              </ReactFlow>
            </div>
            <p className="px-4 pt-2 text-[11px] text-muted-foreground sm:px-0">
              Arraste para navegar, use a rolagem para mover e os controles para aproximar ou afastar.
            </p>
          </div>
        )}

        {schedule.observations && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2">Observações</h3>
              <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">{schedule.observations}</pre>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 space-y-3">
            {schedule.accepted_at ? (
              <div className="text-emerald-600 dark:text-emerald-300 text-sm">
                ✓ Cronograma aceito por <strong>{schedule.accepted_by}</strong> em{" "}
                {format(new Date(schedule.accepted_at), "dd/MM/yyyy HH:mm")}
              </div>
            ) : (
              <>
                <h3 className="font-semibold">Aceite do cronograma</h3>
                <p className="text-sm text-muted-foreground">Confirme o recebimento e aceite as etapas planejadas.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input placeholder="Seu nome completo" value={name} onChange={(e) => setName(e.target.value)} />
                  <Button onClick={accept} disabled={accepting}>
                    {accepting ? "Confirmando…" : "Aceitar cronograma"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={Boolean(requestItem)} onOpenChange={(open) => !open && setRequestItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agendar visita</DialogTitle>
            <DialogDescription>{requestItem?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="req-date">Data</Label>
                <Input id="req-date" type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-time">Horário</Label>
                <Input id="req-time" type="time" value={requestTime} onChange={(e) => setRequestTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-name">Seu nome</Label>
              <Input id="req-name" placeholder="Quem está solicitando" value={requestName} onChange={(e) => setRequestName(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              A data fica registrada como solicitação e passa por confirmação da equipe Use Sistemas.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestItem(null)}>Cancelar</Button>
            <Button onClick={sendRequest} disabled={sending}>{sending ? "Enviando…" : "Enviar data"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
