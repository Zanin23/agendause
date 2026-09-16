import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";
import { STATUS_LABELS } from "@/lib/schedule";
import { useSearchParams } from "react-router-dom";

// Datas "YYYY-MM-DD" precisam ser lidas como locais, senão o fuso puxa um dia pra trás
function fmtDate(value?: string | null, pattern = "dd/MM/yyyy") {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (isNaN(d.getTime())) return "";
  return format(d, pattern, { locale: ptBR });
}

export default function SchedulePrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const showDates = searchParams.get("dates") !== "false";
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from("implementation_schedules").select("*").eq("id", id).single();
      const { data: ps } = await supabase.from("schedule_phases").select("*").eq("schedule_id", id).order("position", { ascending: true });
      const phaseIds = (ps || []).map((p: any) => p.id);
      const { data: its } = phaseIds.length
        ? await supabase.from("schedule_items")
            .select("*, trainings(scheduled_at)")
            .in("phase_id", phaseIds)
            .order("position", { ascending: true })
        : { data: [] };
      
      const byPhase: Record<string, any[]> = {};
      (its || []).forEach((it: any) => { 
        (byPhase[it.phase_id] ||= []).push(it); 
      });
      
      // Secondary sort in JS to ensure items are perfectly ordered within each phase
      Object.keys(byPhase).forEach(phaseId => {
        byPhase[phaseId].sort((a, b) => (a.position || 0) - (b.position || 0));
      });

      const sortedPhases = (ps || []).sort((a: any, b: any) => (a.position || 0) - (b.position || 0));

      setData({ 
        schedule: s, 
        phases: sortedPhases.map((p: any) => ({ 
          ...p, 
          items: byPhase[p.id] || [] 
        })) 
      });
    })();
  }, [id]);

  if (!data) return <div className="p-10 text-sm text-muted-foreground">Carregando…</div>;
  const { schedule, phases } = data;

  return (
    <div className="min-h-screen bg-white text-black p-8 print:p-0">
      <SEO title={`Cronograma — ${schedule.client_name}`} description="Cronograma de implantação ERP USE." path={`/cronogramas/${id}/imprimir`} />
      <style>{`@media print { @page { size: A4; margin: 14mm; } body { background: white; } .no-print { display: none } }`}</style>
      <div className="no-print max-w-[210mm] mx-auto mb-4 flex items-center justify-between">
        <BackButton to={`/cronogramas/${id}`} />
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" /> Imprimir / Salvar PDF
        </Button>
      </div>
      <div className="max-w-[210mm] mx-auto space-y-4">
        <header className="flex items-start justify-between border-b border-black/20 pb-4">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wide">Cronograma de Implantação</h1>
            <p className="text-sm text-black/70">Planejamento e execução das etapas de implantação do sistema USE</p>
            <div className="mt-3 text-sm">
              <div><strong>Cliente:</strong> {schedule.client_name}</div>
              {showDates && schedule.start_date && <div><strong>Início:</strong> {fmtDate(schedule.start_date, "d 'de' MMMM 'de' yyyy")}</div>}
              
              <div><strong>Modalidade:</strong> {schedule.modality} · <strong>Cadência:</strong> {schedule.cadence}</div>
              {schedule.use_team?.length > 0 && <div><strong>Equipe Use Sistemas:</strong> {schedule.use_team.join(", ")}</div>}
            </div>
          </div>
          <img src={logoAsset.url} alt="Use Sistemas" className="h-16 w-auto" />
        </header>

        <div className="space-y-3">
          {phases.map((p: any, i: number) => (
            <section key={p.id} className="border border-black/20 rounded">
              <header className="bg-black/5 px-3 py-2 font-semibold text-sm flex justify-between">
                <span>{String(i + 1).padStart(2, "0")}. {p.title}</span>
              </header>
              <ul className="px-3 py-2 space-y-1 text-sm">
                {p.items.map((it: any) => (
                  <li key={it.id} className="flex items-start gap-2">
                    <span className="text-black/40 mt-0.5">›</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {it.title}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider ${
                          it.status === 'done' ? 'bg-emerald-100 text-emerald-700' : 
                          it.status === 'pending' ? 'bg-red-100 text-red-700' : 
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {STATUS_LABELS[it.status] || it.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-black/60">
                        {showDates && it.planned_date && (
                          <> · Previsto: {fmtDate(it.planned_date)}</>
                        )}
                        {showDates && it.trainings?.scheduled_at && (
                          <> · Visita agendada: {fmtDate(it.trainings.scheduled_at)}</>
                        )}
                        {showDates && it.done_date && <> · Concluído: {fmtDate(it.done_date)}</>}
                        {it.assignee && <> · Resp.: {it.assignee}</>}
                      </div>
                      {it.notes && (
                        <div className="mt-1 text-[11px] text-black/70 border-l-2 border-black/20 pl-2 whitespace-pre-wrap">
                          {it.notes}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {schedule.accepted_at && (
          <footer className="pt-6 mt-6 border-t border-black/20 text-sm">
            ✓ Aceito por <strong>{schedule.accepted_by}</strong> em {format(new Date(schedule.accepted_at), "dd/MM/yyyy HH:mm")}
          </footer>
        )}

      </div>
    </div>
  );
}