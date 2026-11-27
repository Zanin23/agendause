import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  addWeeks,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, FileDown, CalendarPlus, Check, Sun, CalendarClock, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { CreateTrainingDialog } from "@/components/CreateTrainingDialog";
import useLogo from "@/assets/logo-use-sistemas-v2.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/hooks/useAuth";
import { useTrainingResponsibles } from "@/hooks/useTrainingResponsibles";
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
import { trainingResponsibleNames, type TrainingResponsibleAssignment, type TrainingResponsibleOption } from "@/lib/trainingResponsible";
import { getWeeklyAgendaDays } from "@/lib/weeklyAgenda";
import { createWeeklyAgendaPdf, type WeeklyAgendaPdfStatus } from "@/lib/weeklyAgendaPdf";

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
  responsible_user_id?: string | null;
  training_responsibles?: TrainingResponsibleAssignment[];
};

const BLUE = "#6F7FB8";
const RED = "#E22B2B";
const GREEN = "#1F9D55";
const CALENDAR_DAY_WIDTH = 320;
const CALENDAR_DAY_GAP = 12;
/** Visitas com duração a partir de 8h são tratadas como "dia todo" (criadas com 600 min). */
const ALL_DAY_MIN_MINUTES = 480;
const isAllDayDuration = (durationMinutes: number | string | null | undefined) =>
  Number(durationMinutes) >= ALL_DAY_MIN_MINUTES;

/** Controle de zoom do quadro: no celular o quadro (≈2.300px) cabe inteiro via zoom automático. */
// Mínimo baixo de propósito: o botão "Ajustar" reduz o quadro inteiro para caber na tela do celular.
const BOARD_ZOOM_MIN = 0.15;
const BOARD_ZOOM_MAX = 1.1;
const BOARD_ZOOM_STEP = 0.1;
const BOARD_ZOOM_KEY = "treinacheck-agenda-zoom";
const clampBoardZoom = (value: number) =>
  Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, Math.round(value * 100) / 100));
