import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  Handle,
  Position,
  NodeProps,
  Edge,
  Node
} from "reactflow";
import "reactflow/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/schedule";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ScheduleNode = ({ data }: NodeProps) => {
  return (
    <div className={`px-4 py-3 shadow-md rounded-md bg-white border-2 ${data.isPhase ? 'border-primary w-64' : 'border-border w-56'}`}>
      {data.isPhase && <Handle type="target" position={Position.Left} className="w-3 !bg-primary" />}
      {!data.isPhase && <Handle type="target" position={Position.Top} className="w-3 !bg-border" />}
      
      <div className="flex flex-col">
        <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${data.isPhase ? 'text-primary' : 'text-muted-foreground'}`}>
          {data.isPhase ? 'Fase' : 'Etapa'}
        </div>
        <div className="text-sm font-semibold truncate" title={data.title}>
          {data.title}
        </div>
        {!data.isPhase && (
          <div className="mt-2 flex flex-col gap-1">
            <div className={`text-[10px] px-1.5 py-0.5 rounded-full inline-block w-fit font-medium uppercase ${STATUS_COLORS[data.status]}`}>
              {STATUS_LABELS[data.status]}
            </div>
            {data.date && (
              <div className="text-[10px] text-muted-foreground">
                {format(new Date(data.date), "dd/MM/yyyy", { locale: ptBR })}
              </div>
            )}
          </div>
        )}
      </div>

      {data.isPhase && <Handle type="source" position={Position.Right} className="w-3 !bg-primary" />}
      {data.isPhase && <Handle type="source" position={Position.Bottom} className="w-3 !bg-primary" id="bottom" />}
    </div>
  );
};

const nodeTypes = {
  schedule: ScheduleNode,
};

export default function ScheduleVisual() {
  const { id } = useParams();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientName, setClientName] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      
      const { data: schedule } = await supabase.from("implementation_schedules").select("client_name").eq("id", id).single();
      if (schedule) setClientName(schedule.client_name);

      const { data: phases } = await supabase.from("schedule_phases").select("*").eq("schedule_id", id).order("position", { ascending: true });
      const phaseIds = (phases || []).map(p => p.id);
      
      const { data: items } = phaseIds.length 
        ? await supabase.from("schedule_items").select("*").in("phase_id", phaseIds).order("position", { ascending: true })
        : { data: [] };

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      let currentX = 50;
      const PHASE_Y = 50;
      const ITEM_Y_START = 200;
      const ITEM_X_GAP = 280;
      const PHASE_X_GAP = 300;

      (phases || []).forEach((phase, pIdx) => {
        const phaseNodeId = `phase-${phase.id}`;
        const phaseItems = (items || []).filter(it => it.phase_id === phase.id);
        
        // Phase Node
        newNodes.push({
          id: phaseNodeId,
          type: 'schedule',
          data: { title: phase.title, isPhase: true },
          position: { x: currentX, y: PHASE_Y },
        });

        // Edge between phases
        if (pIdx > 0) {
          newEdges.push({
            id: `e-phase-${pIdx}`,
            source: `phase-${phases[pIdx - 1].id}`,
            target: phaseNodeId,
            animated: true,
            sourceHandle: null,
          });
        }

        let itemYOffset = 0;
        const itemsPerColumn = 6;
        
        phaseItems.forEach((item, iIdx) => {
          const itemNodeId = `item-${item.id}`;
          const col = Math.floor(iIdx / itemsPerColumn);
          const row = iIdx % itemsPerColumn;
          
          newNodes.push({
            id: itemNodeId,
            type: 'schedule',
            data: { 
              title: item.title, 
              status: item.status, 
              date: item.done_date || item.planned_date,
              isPhase: false 
            },
            position: { 
              x: currentX + (col * 240), 
              y: ITEM_Y_START + (row * 85) 
            },
          });

          newEdges.push({
            id: `e-${phaseNodeId}-${itemNodeId}`,
            source: phaseNodeId,
            sourceHandle: 'bottom',
            target: itemNodeId,
            style: { stroke: '#94a3b8' },
          });
        });

        const numCols = Math.ceil(phaseItems.length / itemsPerColumn) || 1;
        currentX += Math.max(PHASE_X_GAP, numCols * 260);
      });

      setNodes(newNodes);
      setEdges(newEdges);
      setLoading(false);
    };

    fetchData();
  }, [id]);

  return (
    <div className="flex flex-col h-screen bg-background">
      <SEO 
        title={`Organograma — ${clientName}`} 
        description={`Visualização gráfica do cronograma de implantação para ${clientName}`}
        path={`/cronogramas/${id}/visualizar`}
      />
      <AppHeader />
      
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold">Organograma de Implantação</h1>
            <p className="text-sm text-muted-foreground">{clientName}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
            <p>Carregando organograma...</p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.2}
          >
            <Background color="#cbd5e1" gap={20} />
            <Controls />
            <MiniMap 
              nodeColor={(n) => n.data?.isPhase ? '#F97316' : '#e2e8f0'}
              maskColor="rgb(241, 245, 249, 0.7)"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
