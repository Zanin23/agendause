import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Printer, EyeOff } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";
import { STATUS_LABELS, ehCronogramaLivre, tituloDoCronograma } from "@/lib/schedule";

type ScheduleRow = {
  id: string;
  client_name: string;
  kind?: string | null;
  title?: string | null;
  subject?: string | null;
  start_date: string | null;
  modality: string;
  cadence: string;
  use_team: string[] | null;
  observations: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
};
type ItemRow = {
  id: string;
  phase_id: string;
  position: number | null;
  title: string;
  planned_date: string | null;
  done_date: string | null;
  status: string;
  assignee: string | null;
  notes: string | null;
  trainings: { scheduled_at: string | null } | null;
};
type PhaseRow = { id: string; position: number | null; title: string };
type PhaseComItens = PhaseRow & { items: ItemRow[] };

// Datas "YYYY-MM-DD" precisam ser lidas como locais, senão o fuso puxa um dia pra trás
function fmtDate(value?: string | null, pattern = "dd/MM/yyyy") {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (isNaN(d.getTime())) return "";
  return format(d, pattern, { locale: ptBR });
}

/* Status da etapa no papel: cor de texto e de fundo, sem depender do tema. */
const STATUS_PILL: Record<string, string> = {
  done: "bg-emerald-100 text-emerald-800",
  in_progress: "bg-sky-100 text-sky-800",
  pending: "bg-red-100 text-red-800",
  blocked: "bg-red-100 text-red-800",
  rescheduled: "bg-amber-100 text-amber-900",
  not_applicable: "bg-gray-200 text-gray-700",
};

/**
 * A impressão lê sempre do banco no momento em que abre, para o papel nunca
 * mostrar etapa que já saiu do cronograma. Etapas "não aplicável" ficam fora
 * do PDF (a não ser que se peça o contrário em `?na=mostrar`), porque o papel
 * é o que vai para o cliente.
 */
