import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, isSameDay, isAfter, startOfDay, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarPlus, MapPin, Clock, CheckCircle2, Printer, XCircle, CalendarDays, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateTrainingDialog } from "@/components/CreateTrainingDialog";
import { BackButton } from "@/components/BackButton";

type Training = {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  created_by: string;
  status?: string;
  cancellation_reason?: string | null;
  approval_status?: string | null;
  requested_by?: string | null;
};

const Dashboard = () => {
  const { user } = useAuth();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data: t } = await supabase
      .from("trainings")
      .select("*")
      .order("scheduled_at", { ascending: true });
    setTrainings((t as Training[]) || []);
    if (user) {
      const { data: acc } = await supabase
        .from("training_acceptances")
        .select("training_id")
        .eq("user_id", user.id);
      setAcceptedIds(new Set((acc || []).map((a: any) => a.training_id)));
    }
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const trainingDays = useMemo(
    () => trainings.map((t) => new Date(t.scheduled_at)),
    [trainings]
  );

  const dayTrainings = useMemo(() => {
    if (!selectedDate) return [];
    return trainings.filter((t) => isSameDay(new Date(t.scheduled_at), selectedDate));
  }, [trainings, selectedDate]);

  const upcoming = useMemo(() => {
    const today = startOfDay(new Date());
    return trainings.filter((t) => isAfter(new Date(t.scheduled_at), today) || isSameDay(new Date(t.scheduled_at), today)).slice(0, 15);
  }, [trainings]);

  const upcomingGroups = useMemo(() => {
    const map = new Map<string, Training[]>();
    for (const t of upcoming) {
      const key = format(new Date(t.scheduled_at), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).map(([key, items]) => ({ key, date: new Date(items[0].scheduled_at), items }));
  }, [upcoming]);

  const pendingApproval = useMemo(
    () => trainings.filter((t) => t.approval_status === "pending" && t.status !== "cancelado"),
    [trainings]
  );

  const decide = async (id: string, approve: boolean) => {
    const { error } = await supabase
      .from("trainings")
      .update(
        approve
          ? ({ approval_status: "approved" } as any)
          : ({ approval_status: "rejected", status: "cancelado", cancellation_reason: "Data recusada pela equipe" } as any)
      )
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(approve ? "Data aprovada!" : "Data recusada.");
    await load();
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Agenda de treinamentos — TreinaCheck"
        description="Acompanhe sessões agendadas, confirme recebimento e gerencie a agenda da equipe."
        path="/agenda"
      />
      <AppHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">
        <div className="flex items-start sm:items-end justify-between flex-wrap gap-3 sm:gap-4">
          <div className="min-w-0">
            <BackButton to="/" />
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-2 flex items-center gap-2">
              <CalendarDays className="h-7 w-7 text-primary" /> Agenda de treinamentos
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">Acompanhe sessões agendadas e confirme seu recebimento.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto">
            <Link to="/agenda/imprimir" className="w-full sm:w-auto">
              <Button variant="outline" size="sm" className="w-full sm:h-10">
                <Printer className="h-4 w-4" />
                <span>Visualizar agenda</span>
              </Button>
            </Link>
            <Button onClick={() => setOpen(true)} size="sm" className="w-full sm:w-auto sm:h-10">
              <CalendarPlus className="h-4 w-4" />
              <span>Novo treinamento</span>
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[auto_1fr] gap-6 lg:gap-8 items-start">
          <Card className="calendar-card lg:sticky lg:top-20 w-full lg:w-auto relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-primary/5">
            <div className="calendar-orb-a" aria-hidden />
            <div className="calendar-orb-b" aria-hidden />
            <div className="calendar-sheen" aria-hidden />
            <div
              className="pointer-events-none absolute inset-0 opacity-70"
              aria-hidden
              style={{
                background:
                  "radial-gradient(60% 50% at 30% 0%, hsl(var(--primary) / 0.12), transparent 70%), radial-gradient(50% 40% at 100% 100%, hsl(var(--primary) / 0.08), transparent 70%)",
              }}
            />
            <CardContent className="relative p-4 sm:p-5 flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                locale={ptBR}
                modifiers={{ hasTraining: trainingDays }}
                modifiersClassNames={{
                  hasTraining:
                    "font-bold text-primary relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-primary",
                }}
                className="pointer-events-auto"
                classNames={{
                  months: "flex flex-col gap-2",
                  month: "flex flex-col gap-5",
                  caption: "flex justify-center pt-1 pb-1 relative items-center",
                  caption_label: "text-base font-semibold tracking-tight capitalize",
                  nav: "flex items-center gap-1",
                  nav_button:
                    "h-9 w-9 rounded-2xl bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40 transition-all hover:scale-105 inline-flex items-center justify-center",
                  nav_button_previous: "absolute left-1",
                  nav_button_next: "absolute right-1",
                  table: "w-full border-collapse",
                  head_row: "flex mb-2",
                  head_cell:
                    "text-muted-foreground/70 rounded-md w-10 font-bold text-[10px] uppercase tracking-[0.2em]",
                  row: "flex w-full mt-1.5",
                  cell: "relative h-10 w-10 text-center text-sm",
                  day: "h-10 w-10 p-0 font-normal rounded-2xl hover:bg-foreground/5 hover:scale-110 transition-all duration-200 ease-out inline-flex items-center justify-center",
                  day_selected:
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground font-bold shadow-lg shadow-primary/30 ring-1 ring-primary-foreground/20 scale-110 hover:scale-110",
                  day_today:
                    "border border-primary/50 bg-primary/5 text-foreground font-semibold",
                  day_outside: "text-muted-foreground/30 opacity-60",
                  day_disabled: "text-muted-foreground/30 opacity-40",
                }}
              />
            </CardContent>
          </Card>

          <div className="space-y-6 min-w-0">
            {selectedDate && (
              <section>
                <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">
                  {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
                </h2>
                {dayTrainings.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground text-sm">
                      Nenhum treinamento neste dia.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {dayTrainings.map((t) => (
                      <TrainingCard key={t.id} training={t} accepted={acceptedIds.has(t.id)} />
                    ))}
                  </div>
                )}
              </section>
            )}

            <section>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-sm uppercase tracking-wider text-muted-foreground">Próximos treinamentos</h2>
                {upcoming.length > 0 && (
                  <span className="text-xs text-muted-foreground">{upcoming.length} agendados</span>
                )}
              </div>
              {upcoming.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground text-sm">
                    Nenhum treinamento agendado. Crie o primeiro!
                  </CardContent>
                </Card>
              ) : (
                <div className="relative space-y-6">
                  <div className="absolute left-[26px] sm:left-[34px] top-2 bottom-2 w-px bg-border/60 hidden sm:block" aria-hidden />
                  {upcomingGroups.map((g) => (
                    <UpcomingGroup
                      key={g.key}
                      date={g.date}
                      items={g.items}
                      acceptedIds={acceptedIds}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      <CreateTrainingDialog open={open} onOpenChange={setOpen} onCreated={load} />
    </div>
  );
};

const TrainingCard = ({ training, accepted }: { training: Training; accepted: boolean }) => {
  const date = new Date(training.scheduled_at);
  const isCancelled = training.status === "cancelado";
  return (
    <Link to={`/treinamento/${training.id}`}>
      <Card
        className={
          isCancelled
            ? "border-destructive/60 bg-destructive/5 hover:border-destructive transition-colors"
            : "hover:border-primary/50 transition-colors"
        }
      >
        <CardContent className="p-4 sm:p-5 flex items-start justify-between gap-3 sm:gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={
                  isCancelled
                    ? "font-semibold text-destructive line-through break-words"
                    : "font-semibold break-words"
                }
              >
                {training.title}
              </h3>
              {isCancelled && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" /> Cancelada
                </Badge>
              )}
              {!isCancelled && accepted && (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Aceito
                </Badge>
              )}
            </div>
            <div
              className={
                "flex items-center gap-4 text-xs flex-wrap " +
                (isCancelled ? "text-destructive/80" : "text-muted-foreground")
              }
            >
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(date, "d MMM • HH:mm", { locale: ptBR })} ({training.duration_minutes} min)
              </span>
              {training.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {training.location}
                </span>
              )}
            </div>
            {isCancelled && training.cancellation_reason && (
              <p className="text-xs text-destructive">
                Motivo: {training.cancellation_reason}
              </p>
            )}
          </div>
          {isCancelled && (
            <XCircle className="h-6 w-6 text-destructive shrink-0" />
          )}
        </CardContent>
      </Card>
    </Link>
  );
};

