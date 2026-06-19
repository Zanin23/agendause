import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Calendar as CalIcon, Clock, MapPin, CheckCircle2, Trash2, Users, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Training = {
  id: string;
  title: string;
  client: string | null;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  created_by: string;
};

type Acceptance = {
  id: string;
  user_id: string;
  accepted_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

const TrainingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [training, setTraining] = useState<Training | null>(null);
  const [acceptances, setAcceptances] = useState<Acceptance[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = async () => {
    if (!id) return;
    const { data: t } = await supabase.from("trainings").select("*").eq("id", id).maybeSingle();
    setTraining(t as Training | null);
    const { data: a } = await supabase
      .from("training_acceptances")
      .select("id, user_id, accepted_at, profiles(full_name, email)")
      .eq("training_id", id)
      .order("accepted_at", { ascending: false });
    setAcceptances((a as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const myAcceptance = acceptances.find((a) => a.user_id === user?.id);

  const accept = async () => {
    if (!user || !id) return;
    setActing(true);
    const { error } = await supabase
      .from("training_acceptances")
      .insert({ training_id: id, user_id: user.id });
    setActing(false);
    if (error) return toast.error(error.message);
    toast.success("Recebimento confirmado!");
    load();
  };

  const removeAccept = async () => {
    if (!myAcceptance) return;
    setActing(true);
    const { error } = await supabase.from("training_acceptances").delete().eq("id", myAcceptance.id);
    setActing(false);
    if (error) return toast.error(error.message);
    toast.success("Aceite removido");
    load();
  };

  const deleteTraining = async () => {
    if (!id) return;
    if (!confirm("Excluir este treinamento?")) return;
    const { error } = await supabase.from("trainings").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Treinamento excluído");
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="max-w-3xl mx-auto px-6 py-16 text-center text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!training) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <p className="text-muted-foreground">Treinamento não encontrado.</p>
          <Button asChild variant="link"><Link to="/">Voltar</Link></Button>
        </div>
      </div>
    );
  }

  const date = new Date(training.scheduled_at);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar para a agenda
        </Link>

        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <h1 className="text-3xl font-semibold tracking-tight">{training.title}</h1>
            <Button variant="ghost" size="sm" onClick={deleteTraining} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {training.client && (
              <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4" />{training.client}</span>
            )}
            <span className="flex items-center gap-1.5"><CalIcon className="h-4 w-4" />{format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{format(date, "HH:mm")} • {training.duration_minutes} min</span>
            {training.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{training.location}</span>}
          </div>

          {training.description && (
            <div>
              <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-2">O que foi treinado</h2>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{training.description}</p>
            </div>
          )}
        </div>

        <Card className="border-primary/40">
          <CardContent className="p-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-semibold">Confirmação de recebimento</h3>
              <p className="text-sm text-muted-foreground">
                {myAcceptance
                  ? `Você confirmou em ${format(new Date(myAcceptance.accepted_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}.`
                  : "Confirme que você recebeu este treinamento."}
              </p>
            </div>
            {myAcceptance ? (
              <Button variant="outline" onClick={removeAccept} disabled={acting}>Remover aceite</Button>
            ) : (
              <Button onClick={accept} disabled={acting}>
                <CheckCircle2 className="h-4 w-4" /> Confirmo recebimento
              </Button>
            )}
          </CardContent>
        </Card>

        <section>
          <h2 className="flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground mb-3">
            <Users className="h-4 w-4" /> Quem confirmou ({acceptances.length})
          </h2>
          {acceptances.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém confirmou ainda.</p>
          ) : (
            <div className="space-y-2">
              {acceptances.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm border-b border-border py-2">
                  <div>
                    <p className="font-medium">{a.profiles?.full_name || a.profiles?.email || "Usuário"}</p>
                    {a.profiles?.email && <p className="text-xs text-muted-foreground">{a.profiles.email}</p>}
                  </div>
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {format(new Date(a.accepted_at), "d MMM HH:mm", { locale: ptBR })}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default TrainingDetail;