const readStoredBoardZoom = (): number | null => {
  try {
    const raw = window.localStorage.getItem(BOARD_ZOOM_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampBoardZoom(parsed) : null;
  } catch {
    return null;
  }
};

type ActiveDrag = { id: string; x: number; y: number; width: number };

type DragSession = {
  id: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  active: boolean;
  targetKey: number | null;
  blurHandler: () => void;
  escapeHandler: (event: KeyboardEvent) => void;
};

const PrintAgenda = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: responsibleUsers = [] } = useTrainingResponsibles();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  // Drag-and-drop baseado em Pointer Events: funciona igual em qualquer PC/navegador
  // (incluindo RDP, telas de toque e monitores de alta densidade), ao contrário do
  // HTML5 drag nativo, cujo suporte varia e não funciona com toque.
  const dragSessionRef = useRef<DragSession | null>(null);
  const autoScrollTimerRef = useRef<number | null>(null);
  const scrollShellRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  const trainingsRef = useRef<Training[]>([]);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [rescheduleData, setRescheduleData] = useState<{
    training: Training;
    newDay: Date;
  } | null>(null);
  const [newTime, setNewTime] = useState<string>("09:00");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  // `null` = zoom automático (ajusta o quadro à largura da tela); número = zoom escolhido pelo usuário.
  const [boardZoomOverride, setBoardZoomOverride] = useState<number | null>(() => readStoredBoardZoom());
  const [fitZoom, setFitZoom] = useState(1);

  const loadAgenda = useCallback(async () => {
    const [{ data }, { data: ua }, { data: ga }] = await Promise.all([
      supabase
        .from("trainings")
        .select("*, training_responsibles:training_responsibles(responsible_user_id)")
        .order("scheduled_at", { ascending: true }),
      supabase.from("training_acceptances").select("training_id"),
      supabase.from("guest_acceptances").select("training_id"),
    ]);
    setTrainings((data as Training[]) || []);
    setConfirmedIds(new Set([...(ua ?? []), ...(ga ?? [])].map(({ training_id }) => training_id)));
  }, []);

  useEffect(() => {
    void loadAgenda();
  }, [loadAgenda]);

  useEffect(() => {
    trainingsRef.current = trainings;
  }, [trainings]);

  const clearAutoScroll = useCallback(() => {
    if (autoScrollTimerRef.current) {
      window.clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
  }, []);

  const applyAutoScroll = useCallback(() => {
    const session = dragSessionRef.current;
    if (!session?.active) return;
    const shell = scrollShellRef.current;
    if (shell) {
      const rect = shell.getBoundingClientRect();
      const EDGE = 72;
      if (session.lastX < rect.left + EDGE) {
        shell.scrollLeft -= Math.max(14, Math.round((rect.left + EDGE - session.lastX) / 4));
      } else if (session.lastX > rect.right - EDGE) {
        shell.scrollLeft += Math.max(14, Math.round((session.lastX - (rect.right - EDGE)) / 4));
      }
    }
    const EDGE_Y = 64;
    if (session.lastY < EDGE_Y) {
      window.scrollBy(0, -Math.max(8, Math.round((EDGE_Y - session.lastY) / 4)));
    } else if (session.lastY > window.innerHeight - EDGE_Y) {
      window.scrollBy(0, Math.max(8, Math.round((session.lastY - (window.innerHeight - EDGE_Y)) / 4)));
    }
  }, []);

  const updateDropTargetFromPoint = useCallback((x: number, y: number) => {
    const element = document.elementFromPoint(x, y);
    const dayEl = (element?.closest?.("[data-day-key]") ?? null) as HTMLElement | null;
    const key = dayEl ? Number(dayEl.dataset.dayKey) : NaN;
    const target = Number.isFinite(key) ? key : null;
    const session = dragSessionRef.current;
    if (session) session.targetKey = target;
    setDropTarget((prev) => (prev === target ? prev : target));
  }, []);

  const handleWindowPointerMove = useCallback((event: PointerEvent) => {
    const session = dragSessionRef.current;
    if (!session) return;
    session.lastX = event.clientX;
    session.lastY = event.clientY;
    if (!session.active) {
      const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
      if (distance < 6) return;
      session.active = true;
      suppressClickRef.current = true;
      document.body.classList.add("agenda-drag-active");
      autoScrollTimerRef.current = window.setInterval(applyAutoScroll, 40);
    }
    setActiveDrag({
      id: session.id,
      x: event.clientX - session.offsetX,
      y: event.clientY - session.offsetY,
      width: session.width,
    });
    updateDropTargetFromPoint(event.clientX, event.clientY);
  }, [applyAutoScroll, updateDropTargetFromPoint]);

  const handleWindowPointerEnd = useCallback(() => {
    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", handleWindowPointerEnd);
    window.removeEventListener("pointercancel", handleWindowPointerEnd);
    const sessionSnapshot = dragSessionRef.current;
    if (sessionSnapshot) {
      window.removeEventListener("blur", sessionSnapshot.blurHandler);
      window.removeEventListener("keydown", sessionSnapshot.escapeHandler);
    }
    clearAutoScroll();
    document.body.classList.remove("agenda-drag-active");
    const session = dragSessionRef.current;
    dragSessionRef.current = null;
    const wasActive = !!session?.active;
    const targetKey = session?.targetKey ?? null;
    setActiveDrag(null);
    setDropTarget(null);
    if (wasActive && session && targetKey !== null) {
      const training = trainingsRef.current.find((item) => item.id === session.id);
      if (training) {
        setNewTime(format(new Date(training.scheduled_at), "HH:mm"));
        setRescheduleData({ training, newDay: new Date(targetKey) });
      }
    }
    if (wasActive) {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 200);
    } else {
      suppressClickRef.current = false;
    }
  }, [clearAutoScroll, handleWindowPointerMove]);

  // Garante que nenhum listener global fique preso se o componente desmontar no meio de um drag.
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerEnd);
      window.removeEventListener("pointercancel", handleWindowPointerEnd);
      const session = dragSessionRef.current;
      if (session) {
        window.removeEventListener("blur", session.blurHandler);
        window.removeEventListener("keydown", session.escapeHandler);
      }
      clearAutoScroll();
      document.body.classList.remove("agenda-drag-active");
    };
  }, [clearAutoScroll, handleWindowPointerMove, handleWindowPointerEnd]);

  const handleCardPointerDown = (event: ReactPointerEvent<HTMLDivElement>, training: Training) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // Botões, links e campos dentro do card mantêm seu comportamento normal.
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea, [data-no-drag]")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // Se a janela perder o foco no meio do arraste, cancela sem reagendar.
    const cancelWithoutCommit = () => {
      const session = dragSessionRef.current;
      if (session) session.targetKey = null;
      handleWindowPointerEnd();
    };
    const blurHandler = () => cancelWithoutCommit();
    const escapeHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelWithoutCommit();
    };
    dragSessionRef.current = {
      id: training.id,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      active: false,
      targetKey: null,
      blurHandler,
      escapeHandler,
    };
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerEnd);
    window.addEventListener("pointercancel", handleWindowPointerEnd);
    window.addEventListener("blur", blurHandler);
    window.addEventListener("keydown", escapeHandler);
  };

  const openTraining = (training: Training) => {
    // Ignora o "clique" que o navegador dispara ao soltar o ponteiro no fim de um drag.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    navigate(`/treinamento/${training.id}`);
  };

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

  const agendaDays = useMemo(
    () => getWeeklyAgendaDays(weekStart, trainings),
    [weekStart, trainings],
  );
  const calendarDays = useMemo(
    () => agendaDays.map((agendaDay) => {
      const allDay = agendaDay.events.filter((event) => isAllDayDuration(event.duration_minutes));
      const morning = agendaDay.events.filter((event) => {
        if (isAllDayDuration(event.duration_minutes)) return false;
        return new Date(event.scheduled_at).getHours() < 12;
      });
      const afternoon = agendaDay.events.filter((event) => {
        if (isAllDayDuration(event.duration_minutes)) return false;
        return new Date(event.scheduled_at).getHours() >= 12;
      });
      return { ...agendaDay, allDay, morning, afternoon };
    }),
    [agendaDays],
  );
  const agendaDayWidths = useMemo(
    () => calendarDays.map(() => CALENDAR_DAY_WIDTH),
    [calendarDays],
  );
  const agendaScreenWidth = Math.max(
    1200,
    agendaDayWidths.reduce((total, width) => total + width, 0)
      + Math.max(0, agendaDayWidths.length - 1) * CALENDAR_DAY_GAP
      + 64,
  );

  // Calcula o zoom "Ajustar": quanto do quadro cabe na largura visível (nunca amplia acima de 100%).
  useEffect(() => {
    const updateFit = () => {
      const shell = scrollShellRef.current;
      const available = (shell?.clientWidth ?? window.innerWidth) - 8;
      setFitZoom(Math.min(1, clampBoardZoom(available / agendaScreenWidth)));
    };
    updateFit();
    window.addEventListener("resize", updateFit);
    return () => window.removeEventListener("resize", updateFit);
  }, [agendaScreenWidth]);

  const boardZoom = boardZoomOverride ?? fitZoom;
  const setBoardZoom = (value: number | null) => {
    setBoardZoomOverride(value);
    try {
      if (value === null) window.localStorage.removeItem(BOARD_ZOOM_KEY);
      else window.localStorage.setItem(BOARD_ZOOM_KEY, String(clampBoardZoom(value)));
    } catch {
      // localStorage indisponível: o zoom ainda funciona só nesta sessão.
    }
  };
  const zoomIn = () => setBoardZoom(clampBoardZoom(boardZoom + BOARD_ZOOM_STEP));
  const zoomOut = () => setBoardZoom(clampBoardZoom(boardZoom - BOARD_ZOOM_STEP));
  const fitToWidth = () => setBoardZoom(null);

  const weekLabel = `${format(weekStart, "d MMM", { locale: ptBR })} – ${format(
    endOfWeek(weekStart, { weekStartsOn: 1 }),
    "d MMM yyyy",
    { locale: ptBR }
  )}`;

  const exportPDF = () => {
    setExporting(true);
    try {
      const days = agendaDays.map(({ day, label, events }) => ({
        dateLabel: format(day, "dd"),
        dayLabel: label,
        events: events.map((training) => {
          const scheduledAt = new Date(training.scheduled_at);
          const isAllDay = isAllDayDuration(training.duration_minutes);
          const client = training.client?.trim();
          const title = training.title.trim();
          const isDone = training.status === "realizado" || training.status === "concluido";
          const status: WeeklyAgendaPdfStatus = training.status === "cancelado"
            ? "Cancelada"
            : isDone
              ? "Realizada"
              : training.status === "reagendado"
                ? "Reagendada"
                : training.confirmed_at || confirmedIds.has(training.id)
                  ? "Confirmada"
                  : "Pendente";
          const description = training.description?.trim();
          const note = training.status === "cancelado" && training.cancellation_reason
            ? `Cancelamento: ${training.cancellation_reason}`
            : training.status === "reagendado" && description
              ? `Reagendamento: ${description}`
              : description
                ? `Observação: ${description}`
                : null;

          return {
            startMinute: scheduledAt.getHours() * 60 + scheduledAt.getMinutes(),
            allDay: isAllDay,
            time: isAllDay ? "Dia inteiro" : format(scheduledAt, "HH:mm"),
            client: client || title,
            activity: client && title && client !== title ? title : null,
            durationLabel: isAllDay ? "Duração integral" : `${training.duration_minutes} min`,
            modality: getVisitType(training.visit_type).label,
            location: training.location?.trim() || null,
            responsibles: trainingResponsibleNames(training, responsibleUsers) || null,
            status,
            note,
          };
        }),
      }));

      const pdf = createWeeklyAgendaPdf({ weekLabel, days });
      pdf.save(`agenda-${format(weekStart, "yyyy-MM-dd")}.pdf`);
      toast({ title: "PDF gerado", description: "Agenda exportada em formato leve, vetorial e sem cortes." });
    } catch (e) {
      toast({ title: "Erro ao gerar PDF", description: String(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const openRescheduleDialog = (training: Training, day?: Date) => {
    setNewTime(format(new Date(training.scheduled_at), "HH:mm"));
    setRescheduleData({ training, newDay: day ?? new Date(training.scheduled_at) });
  };

  const confirmReschedule = async () => {
    if (!rescheduleData) return;
    setSaving(true);
    const isAllDay = isAllDayDuration(rescheduleData.training.duration_minutes);
    const [h, m] = newTime.split(":").map(Number);
    const newDate = new Date(rescheduleData.newDay);
    if (isAllDay) {
      // Visita de dia todo: preserva o horário de início original.
      const original = new Date(rescheduleData.training.scheduled_at);
      newDate.setHours(original.getHours(), original.getMinutes(), 0, 0);
    } else {
      newDate.setHours(h || 0, m || 0, 0, 0);
    }
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
    toast({
      title: "Visita reagendada",
      description: isAllDayDuration(rescheduleData.training.duration_minutes)
        ? format(newDate, "d MMM yyyy", { locale: ptBR })
        : format(newDate, "d MMM 'às' HH:mm", { locale: ptBR }),
    });
    setRescheduleData(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground print:bg-white print:text-black">
      <SEO
        title="Imprimir agenda — TreinaCheck"
        description="Visualize e exporte a agenda semanal de treinamentos em PDF ou para impressão."
        path="/agenda/imprimir"
      />
      <style>{`
        .agenda-page { --color-border: #e5e7eb; }
        .agenda-title {
          font-family: 'Clash Display', 'Archivo', sans-serif;
          font-weight: 700;
          letter-spacing: -0.035em;
        }
        .agenda-sub { font-family: 'Archivo', sans-serif; }
        .agenda-scroll-shell { scrollbar-gutter: stable; }
        .agenda-event-card { isolation: isolate; touch-action: manipulation; }
        body.agenda-drag-active, body.agenda-drag-active * {
          cursor: grabbing !important;
          -webkit-user-select: none !important;
          user-select: none !important;
        }
        .agenda-drag-ghost { cursor: grabbing; }

        @media screen and (max-width: 767px) {
          .agenda-page { padding: 16px !important; }
          .agenda-header {
            flex-direction: column !important;
            gap: 12px !important;
            align-items: flex-start !important;
          }
          .agenda-title { font-size: 36px !important; overflow-wrap: anywhere; }
          .agenda-layers-print { width: 64px !important; height: 64px !important; }
        }

        @media print {
          @page { size: A4 landscape; margin: 5mm; }
          .no-print, [data-pdf-hidden="true"], button { display: none !important; }
          html, body {
            background: white !important;
            width: auto !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .agenda-scroll-shell { overflow: visible !important; padding: 0 !important; }
          .agenda-page {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            zoom: 1 !important;
          }
          .agenda-header { margin-bottom: 2.5mm !important; padding-bottom: 2.5mm !important; }
          .agenda-title { font-size: 20pt !important; }
          .agenda-sub, .agenda-week-label { font-size: 7pt !important; }
          .agenda-legend-print { margin-top: 1mm !important; }
          .agenda-legend-items { gap: 1mm !important; font-size: 5.5pt !important; }
          .agenda-layers-print { width: 15mm !important; height: 15mm !important; }
          .agenda-board {
            width: 100% !important;
            grid-template-columns: repeat(var(--agenda-columns), minmax(0, 1fr)) !important;
            gap: 1.5mm !important;
          }
          .agenda-board-day { min-height: 0 !important; border-radius: 1mm !important; }
          .agenda-event-card {
            min-height: 0 !important;
            padding: 1mm !important;
            border-radius: 1mm !important;
            box-shadow: none !important;
            transform: none !important;
          }
          .agenda-tip { display: none !important; }
          .agenda-drag-ghost { display: none !important; }
        }
      `}</style>

      <div className="no-print border-b border-border bg-card/60">
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
            <span className="text-sm text-muted-foreground ml-3 capitalize">
              {weekLabel}
            </span>
          </div>

          <div
            className="flex items-center gap-1 rounded-xl border border-border bg-background/60 p-1"
            role="group"
            aria-label="Zoom do quadro"
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={zoomOut}
              disabled={boardZoom <= BOARD_ZOOM_MIN}
              title="Reduzir zoom do quadro"
              aria-label="Reduzir zoom do quadro"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span
              className="w-12 text-center text-xs font-semibold tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {Math.round(boardZoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={zoomIn}
              disabled={boardZoom >= BOARD_ZOOM_MAX}
              title="Aumentar zoom do quadro"
              aria-label="Aumentar zoom do quadro"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              onClick={fitToWidth}
              title="Ajustar o quadro à largura da tela (ver mais dias de uma vez)"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ajustar</span>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setCreateDialogOpen(true)}>
              <CalendarPlus className="h-4 w-4" />
              Novo treinamento
            </Button>
            <Button variant="outline" onClick={exportPDF} disabled={exporting}>
              <FileDown className="h-4 w-4" />
              {exporting ? "Gerando..." : "Exportar PDF"}
            </Button>
          </div>
        </div>
      </div>

      <div ref={scrollShellRef} className="agenda-scroll-shell w-full overflow-x-auto pb-3 print:overflow-visible print:pb-0">
      <main
        className="agenda-page max-w-none mx-auto px-4 sm:px-8 py-4 sm:py-8 bg-white text-black my-4 sm:my-8 rounded-xl shadow-xl print:my-0 print:rounded-none print:shadow-none"
        style={{ width: agendaScreenWidth, zoom: boardZoom } as CSSProperties}
      >
        {/* Header */}
        <header className="agenda-header mb-5 flex flex-col gap-5 border-b border-neutral-200 pb-5 md:flex-row md:items-start md:justify-between md:gap-8">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
              Use Sistemas · Implantação
            </p>
            <h1 className="agenda-title agenda-title-print mt-2 break-words text-[36px] uppercase leading-none sm:text-[48px]">
              Agenda semanal
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="agenda-week-label text-[14px] font-semibold capitalize text-neutral-800">{weekLabel}</p>
              <span className="text-neutral-300">•</span>
              <p className="agenda-sub agenda-sub-print text-[13px] text-neutral-500">
                visitas, reuniões e configurações internas
              </p>
            </div>
            <div className="agenda-legend-print mt-4">
              <Legend />
            </div>
          </div>

          <div className="agenda-legend-print flex shrink-0 items-center self-start rounded-2xl bg-neutral-50 px-4 py-3 ring-1 ring-neutral-200">
            <img
              src={useLogo.url}
              alt="Use Sistemas"
              className="agenda-layers-print h-16 w-16 shrink-0 object-contain sm:h-20 sm:w-20"
            />
          </div>
        </header>

        {/* Quadro semanal compacto: poucos níveis, cartões grandes e leitura rápida. */}
        <div
          className="agenda-board grid items-stretch gap-3"
          style={{
            "--agenda-columns": calendarDays.length,
            gridTemplateColumns: agendaDayWidths.map((width) => `${width}px`).join(" "),
          } as CSSProperties}
        >
          {calendarDays.map(({ day, label, events, allDay, morning, afternoon }) => {
            const dayKey = day.getTime();
            const today = isSameDay(day, new Date());
            const isOver = dropTarget === dayKey;
            const renderCard = (training: Training) => (
              <AgendaEventCard
                key={training.id}
                training={training}
                responsibleUsers={responsibleUsers}
                confirmed={confirmedIds.has(training.id)}
                isDragging={activeDrag?.id === training.id}
                onToggleConfirm={() => toggleConfirm(training)}
                onReschedule={() => openRescheduleDialog(training, new Date(training.scheduled_at))}
                onPointerDragStart={(event) => handleCardPointerDown(event, training)}
                onOpen={() => openTraining(training)}
              />
            );

            return (
              <section
                key={dayKey}
                data-day-key={dayKey}
                className="agenda-board-day flex min-h-[470px] flex-col overflow-hidden rounded-2xl border bg-white transition-colors duration-150"
                style={{ borderColor: isOver ? "#F26B1F" : "#E5E7EB", background: isOver ? "#FFF7ED" : "#FFFFFF" }}
              >
                <header className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{label}</span>
                      <span className={`text-2xl font-semibold tracking-tight ${today ? "text-orange-600" : "text-neutral-900"}`}>
                        {format(day, "dd")}
                      </span>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-neutral-500 shadow-sm ring-1 ring-neutral-200">
                      {events.length} {events.length === 1 ? "item" : "itens"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] capitalize text-neutral-500">{format(day, "EEEE", { locale: ptBR })}</p>
                </header>

                <div className="flex-1 space-y-5 p-3">
                  {allDay.length > 0 && (
                    <section>
                      <PeriodTitle label="Dia todo" count={allDay.length} allDay />
                      <div className="mt-2 space-y-2.5">
                        {allDay.map(renderCard)}
                      </div>
                    </section>
                  )}

                  {morning.length > 0 && (
                    <section>
                      <PeriodTitle label="Manhã" count={morning.length} />
                      <div className="mt-2 space-y-2.5">
                        {morning.map(renderCard)}
                      </div>
                    </section>
                  )}

                  {afternoon.length > 0 && (
                    <section>
                      <PeriodTitle label="Tarde" count={afternoon.length} />
                      <div className="mt-2 space-y-2.5">
                        {afternoon.map(renderCard)}
                      </div>
                    </section>
                  )}

                  {events.length === 0 && (
                    <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-xs text-neutral-400">
                      Sem compromissos neste dia
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
        <p className="agenda-tip no-print text-[11px] text-neutral-500 mt-3">
          Dica: arraste uma visita para outro dia para reagendar, ou use o botão de reagendar no cartão. No celular, use o zoom no topo para ver mais dias de uma vez.
        </p>
      </main>
      </div>

      {activeDrag && (() => {
        const dragged = trainings.find((item) => item.id === activeDrag.id);
        if (!dragged) return null;
        const draggedIsAllDay = isAllDayDuration(dragged.duration_minutes);
        const client = dragged.client?.trim() || dragged.title;
        return (
          <div
            aria-hidden="true"
            className="agenda-drag-ghost pointer-events-none fixed z-[80] select-none"
            style={{ left: activeDrag.x, top: activeDrag.y, width: activeDrag.width }}
          >
            <div
              className="rounded-xl border-2 px-3 py-2.5 shadow-2xl"
              style={{
                borderColor: "#F26B1F",
                background: draggedIsAllDay
                  ? "linear-gradient(150deg, #FFF8E1 0%, #FFE9B8 100%)"
                  : "#FFFFFF",
                transform: "rotate(1.2deg) scale(1.02)",
                boxShadow: "0 24px 48px rgba(15, 23, 42, 0.28)",
              }}
            >
              <div className="flex items-center gap-2">
                {draggedIsAllDay ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-amber-950">
                    <Sun className="h-3 w-3" strokeWidth={2.6} />
                    Dia todo
                  </span>
                ) : (
                  <span className="text-xs font-bold tabular-nums text-neutral-800">
                    {format(new Date(dragged.scheduled_at), "HH:mm")}
                  </span>
                )}
                <span className="min-w-0 truncate text-xs font-semibold text-neutral-900">{client}</span>
              </div>
            </div>
          </div>
        );
      })()}

      <CreateTrainingDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={() => void loadAgenda()}
      />

      <Dialog open={!!rescheduleData} onOpenChange={(o) => !o && setRescheduleData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reagendar visita</DialogTitle>
          </DialogHeader>
          {rescheduleData && (() => {
            const isAllDay = isAllDayDuration(rescheduleData.training.duration_minutes);
            return (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <div className="font-medium text-foreground">
                    {rescheduleData.training.client?.trim() || rescheduleData.training.title}
                  </div>
                  {isAllDay && (
                    <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                      <Sun className="h-3 w-3" strokeWidth={2.4} />
                      Visita de dia todo
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newDay">Novo dia</Label>
                  <Input
                    id="newDay"
                    type="date"
                    value={format(rescheduleData.newDay, "yyyy-MM-dd")}
                    onChange={(event) => {
                      const [year, month, day] = event.target.value.split("-").map(Number);
                      if (!year || !month || !day) return;
                      setRescheduleData({ ...rescheduleData, newDay: new Date(year, month - 1, day) });
                    }}
                  />
                  <p className="text-xs capitalize text-muted-foreground">
                    {format(rescheduleData.newDay, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </p>
                </div>
                {isAllDay ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Visita de dia todo: o horário de início ({format(new Date(rescheduleData.training.scheduled_at), "HH:mm")}) e a duração integral serão mantidos.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="newTime">Novo horário</Label>
                    <Input
                      id="newTime"
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                    />
                  </div>
                )}
              </div>
            );
          })()}
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

const trainingVisual = (training: Training, confirmed: boolean) => {
  const done = training.status === "realizado" || training.status === "concluido";
  if (training.status === "cancelado") {
    return { label: "Cancelada", accent: RED, border: "#F5B8B8", background: "#FFF4F4", text: "#B42323" };
  }
  if (done) {
    return { label: "Realizada", accent: BLUE, border: "#C9D0E8", background: "#F5F7FC", text: "#52639D" };
  }
  if (training.status === "reagendado") {
    return { label: "Reagendada", accent: "#D97706", border: "#F4CF9C", background: "#FFF8ED", text: "#9A5700" };
  }
  if (training.confirmed_at || confirmed) {
    return { label: "Confirmada", accent: GREEN, border: "#AFE0C3", background: "#F1FAF5", text: "#177642" };
  }
  return { label: "Pendente", accent: "#D4A72C", border: "#E9D28B", background: "#FFFBEC", text: "#8B6500" };
};

const AgendaEventCard = ({
  training,
  responsibleUsers,
  confirmed,
  isDragging,
  onToggleConfirm,
  onReschedule,
  onPointerDragStart,
  onOpen,
}: {
  training: Training;
  responsibleUsers: TrainingResponsibleOption[];
  confirmed: boolean;
  isDragging: boolean;
  onToggleConfirm: () => void;
  onReschedule: () => void;
  onPointerDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onOpen: () => void;
}) => {
  const scheduledAt = new Date(training.scheduled_at);
  const allDay = isAllDayDuration(training.duration_minutes);
  const hour = format(scheduledAt, "HH:mm");
  const client = training.client?.trim() || training.title;
  const activity = training.client?.trim() && training.title !== training.client.trim() ? training.title : null;
  const responsibleNames = trainingResponsibleNames(training, responsibleUsers);
  const visual = trainingVisual(training, confirmed);
  const visitType = getVisitType(training.visit_type);
  const VisitIcon = visitType.icon;
  const timeLabel = allDay ? "Dia todo" : hour;
  // Cartões de dia todo ganham um destaque próprio: fundo âmbar quente, borda âmbar e selo "DIA TODO".
  const cardBackground = allDay
    ? "linear-gradient(150deg, #FFFBEA 0%, #FDEFC2 55%, #FBE3A0 100%)"
    : visual.background;
  const cardBorder = allDay ? "#E0AC3F" : visual.border;
  const cardNote = training.status === "cancelado" && training.cancellation_reason
    ? training.cancellation_reason
    : training.description?.trim() || null;
  const details = [
    `${timeLabel} — ${client}`,
    activity,
    allDay ? `Dia inteiro · ${visitType.label}` : `${training.duration_minutes} min · ${visitType.label}`,
    training.location,
    responsibleNames ? `Responsáveis: ${responsibleNames}` : null,
    cardNote ? `${training.status === "cancelado" ? "Cancelamento" : "Observação"}: ${cardNote}` : null,
  ].filter(Boolean).join("\n");

  return (
    <div
      className={`agenda-event-card group relative min-h-[112px] cursor-grab select-none rounded-xl border p-3 shadow-sm transition hover:-translate-y-px hover:shadow-md active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
      style={{
        borderColor: cardBorder,
        borderLeftColor: visual.accent,
        borderLeftWidth: 4,
        background: cardBackground,
        touchAction: "manipulation",
      }}
      title={details}
      onPointerDown={onPointerDragStart}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-grabbed={isDragging}
    >
      <div className="flex items-start gap-2 pr-6">
        {allDay ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-4 tracking-wider text-amber-950 shadow-sm"
            title="Visita de dia todo"
          >
            <Sun className="h-3 w-3" strokeWidth={2.8} />
            Dia todo
          </span>
        ) : (
          <span className="shrink-0 text-xs font-bold tabular-nums text-neutral-800">{hour}</span>
        )}
        <span
          className="line-clamp-2 min-w-0 break-words text-xs font-semibold leading-snug"
          style={{ color: allDay ? "#5C4108" : visual.text, textDecoration: training.status === "cancelado" ? "line-through" : "none" }}
        >
          {client}
        </span>
      </div>
      <span
        className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white/80"
        style={{ color: visitType.color }}
        title={visitType.label}
      >
        <VisitIcon className="h-3 w-3" strokeWidth={2.4} />
      </span>

      {activity && <p className="mt-1 line-clamp-2 break-words text-[10px] leading-snug text-neutral-600">{activity}</p>}
      <p className="mt-1 line-clamp-2 text-[9px] text-neutral-500">
        {allDay ? "Dia todo" : `${training.duration_minutes} min`} · {visitType.label}{training.location ? ` · ${training.location}` : ""}
      </p>
      {responsibleNames && (
        <p className="mt-1 line-clamp-2 break-words text-[9px] leading-snug text-neutral-500">{responsibleNames}</p>
      )}
      {cardNote && (
        <p
          className="mt-1 line-clamp-2 break-words text-[9px] italic leading-snug"
          style={{ color: training.status === "cancelado" ? visual.text : "#6B7280" }}
        >
          {cardNote}
        </p>
      )}

      <div className="mt-2 flex items-center gap-1.5 pr-16">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide"
          style={{ color: visual.text, background: `${visual.accent}18` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: visual.accent }} />
          {visual.label}
        </span>
      </div>

      {training.status !== "cancelado" && training.status !== "realizado" && training.status !== "concluido" && (
        <>
          <button
            type="button"
            data-pdf-hidden="true"
            aria-label="Reagendar visita"
            title="Reagendar visita"
            className="no-print absolute bottom-2 right-11 flex h-7 w-7 items-center justify-center rounded-full bg-white text-neutral-500 opacity-0 shadow-sm ring-1 ring-neutral-200 transition hover:text-primary group-hover:opacity-100 focus:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onReschedule();
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <CalendarClock className="h-4 w-4" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            data-pdf-hidden="true"
            aria-label={training.confirmed_at ? "Remover confirmação" : "Confirmar visita"}
            title={training.confirmed_at ? "Remover confirmação interna" : "Confirmar visita"}
            className="no-print absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-neutral-500 opacity-0 shadow-sm ring-1 ring-neutral-200 transition hover:text-emerald-600 group-hover:opacity-100 focus:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onToggleConfirm();
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <Check className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </>
      )}
    </div>
  );
};

const PeriodTitle = ({ label, count, allDay = false }: { label: string; count: number; allDay?: boolean }) => (
  <div className="flex items-center gap-2">
    {allDay ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.16em] text-amber-950 shadow-sm">
        <Sun className="h-3 w-3" strokeWidth={2.8} />
        {label}
      </span>
    ) : (
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-600">{label}</span>
    )}
    <span className={`h-px flex-1 ${allDay ? "bg-amber-300" : "bg-orange-100"}`} />
    <span className="text-[9px] tabular-nums text-neutral-400">{count}</span>
  </div>
);

const Legend = () => (
  <div className="agenda-legend-items flex flex-wrap items-center gap-2 text-[11px] text-neutral-600">
    {VISIT_TYPES.map((visitType) => {
      const Icon = visitType.icon;
      return (
        <div
          key={visitType.id}
          className="flex items-center gap-1.5 rounded-full bg-neutral-50 px-2 py-1 ring-1 ring-neutral-200"
        >
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full"
            style={{ color: visitType.color, background: visitType.bg }}
          >
            <Icon className="h-2.5 w-2.5" strokeWidth={2.4} />
          </span>
          <span>{visitType.short}</span>
        </div>
      );
    })}
    <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-1 ring-1 ring-amber-300">
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-amber-950">
        <Sun className="h-2.5 w-2.5" strokeWidth={2.6} />
      </span>
      <span className="text-amber-900">Dia todo</span>
    </span>
    <span className="ml-1 text-neutral-400">As cores dos cartões indicam a situação.</span>
  </div>
);

export default PrintAgenda;