const UpcomingGroup = ({
  date,
  items,
  acceptedIds,
}: {
  date: Date;
  items: Training[];
  acceptedIds: Set<string>;
}) => {
  const today = startOfDay(new Date());
  const diff = differenceInCalendarDays(startOfDay(date), today);
  const relative =
    diff === 0 ? "Hoje" : diff === 1 ? "Amanhã" : diff < 7 ? format(date, "EEEE", { locale: ptBR }) : null;
  return (
    <div className="flex gap-3 sm:gap-4">
      <div className="flex flex-col items-center w-[52px] sm:w-[68px] shrink-0">
        <div
          className={
            "rounded-xl border bg-card text-center w-full py-2 shadow-sm " +
            (diff === 0 ? "border-primary/60 ring-1 ring-primary/30" : "border-border")
          }
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">
            {format(date, "MMM", { locale: ptBR })}
          </div>
          <div className="text-xl sm:text-2xl font-semibold leading-tight mt-1">
            {format(date, "dd")}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mt-1">
            {format(date, "EEE", { locale: ptBR }).replace(".", "")}
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {relative && (
          <div className="text-xs font-medium text-primary/80 uppercase tracking-wider">
            {relative}
          </div>
        )}
        <div className="space-y-2">
          {items.map((t) => (
            <UpcomingRow key={t.id} training={t} accepted={acceptedIds.has(t.id)} />
          ))}
        </div>
      </div>
    </div>
  );
};

