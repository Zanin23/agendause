import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  addDays,
  addWeeks,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Printer, ChevronLeft, ChevronRight, X, Layers, FileDown } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import useLogo from "@/assets/logo-use-sistemas-v2.png.asset.json";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

type Training = {
  id: string;
  title: string;
  client: string | null;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  status: "agendado" | "realizado" | "reagendado" | "cancelado" | "concluido";
  cancellation_reason?: string | null;
  confirmed_at?: string | null;
};

const DAY_LABELS = ["SEG", "TER", "QUA", "QUI", "SEX"];
const ORANGE = "#F26B1F";
const BLUE = "#6F7FB8";
const RED = "#E22B2B";
const GREEN = "#1F9D55";

const PrintAgenda = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [rescheduleData, setRescheduleData] = useState<{
    training: Training;
    newDay: Date;
  } | null>(null);
  const [newTime, setNewTime] = useState<string>("09:00");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportPDF = async () => {
    const el = document.querySelector(".agenda-page") as HTMLElement | null;
    if (!el) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 6;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      pdf.addImage(imgData, "PNG", (pageW - w) / 2, (pageH - h) / 2, w, h);
      pdf.save(`agenda-${format(weekStart, "yyyy-MM-dd")}.pdf`);
    } catch (e) {
      toast({ title: "Erro ao gerar PDF", description: String(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    (async () => {
      const [{ data }, { data: ua }, { data: ga }] = await Promise.all([
        supabase.from("trainings").select("*").order("scheduled_at", { ascending: true }),
        supabase.from("training_acceptances").select("training_id"),
        supabase.from("guest_acceptances").select("training_id"),
      ]);
      setTrainings((data as Training[]) || []);
      const ids = new Set<string>();
      ((ua as any[]) || []).forEach((r) => ids.add(r.training_id));
      ((ga as any[]) || []).forEach((r) => ids.add(r.training_id));
      setConfirmedIds(ids);
    })();
  }, []);

  const toggleConfirm = async (t: Training) => {
    const isConfirmed = !!t.confirmed_at;
    const patch = isConfirmed
      ? { confirmed_at: null, confirmed_by: null }
      : { confirmed_at: new Date().toISOString(), confirmed_by: user?.id ?? null };
    const { error } = await supabase.from("trainings").update(patch).eq("id", t.id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return;
    }
    setTrainings((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } as Training : x)));
    toast({ title: isConfirmed ? "Confirmação removida" : "Agendamento confirmado" });
  };

  const weekDays = useMemo(
    () => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const eventsByDay = useMemo(() => {
    return weekDays.map((day) =>
      trainings
        .filter((t) => isSameDay(new Date(t.scheduled_at), day))
        .sort(
          (a, b) =>
            new Date(a.scheduled_at).getTime() -
            new Date(b.scheduled_at).getTime()
        )
    );
  }, [weekDays, trainings]);

  const weekLabel = `${format(weekStart, "d MMM", { locale: ptBR })} – ${format(
    endOfWeek(weekStart, { weekStartsOn: 1 }),
    "d MMM yyyy",
    { locale: ptBR }
  )}`;

  const handleDropOnDay = (day: Date) => {
    if (!dragId) return;
    const training = trainings.find((t) => t.id === dragId);
    setDragId(null);
    setDropTarget(null);
    if (!training) return;
    const original = new Date(training.scheduled_at);
    setNewTime(format(original, "HH:mm"));
    setRescheduleData({ training, newDay: day });
  };

  const confirmReschedule = async () => {
    if (!rescheduleData) return;
    setSaving(true);
    const [h, m] = newTime.split(":").map(Number);
    const newDate = new Date(rescheduleData.newDay);
    newDate.setHours(h || 0, m || 0, 0, 0);
    const { error } = await supabase
      .from("trainings")
      .update({ scheduled_at: newDate.toISOString() })
      .eq("id", rescheduleData.training.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao reagendar", description: error.message, variant: "destructive" });
      return;
    }
    setTrainings((prev) =>
      prev.map((t) =>
        t.id === rescheduleData.training.id
          ? { ...t, scheduled_at: newDate.toISOString() }
          : t
      )
    );
    toast({ title: "Visita reagendada", description: format(newDate, "d MMM 'às' HH:mm", { locale: ptBR }) });
    setRescheduleData(null);
  };

  return (
    <div className="min-h-screen bg-white text-black">
      <SEO
        title="Imprimir agenda — TreinaCheck"
        description="Visualize e exporte a agenda semanal de treinamentos em PDF ou para impressão."
        path="/agenda/imprimir"
      />
      <style>{`
        .agenda-title { font-family: 'Clash Display', 'Archivo', sans-serif; font-weight: 700; letter-spacing: -0.02em; }
        .agenda-sub { font-family: 'Clash Display', 'Archivo', sans-serif; font-weight: 600; font-style: italic; }
        .day-head { font-family: 'Clash Display', 'Archivo', sans-serif; font-weight: 700; letter-spacing: 0.01em; }
        @media print {
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 6mm; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          html, body { height: auto !important; }
          .agenda-page {
            padding: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            height: 195mm !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
          }
          .agenda-header { margin-bottom: 4mm !important; }
          .agenda-title-print { font-size: 36pt !important; line-height: 0.95 !important; }
          .agenda-sub-print { font-size: 13pt !important; margin-top: 0 !important; }
          .agenda-note-print { font-size: 7pt !important; margin-top: 1mm !important; }
          .agenda-legend-print { font-size: 9pt !important; gap: 2px !important; }
          .agenda-layers-print { width: 140px !important; height: 140px !important; }
          .agenda-grid {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            gap: 2mm !important;
          }
          .agenda-day {
            min-height: 0 !important;
            height: 100% !important;
            border-width: 2px !important;
            overflow: hidden !important;
          }
          .agenda-day .day-head {
            font-size: 16pt !important;
            padding: 1mm 2mm !important;
            border-bottom-width: 2px !important;
          }
          .agenda-day-body { padding: 1.5mm !important; gap: 1.5mm !important; }
          .agenda-event { padding: 1mm 1.5mm !important; font-size: 8pt !important; line-height: 1.15 !important; border-width: 1px !important; }
          .agenda-event .agenda-event-title { font-size: 8.5pt !important; }
          .agenda-event .agenda-event-meta { font-size: 7pt !important; }
          .agenda-event-extra { font-size: 7pt !important; }
          .agenda-tip { display: none !important; }
        }
      `}</style>

      <div className="no-print border-b border-neutral-200">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <BackButton to="/" label="Voltar" />

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart((d) => addWeeks(d, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
              }
              title="Voltar para a semana atual"
            >
              {(() => {
                const thisMon = startOfWeek(new Date(), { weekStartsOn: 1 });
                const diff = Math.round(
                  (weekStart.getTime() - thisMon.getTime()) / (7 * 24 * 60 * 60 * 1000)
                );
                if (diff === 0) return "Esta semana";
                if (diff === -1) return "Semana passada";
                if (diff === 1) return "Próxima semana";
                if (diff < -1) return `Há ${Math.abs(diff)} semanas`;
                return `Em ${diff} semanas`;
              })()}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart((d) => addWeeks(d, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm text-neutral-600 ml-3 capitalize">
              {weekLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportPDF} disabled={exporting}>
              <FileDown className="h-4 w-4" />
              {exporting ? "Gerando..." : "Exportar PDF"}
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
          </div>
        </div>
      </div>

      <main className="agenda-page max-w-[1200px] mx-auto px-8 py-8">
        {/* Header */}
        <header className="agenda-header flex items-start justify-between gap-8 mb-6">
          <div className="min-w-0">
            <h1 className="agenda-title agenda-title-print text-[64px] leading-[0.95] uppercase">
              Agenda Semanal
            </h1>
            <p
              className="agenda-sub agenda-sub-print text-[22px] mt-1"
              style={{ color: ORANGE }}
            >
              visitas, reuniões e configurações internas
            </p>
            <p className="agenda-note-print text-[11px] text-neutral-600 mt-1">
              *Algumas visitas podem ainda não terem sido confirmadas, agenda
              pode mudar
            </p>
            <div className="agenda-legend-print mt-3">
              <Legend />
            </div>
          </div>

          <div className="agenda-legend-print flex items-center gap-6 pt-2 shrink-0">
            <img
              src={useLogo.url}
              alt="Use Sistemas"
              className="agenda-layers-print h-60 w-60 shrink-0 object-contain"
            />
          </div>
        </header>

        {/* Week grid */}
        <div className="agenda-grid grid grid-cols-5 gap-3">
          {weekDays.map((day, idx) => {
            const events = eventsByDay[idx];
            const isToday = isSameDay(day, new Date());
            const isOver = dropTarget === idx;
            return (
              <div
                key={idx}
                className="agenda-day border-[3px] rounded-md flex flex-col transition-colors"
                style={{
                  borderColor: isOver ? BLUE : ORANGE,
                  minHeight: 520,
                  background: isOver ? "#EEF1FB" : "transparent",
                }}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dropTarget !== idx) setDropTarget(idx);
                }}
                onDragLeave={() => {
                  if (dropTarget === idx) setDropTarget(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDropOnDay(day);
                }}
              >
                <div
                  className="day-head bg-pattern-hex-light text-[28px] px-3 pt-2 pb-2 border-b-[3px]"
                  style={{ borderColor: ORANGE, color: isToday ? ORANGE : "#111" }}
                >
                  {format(day, "dd")} {DAY_LABELS[idx]}
                </div>
                <div className="agenda-day-body p-2 space-y-2 flex-1 overflow-hidden">
                  {(() => {
                    const morning = events.filter(
                      (e) => new Date(e.scheduled_at).getHours() < 12
                    );
                    const afternoon = events.filter(
                      (e) => new Date(e.scheduled_at).getHours() >= 12
                    );
                    const renderCard = (t: Training) => (
                      <EventCard
                        key={t.id}
                        t={t}
                        confirmed={confirmedIds.has(t.id)}
                        onToggleConfirm={() => toggleConfirm(t)}
                        onDragStart={() => setDragId(t.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setDropTarget(null);
                        }}
                        onOpen={() => navigate(`/treinamento/${t.id}`)}
                      />
                    );
                    return (
                      <>
                        <div
                          className="agenda-period-label text-[10px] font-bold uppercase tracking-wider px-1 pt-0.5 pb-1"
                          style={{ color: ORANGE }}
                        >
                          Manhã
                        </div>
                        <div className="space-y-2">
                          {morning.length === 0 ? (
                            <div className="text-[10px] text-neutral-400 italic px-1">
                              —
                            </div>
                          ) : (
                            morning.map(renderCard)
                          )}
                        </div>
                        <div
                          className="agenda-period-divider border-t border-dashed mt-2 pt-1"
                          style={{ borderColor: ORANGE }}
                        />
                        <div
                          className="agenda-period-label text-[10px] font-bold uppercase tracking-wider px-1 pb-1"
                          style={{ color: ORANGE }}
                        >
                          Tarde
                        </div>
                        <div className="space-y-2">
                          {afternoon.length === 0 ? (
                            <div className="text-[10px] text-neutral-400 italic px-1">
                              —
                            </div>
                          ) : (
                            afternoon.map(renderCard)
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
        <p className="agenda-tip no-print text-[11px] text-neutral-500 mt-3">
          Dica: arraste uma visita para outro dia para reagendar.
        </p>
      </main>

      <Dialog open={!!rescheduleData} onOpenChange={(o) => !o && setRescheduleData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reagendar visita</DialogTitle>
          </DialogHeader>
          {rescheduleData && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <div className="font-medium text-foreground">
                  {rescheduleData.training.client?.trim() || rescheduleData.training.title}
                </div>
                <div>
                  Novo dia:{" "}
                  <span className="capitalize text-foreground">
                    {format(rescheduleData.newDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newTime">Novo horário</Label>
                <Input
                  id="newTime"
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleData(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={confirmReschedule} disabled={saving}>
              {saving ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const EventCard = ({
  t,
  confirmed,
  onToggleConfirm,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  t: Training;
  confirmed: boolean;
  onToggleConfirm: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) => {
  const hour = format(new Date(t.scheduled_at), "HH:mm");
  const label = t.client?.trim() ? t.client : t.title;
  const isDone = t.status === "realizado" || t.status === "concluido";
  const isResched = t.status === "reagendado";
  const isCancelled = t.status === "cancelado";
  const borderColor = isCancelled ? RED : isDone ? BLUE : ORANGE;
  const showConfirmation = !isCancelled;
  const teamConfirmed = !!t.confirmed_at;
  return (
    <div
      className="block cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", t.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      role="button"
      tabIndex={0}
    >
      <div
        className="agenda-event border-2 rounded-sm px-2.5 py-2 text-[13px] leading-snug bg-white hover:bg-orange-50/40 transition-colors"
        style={{
          borderColor,
          background: isCancelled ? "#FDECEC" : isDone ? "#EEF1FB" : "white",
        }}
      >
        <div className="flex items-start gap-1.5">
          {isDone && (
            <span
              className="font-bold text-[15px] leading-none mt-0.5"
              style={{ color: BLUE }}
              aria-label="Realizado"
            >
              *
            </span>
          )}
          {isResched && (
            <X
              className="h-3.5 w-3.5 mt-0.5 shrink-0"
              style={{ color: RED }}
              strokeWidth={3}
              aria-label="Reagendado"
            />
          )}
          {isCancelled && (
            <X
              className="h-4 w-4 mt-0.5 shrink-0"
              style={{ color: RED }}
              strokeWidth={3.5}
              aria-label="Cancelado"
            />
          )}
          <span
            className="agenda-event-title font-semibold"
            style={{
              color: isCancelled ? RED : isDone ? BLUE : "#000",
              textDecoration: isCancelled ? "line-through" : "none",
            }}
          >
            {hour} - {label}
          </span>
        </div>
        {t.client?.trim() && t.title && t.client.trim() !== t.title && (
          <div
            className="agenda-event-extra text-[10.5px] mt-0.5 text-neutral-700 truncate"
            style={{ color: isCancelled ? RED : "#444" }}
          >
            {t.title}
          </div>
        )}
        <div
          className="agenda-event-meta text-[10px] mt-0.5 text-neutral-600 flex flex-wrap gap-x-2"
          style={{ color: isCancelled ? RED : "#555" }}
        >
          <span>{t.duration_minutes} min</span>
          {t.location && <span>• {t.location}</span>}
        </div>
        {isResched && t.description && (
          <div
            className="text-[10px] mt-0.5 flex items-center gap-1"
            style={{ color: RED }}
          >
            <X className="h-2.5 w-2.5" strokeWidth={3} />
            {t.description}
          </div>
        )}
        {isCancelled && t.cancellation_reason && (
          <div
            className="text-[10px] mt-0.5 italic"
            style={{ color: RED }}
          >
            Cancelado: {t.cancellation_reason}
          </div>
        )}
        {showConfirmation && !isDone && (
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {!teamConfirmed && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide border"
                style={
                  confirmed
                    ? { color: GREEN, borderColor: GREEN, background: "#EAF7EF" }
                    : { color: "#9A6B00", borderColor: "#E0B84A", background: "#FFF7E0" }
                }
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: confirmed ? GREEN : "#E0B84A" }}
                />
                {confirmed ? "Confirmada" : "Pendente"}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleConfirm();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              draggable={false}
              className="no-print inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[9px] font-semibold uppercase tracking-wide border transition-colors"
              style={
                teamConfirmed
                  ? { color: GREEN, borderColor: GREEN, background: "white" }
                  : { color: "white", borderColor: ORANGE, background: ORANGE }
              }
              title={teamConfirmed ? "Clique para desfazer a confirmação interna" : "Confirmar agendamento com o cliente"}
            >
              {teamConfirmed ? "✓ Confirmado" : "Confirmar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const Legend = () => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
    <div className="flex items-center gap-2">
      <span
        className="w-4 h-4 rounded-full inline-block"
        style={{ background: ORANGE }}
      />
      <span>Agendado</span>
    </div>
    <div className="flex items-center gap-2">
      <span
        className="w-4 text-center font-bold leading-none"
        style={{ color: BLUE }}
      >
        *
      </span>
      <span>Realizado</span>
    </div>
    <div className="flex items-center gap-2">
      <X className="w-4 h-4" style={{ color: RED }} strokeWidth={3} />
      <span>Reagendado</span>
    </div>
    <div className="flex items-center gap-2">
      <span
        className="w-4 h-4 rounded-sm inline-block border-2"
        style={{ background: "#FDECEC", borderColor: RED }}
      />
      <span>Cancelado</span>
    </div>
    <div className="flex items-center gap-2">
      <span
        className="w-2 h-2 rounded-full inline-block"
        style={{ background: GREEN }}
      />
      <span>Confirmada</span>
    </div>
    <div className="flex items-center gap-2">
      <span
        className="w-2 h-2 rounded-full inline-block"
        style={{ background: "#E0B84A" }}
      />
      <span>Pendente</span>
    </div>
  </div>
);

export default PrintAgenda;