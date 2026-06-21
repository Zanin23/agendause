import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";
import { STATUS_LABELS } from "@/lib/schedule";

export default function SchedulePrint() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from("implementation_schedules").select("*").eq("id", id).single();
      const { data: ps } = await supabase.from("schedule_phases").select("*").eq("schedule_id", id).order("position");
      const phaseIds = (ps || []).map((p: any) => p.id);
      const { data: its } = phaseIds.length
        ? await supabase.from("schedule_items").select("*").in("phase_id", phaseIds).order("position")
        : { data: [] };
      const byPhase: Record<string, any[]> = {};
      (its || []).forEach((it: any) => { (byPhase[it.phase_id] ||= []).push(it); });
      setData({ schedule: s, phases: (ps || []).map((p: any) => ({ ...p, items: byPhase[p.id] || [] })) });
      setTimeout(() => window.print(), 500);
    })();
  }, [id]);

  if (!data) return <div className="p-10 text-sm text-muted-foreground">Carregando…</div>;
  const { schedule, phases } = data;

  return (
    <div className="min-h-screen bg-white text-black p-8 print:p-0">
      <SEO title={`Cronograma — ${schedule.client_name}`} description="Cronograma de implantação ERP USE." path={`/cronogramas/${id}/imprimir`} />
      <style>{`@media print { @page { size: A4; margin: 14mm; } body { background: white; } .no-print { display: none } }`}</style>
      <div className="max-w-[210mm] mx-auto space-y-4">
        <header className="flex items-start justify-between border-b border-black/20 pb-4">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wide">Cronograma de Implantação</h1>
            <p className="text-sm text-black/70">Planejamento e execução das etapas de implantação do sistema USE</p>
            <div className="mt-3 text-sm">
              <div><strong>Cliente:</strong> {schedule.client_name}</div>
              <div><strong>Início:</strong> {format(new Date(schedule.start_date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}</div>
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
                      <div>{it.title}</div>
                      <div className="text-[11px] text-black/60">
                        {it.planned_date && <>Previsto: {format(new Date(it.planned_date), "dd/MM/yyyy")} · </>}
                        Status: {STATUS_LABELS[it.status] || it.status}
                        {it.assignee && <> · Resp.: {it.assignee}</>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {schedule.observations && (
          <section className="pt-4 border-t border-black/20">
            <h2 className="font-bold uppercase text-sm mb-2">Observações</h2>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{schedule.observations}</pre>
          </section>
        )}

        {schedule.accepted_at && (
          <footer className="pt-6 mt-6 border-t border-black/20 text-sm">
            ✓ Aceito por <strong>{schedule.accepted_by}</strong> em {format(new Date(schedule.accepted_at), "dd/MM/yyyy HH:mm")}
          </footer>
        )}

        <div className="no-print pt-4">
          <button onClick={() => window.print()} className="text-sm underline">Imprimir novamente</button>
        </div>
      </div>
    </div>
  );
}