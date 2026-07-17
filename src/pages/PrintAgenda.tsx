import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { getVisitType, VISIT_TYPES } from "@/lib/visitType";

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
  visit_type?: string | null;
};

const DAY_LABELS = ["SEG", "TER", "QUA", "QUI", "SEX"];
const ORANGE = "#F26B1F";
const BLUE = "#6F7FB8";
const RED = "#E22B2B";
const GREEN = "#1F9D55";
const INK = "#1B2340";
const CREAM = "#F7EFE1";

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
    <div className="min-h-screen" style={{ background: CREAM, color: INK }}>
      <SEO
        title="Imprimir agenda — TreinaCheck"
        description="Visualize e exporte a agenda semanal de treinamentos em PDF ou para impressão."
        path="/agenda/imprimir"
      />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        .agenda-page, .agenda-page * { font-family: 'DM Sans', sans-serif; }
        .agenda-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; letter-spacing: -0.03em; }
        .agenda-sub { font-family: 'DM Sans', sans-serif; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; }
        .day-head { font-family: 'Space Grotesk', sans-serif; font-weight: 700; letter-spacing: -0.02em; text-transform: uppercase; }
        .agenda-paper { background: #ffffff; border: 3px solid ${INK}; box-shadow: 12px 12px 0 ${INK}; border-top-right-radius: 60px; border-bottom-left-radius: 16px; }
        .agenda-event { border: 2px solid ${INK} !important; box-shadow: 4px 4px 0 ${INK}; border-top-right-radius: 12px; }
        .agenda-badge { border: 2px solid ${INK}; box-shadow: 2px 2px 0 ${INK}; font-family: 'Space Grotesk', sans-serif; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
        @media print {
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 10mm; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .agenda-page { background: white !important; }
          .agenda-paper { box-shadow: none !important; border-radius: 0 !important; }
          .agenda-event { box-shadow: 3px 3px 0 ${INK} !important; }
          .agenda-badge { box-shadow: 1.5px 1.5px 0 ${INK} !important; }
          .agenda-day { break-inside: avoid; page-break-inside: avoid; }
          .agenda-event { break-inside: avoid; page-break-inside: avoid; }
          .agenda-tip { display: none !important; }
        }
        @media (max-width: 767px) {
          .agenda-page { padding: 12px !important; }
          .agenda-paper { padding: 16px !important; box-shadow: 6px 6px 0 ${INK}; border-top-right-radius: 20px; }
          .agenda-header {
            flex-direction: column !important;
            gap: 12px !important;
            align-items: flex-start !important;
          }
          .agenda-title { font-size: 32px !important; word-break: break-word; overflow-wrap: anywhere; }
          .agenda-sub { font-size: 11px !important; word-break: break-word; }
          .agenda-layers-print { width: 80px !important; height: 80px !important; }
          .agenda-grid { grid-template-columns: 1fr !important; }
          .agenda-day { min-height: 0 !important; }
        }
      `}</style>

      <div className="no-print border-b-2" style={{ borderColor: INK, background: CREAM }}>
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3">
          <BackButton to="/" />

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
            <span className="text-sm ml-3 capitalize font-semibold" style={{ color: INK }}>
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

      <main className="agenda-page max-w-[1200px] mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <div className="agenda-paper p-6 sm:p-10 flex flex-col gap-6">
          {/* Header */}
          <header className="agenda-header flex flex-col md:flex-row md:items-end md:justify-between gap-4 md:gap-8 pb-6 border-b-[3px]" style={{ borderColor: INK }}>
            <div className="min-w-0 flex items-center gap-4">
              <div
                className="shrink-0 flex items-center justify-center"
                style={{
                  width: 56,
                  height: 56,
                  background: ORANGE,
                  border: `3px solid ${INK}`,
                  borderTopRightRadius: 16,
                  borderBottomLeftRadius: 16,
                  boxShadow: `4px 4px 0 ${INK}`,
                }}
                aria-hidden
              >
                <Layers className="h-7 w-7" style={{ color: CREAM }} strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <h1 className="agenda-title text-[40px] sm:text-[64px] leading-[0.9] uppercase break-words" style={{ color: INK }}>
                  Agenda Semanal
                </h1>
                <p className="agenda-sub text-[11px] sm:text-[13px] mt-2" style={{ color: INK }}>
                  <span style={{ color: ORANGE }}>●</span>&nbsp; {weekLabel}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-6 shrink-0">
              <div className="flex flex-col items-end gap-1 text-right">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: INK, opacity: 0.5 }}>
                  Use Sistemas
                </span>
                <span className="text-[10px] font-semibold" style={{ color: INK, opacity: 0.6 }}>
                  Documento interno
                </span>
              </div>
              <img
                src={useLogo.url}
                alt="Use Sistemas"
                className="agenda-layers-print h-20 w-20 sm:h-24 sm:w-24 shrink-0 object-contain"
              />
            </div>
          </header>

          {/* Legend + note */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: INK, opacity: 0.6 }}>
              *Algumas visitas podem ainda não terem sido confirmadas — agenda pode mudar
            </p>
            <Legend />
          </div>

          {/* Week grid */}
          <div className="agenda-grid grid grid-cols-1 sm:grid-cols-5 gap-4 sm:gap-5 mt-2">
          {weekDays.map((day, idx) => {
            const events = eventsByDay[idx];
            const isToday = isSameDay(day, new Date());
            const isOver = dropTarget === idx;
            return (
              <div
                key={idx}
                className="agenda-day flex flex-col transition-colors"
                style={{
                  minHeight: 480,
                  background: isOver ? "#EEF1FB" : "transparent",
                  borderRight: idx < 4 ? `2px solid ${INK}1A` : "none",
                  paddingRight: idx < 4 ? 12 : 0,
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
                <div className="pb-2 mb-2" style={{ borderBottom: `2px solid ${INK}` }}>
                  <div
                    className="day-head text-[22px] sm:text-[26px] leading-none"
                    style={{ color: isToday ? ORANGE : INK }}
                  >
                    {DAY_LABELS[idx]}
                  </div>
                  <div className="text-[10px] font-bold mt-1" style={{ color: INK, opacity: isToday ? 1 : 0.55 }}>
                    {format(day, "dd 'de' MMM", { locale: ptBR })}
                    {isToday && <span className="ml-2" style={{ color: ORANGE }}>• HOJE</span>}
                  </div>
                </div>
                <div className="agenda-day-body space-y-3 flex-1 overflow-hidden">
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
                          className="agenda-period-label text-[9px] font-bold uppercase tracking-[0.25em] px-1 pt-0.5 pb-1"
                          style={{ color: INK, opacity: 0.55 }}
                        >
                          ── Manhã
                        </div>
                        <div className="space-y-3">
                          {morning.length === 0 ? (
                            <div className="text-[9px] italic px-1" style={{ color: INK, opacity: 0.3 }}>—</div>
                          ) : (
                            morning.map(renderCard)
                          )}
                        </div>
                        <div
                          className="agenda-period-label text-[9px] font-bold uppercase tracking-[0.25em] px-1 pt-3 pb-1"
                          style={{ color: INK, opacity: 0.55 }}
                        />
                        <div
                          className="agenda-period-label text-[9px] font-bold uppercase tracking-[0.25em] px-1 pb-1"
                          style={{ color: INK, opacity: 0.55 }}
                        >
                          ── Tarde
                        </div>
                        <div className="space-y-3">
                          {afternoon.length === 0 ? (
                            <div className="text-[9px] italic px-1" style={{ color: INK, opacity: 0.3 }}>—</div>
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

          {/* Footer */}
          <footer className="mt-2 flex flex-wrap justify-between items-center gap-3 pt-4 border-t-2" style={{ borderColor: INK }}>
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: INK, opacity: 0.6 }}>
              TreinaCheck · Uso operacional interno
            </div>
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: INK, opacity: 0.6 }}>
              Gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </div>
          </footer>
        </div>
        <p className="agenda-tip no-print text-[11px] mt-3" style={{ color: INK, opacity: 0.55 }}>
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
        const target = e.target as HTMLElement;
        if (target.closest("button, .no-print")) {
          e.preventDefault();
          return;
        }
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
        className="agenda-event relative border-2 rounded-sm px-2.5 py-2 pr-7 text-[13px] leading-snug bg-white hover:bg-orange-50/40 transition-colors"
        style={{
          borderColor,
          background: isCancelled ? "#FDECEC" : isDone ? "#EEF1FB" : "white",
        }}
      >
        {(() => {
          const vt = getVisitType(t.visit_type);
          const Icon = vt.icon;
          return (
            <span
              className="agenda-event-type absolute top-1 right-1 inline-flex items-center justify-center h-5 w-5 rounded-full border"
              style={{
                color: isCancelled ? RED : vt.color,
                borderColor: isCancelled ? RED : vt.color,
                background: isCancelled ? "transparent" : vt.bg,
              }}
              title={vt.label}
              aria-label={vt.label}
            >
              <Icon className="h-3 w-3" strokeWidth={2.5} />
            </span>
          );
        })()}
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
    {VISIT_TYPES.map((vt) => {
      const Icon = vt.icon;
      return (
        <div key={vt.id} className="flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center h-4 w-4 rounded-full border"
            style={{ color: vt.color, borderColor: vt.color, background: vt.bg }}
          >
            <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
          </span>
          <span>{vt.short}</span>
        </div>
      );
    })}
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