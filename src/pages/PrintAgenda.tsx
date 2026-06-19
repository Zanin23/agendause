import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDays,
  addWeeks,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Printer, ArrowLeft, ChevronLeft, ChevronRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Training = {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  status: "agendado" | "realizado" | "reagendado";
};

const DAY_LABELS = ["SEG", "TER", "QUA", "QUI", "SEX"];
const ORANGE = "#F26B1F";
const BLUE = "#6F7FB8";
const RED = "#E22B2B";

const PrintAgenda = () => {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("trainings")
        .select("*")
        .order("scheduled_at", { ascending: true });
      setTrainings((data as Training[]) || []);
    })();
  }, []);

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

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`
        .agenda-title { font-family: 'Clash Display', 'Archivo', sans-serif; font-weight: 700; letter-spacing: -0.02em; }
        .agenda-sub { font-family: 'Clash Display', 'Archivo', sans-serif; font-weight: 600; font-style: italic; }
        .day-head { font-family: 'Clash Display', 'Archivo', sans-serif; font-weight: 700; letter-spacing: 0.01em; }
        @media print {
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 10mm; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .agenda-page { padding: 0 !important; }
        }
      `}</style>

      <div className="no-print border-b border-neutral-200">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>

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
            >
              Esta semana
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

          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </div>
      </div>

      <main className="agenda-page max-w-[1200px] mx-auto px-8 py-8">
        {/* Header */}
        <header className="flex items-start justify-between gap-8 mb-6">
          <div className="min-w-0">
            <h1 className="agenda-title text-[64px] leading-[0.95] uppercase">
              Agenda Semanal
            </h1>
            <p
              className="agenda-sub text-[22px] mt-1"
              style={{ color: ORANGE }}
            >
              visitas, reuniões e configurações internas
            </p>
            <p className="text-[11px] text-neutral-600 mt-1">
              *Algumas visitas podem ainda não terem sido confirmadas, agenda
              pode mudar
            </p>
          </div>

          <div className="flex items-center gap-6 pt-2 shrink-0">
            <Legend />
            <div
              className="w-12 h-12 shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, #111 0 33%, transparent 33% 40%, #111 40% 73%, transparent 73% 80%, #111 80%)",
                clipPath:
                  "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
              }}
              aria-hidden
            />
          </div>
        </header>

        {/* Week grid */}
        <div className="grid grid-cols-5 gap-3">
          {weekDays.map((day, idx) => {
            const events = eventsByDay[idx];
            const isToday = isSameDay(day, new Date());
            return (
              <div
                key={idx}
                className="border-[3px] rounded-md flex flex-col"
                style={{ borderColor: ORANGE, minHeight: 520 }}
              >
                <div
                  className="day-head text-[28px] px-3 pt-2 pb-2 border-b-[3px]"
                  style={{ borderColor: ORANGE, color: isToday ? ORANGE : "#111" }}
                >
                  {format(day, "dd")} {DAY_LABELS[idx]}
                </div>
                <div className="p-2 space-y-2 flex-1">
                  {events.length === 0 ? (
                    <div className="h-full" />
                  ) : (
                    events.map((t) => <EventCard key={t.id} t={t} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

const EventCard = ({ t }: { t: Training }) => {
  const hour = format(new Date(t.scheduled_at), "HH");
  const isDone = t.status === "realizado";
  const isResched = t.status === "reagendado";
  return (
    <Link to={`/treinamento/${t.id}`} className="block">
      <div
        className="border-2 rounded-sm px-2.5 py-2 text-[13px] leading-snug bg-white hover:bg-orange-50/40 transition-colors"
        style={{ borderColor: ORANGE }}
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
          <span className="font-medium text-black">
            {hour} - {t.title}
          </span>
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
      </div>
    </Link>
  );
};

const Legend = () => (
  <div className="flex flex-col gap-1.5 text-[13px]">
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
  </div>
);

export default PrintAgenda;