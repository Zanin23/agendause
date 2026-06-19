import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, isSameDay, isAfter, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarPlus, MapPin, Clock, CheckCircle2, Printer, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateTrainingDialog } from "@/components/CreateTrainingDialog";

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
    return trainings.filter((t) => isAfter(new Date(t.scheduled_at), today) || isSameDay(new Date(t.scheduled_at), today)).slice(0, 10);
  }, [trainings]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Agenda de treinamentos</h1>
            <p className="text-muted-foreground mt-1">Acompanhe sessões agendadas e confirme seu recebimento.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/agenda/imprimir">
              <Button variant="outline">
                <Printer className="h-4 w-4" />
                Imprimir agenda
              </Button>
            </Link>
            <Button onClick={() => setOpen(true)}>
              <CalendarPlus className="h-4 w-4" />
              Novo treinamento
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[auto_1fr] gap-8 items-start">
          <Card className="lg:sticky lg:top-20">
            <CardContent className="p-2">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                locale={ptBR}
                modifiers={{ hasTraining: trainingDays }}
                modifiersClassNames={{ hasTraining: "font-bold text-primary underline" }}
                className="pointer-events-auto"
              />
            </CardContent>
          </Card>

          <div className="space-y-6">
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
              <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">Próximos treinamentos</h2>
              {upcoming.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground text-sm">
                    Nenhum treinamento agendado. Crie o primeiro!
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {upcoming.map((t) => (
                    <TrainingCard key={t.id} training={t} accepted={acceptedIds.has(t.id)} />
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
        <CardContent className="p-5 flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={
                  isCancelled
                    ? "font-semibold truncate text-destructive line-through"
                    : "font-semibold truncate"
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

export default Dashboard;