const UpcomingRow = ({ training, accepted }: { training: Training; accepted: boolean }) => {
  const date = new Date(training.scheduled_at);
  const isCancelled = training.status === "cancelado";
  return (
    <Link to={`/treinamento/${training.id}`} className="block group">
      <div
        className={
          "relative rounded-lg border bg-card px-4 py-3 transition-all hover:shadow-md hover:-translate-y-px " +
          (isCancelled
            ? "border-destructive/50 bg-destructive/5 hover:border-destructive"
            : "border-border hover:border-primary/50")
        }
      >
        <div
          className={
            "absolute left-0 top-3 bottom-3 w-1 rounded-r " +
            (isCancelled ? "bg-destructive/60" : accepted ? "bg-emerald-500/70" : "bg-primary/50")
          }
          aria-hidden
        />
        <div className="flex items-center justify-between gap-3 pl-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={
                  "font-medium text-sm sm:text-base truncate " +
                  (isCancelled ? "line-through text-destructive" : "")
                }
              >
                {training.title}
              </h3>
              {isCancelled ? (
                <Badge variant="destructive" className="gap-1 h-5 text-[10px]">
                  <XCircle className="h-3 w-3" /> Cancelada
                </Badge>
              ) : accepted ? (
                <Badge variant="success" className="gap-1 h-5 text-[10px]">
                  <CheckCircle2 className="h-3 w-3" /> Aceito
                </Badge>
              ) : null}
            </div>
            <div
              className={
                "flex items-center gap-3 text-xs mt-1 flex-wrap " +
                (isCancelled ? "text-destructive/80" : "text-muted-foreground")
              }
            >
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(date, "HH:mm")} · {training.duration_minutes} min
              </span>
              {training.location && (
                <span className="flex items-center gap-1 truncate max-w-[180px] sm:max-w-none">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{training.location}</span>
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </div>
    </Link>
  );
};

export default Dashboard;