export default function SchedulePrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const showDates = searchParams.get("dates") !== "false";
  const mostrarNaoAplicavel = searchParams.get("na") === "mostrar";
  const [schedule, setSchedule] = useState<ScheduleRow | null>(null);
  const [phases, setPhases] = useState<PhaseComItens[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [carregadoEm, setCarregadoEm] = useState<Date | null>(null);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const { data: s } = await supabase
        .from("implementation_schedules")
        .select("*")
        .eq("id", id)
        .single();
      const { data: ps } = await supabase
        .from("schedule_phases")
        .select("*")
        .eq("schedule_id", id)
        .order("position", { ascending: true });
      const phaseIds = (ps || []).map((p) => p.id);
      const { data: its } = phaseIds.length
        ? await supabase
            .from("schedule_items")
            .select("*, trainings(scheduled_at)")
            .in("phase_id", phaseIds)
            .order("position", { ascending: true })
        : { data: [] as ItemRow[] };
      if (cancelado) return;

      const byPhase: Record<string, ItemRow[]> = {};
      ((its || []) as unknown as ItemRow[]).forEach((it) => {
        (byPhase[it.phase_id] ||= []).push(it);
      });

      // Secondary sort in JS to ensure items are perfectly ordered within each phase
      Object.keys(byPhase).forEach((phaseId) => {
        byPhase[phaseId].sort((a, b) => (a.position || 0) - (b.position || 0));
      });

      const ordenadas = ((ps || []) as PhaseRow[])
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map((p) => ({ ...p, items: byPhase[p.id] || [] }))
        .filter((p) => mostrarNaoAplicavel || p.items.some((it) => it.status !== "not_applicable"));

      setSchedule((s as ScheduleRow) ?? null);
      setPhases(ordenadas);
      setCarregadoEm(new Date());
      setCarregado(true);
    })();
    return () => { cancelado = true; };
  }, [id, mostrarNaoAplicavel]);

  const totais = useMemo(() => {
    const itens = phases.flatMap((p) => p.items).filter((it) => it.status !== "not_applicable");
    return { total: itens.length, done: itens.filter((it) => it.status === "done").length };
  }, [phases]);

  if (!carregado) return <div className="p-10 text-sm text-muted-foreground">Carregando…</div>;
  if (!schedule) return <div className="p-10 text-sm">Cronograma não encontrado.</div>;

  const livre = ehCronogramaLivre(schedule);
  const nome = tituloDoCronograma(schedule);
  const alternar = () =>
    navigate(
      `/cronogramas/${id}/imprimir?${new URLSearchParams({
        ...(showDates ? {} : { dates: "false" }),
        ...(mostrarNaoAplicavel ? {} : { na: "mostrar" }),
      }).toString()}`,
    );

  return (
    <div className="min-h-screen bg-white text-black p-8 print:p-0">
      <SEO title={`Cronograma — ${nome}`} description={livre ? "Cronograma de atividades." : "Cronograma de implantação ERP USE."} path={`/cronogramas/${id}/imprimir`} />
      <style>{`@media print { @page { size: A4; margin: 14mm; } body { background: white; } .no-print { display: none } }`}</style>
      <div className="no-print max-w-[210mm] mx-auto mb-4 flex flex-wrap items-center justify-between gap-2">
        <BackButton to={`/cronogramas/${id}`} />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={alternar}>
            <EyeOff className="h-4 w-4 mr-2" />
            {mostrarNaoAplicavel ? "Esconder “não aplicável”" : "Mostrar “não aplicável”"}
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Imprimir / Salvar PDF
          </Button>
        </div>
      </div>
      <div className="no-print max-w-[210mm] mx-auto mb-3 text-[11px] text-black/50">
        Conteúdo lido do cronograma{carregadoEm ? ` às ${format(carregadoEm, "dd/MM/yyyy HH:mm")}` : ""} — etapa removida do
        cronograma não aparece aqui. Etapas “não aplicável” ficam fora do PDF.
      </div>
      <div className="max-w-[210mm] mx-auto space-y-4">
        <header className="flex items-start justify-between border-b border-black/20 pb-4">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wide">
              {livre ? `Cronograma${schedule.subject ? ` de ${schedule.subject}` : ""}` : "Cronograma de Implantação"}
            </h1>
            <p className="text-sm text-black/70">
              {livre
                ? "Planejamento e acompanhamento das atividades"
                : "Planejamento e execução das etapas de implantação do sistema USE"}
            </p>
            <div className="mt-3 text-sm">
              {livre ? (
                <div><strong>Cronograma:</strong> {nome}</div>
              ) : (
                <div><strong>Cliente:</strong> {nome}</div>
              )}
              {showDates && schedule.start_date && <div><strong>Início:</strong> {fmtDate(schedule.start_date, "d 'de' MMMM 'de' yyyy")}</div>}
              {!livre && (
                <div><strong>Modalidade:</strong> {schedule.modality} · <strong>Cadência:</strong> {schedule.cadence}</div>
              )}
              {(schedule.use_team?.length ?? 0) > 0 && <div><strong>{livre ? "Responsáveis" : "Equipe Use Sistemas"}:</strong> {schedule.use_team!.join(", ")}</div>}
              {livre && schedule.observations && <div className="text-black/70">{schedule.observations}</div>}
              {totais.total > 0 && (
                <div><strong>Progresso:</strong> {totais.done}/{totais.total} etapas concluídas</div>
              )}
            </div>
          </div>
          <img src={logoAsset.url} alt="Use Sistemas" className="h-16 w-auto" />
        </header>

        <div className="space-y-3">
          {phases.map((p, i) => {
            const itens = mostrarNaoAplicavel ? p.items : p.items.filter((it) => it.status !== "not_applicable");
            return (
              <section key={p.id} className="border border-black/20 rounded print:break-inside-avoid">
                <header className="bg-black/5 px-3 py-2 font-semibold text-sm flex justify-between">
                  <span>{String(i + 1).padStart(2, "0")}. {p.title}</span>
                </header>
                <ul className="px-3 py-2 space-y-1 text-sm">
                  {itens.map((it) => (
                    <li key={it.id} className="flex items-start gap-2">
                      <span className="text-black/40 mt-0.5">›</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {it.title}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider ${
                            STATUS_PILL[it.status] || "bg-gray-100 text-gray-600"
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
            );
          })}
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
