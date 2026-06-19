import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Calendar as CalIcon, Clock, MapPin, CheckCircle2, Trash2, Users, Building2, Link2, FileText, UserCheck, XCircle, RotateCcw, Lock, Pencil, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  status: string;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  internal_notes: string | null;
};

type Acceptance = {
  id: string;
  user_id: string;
  accepted_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

type GuestAcceptance = {
  id: string;
  full_name: string;
  email: string | null;
  accepted_at: string;
};

const TrainingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [training, setTraining] = useState<Training | null>(null);
  const [acceptances, setAcceptances] = useState<Acceptance[]>([]);
  const [guests, setGuests] = useState<GuestAcceptance[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

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
    const { data: g } = await supabase
      .from("guest_acceptances")
      .select("id, full_name, email, accepted_at")
      .eq("training_id", id)
      .order("accepted_at", { ascending: false });
    setGuests((g as GuestAcceptance[]) || []);
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

  const cancelTraining = async () => {
    if (!id) return;
    if (!cancelReason.trim()) {
      toast.error("Informe o motivo do cancelamento");
      return;
    }
    setActing(true);
    const { error } = await supabase
      .from("trainings")
      .update({
        status: "cancelado",
        cancellation_reason: cancelReason.trim(),
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", id);
    setActing(false);
    if (error) return toast.error(error.message);
    toast.success("Visita cancelada");
    setCancelOpen(false);
    setCancelReason("");
    load();
  };

  const reactivateTraining = async () => {
    if (!id) return;
    setActing(true);
    const { error } = await supabase
      .from("trainings")
      .update({ status: "agendado", cancellation_reason: null, cancelled_at: null })
      .eq("id", id);
    setActing(false);
    if (error) return toast.error(error.message);
    toast.success("Visita reativada");
    load();
  };

  const startEditNotes = () => {
    setNotesDraft(training?.internal_notes || "");
    setEditingNotes(true);
  };

  const saveNotes = async () => {
    if (!id) return;
    setSavingNotes(true);
    const { error } = await supabase
      .from("trainings")
      .update({ internal_notes: notesDraft.trim() || null })
      .eq("id", id);
    setSavingNotes(false);
    if (error) return toast.error(error.message);
    toast.success("Observações salvas");
    setEditingNotes(false);
    load();
  };

  const publicLink = `${window.location.origin}/aceite/${id}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicLink);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const removeGuest = async (gid: string) => {
    if (!confirm("Remover este aceite?")) return;
    const { error } = await supabase.from("guest_acceptances").delete().eq("id", gid);
    if (error) return toast.error(error.message);
    toast.success("Aceite removido");
    load();
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
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-semibold tracking-tight">{training.title}</h1>
              {training.status === "cancelado" && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" /> Cancelado
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {training.status === "cancelado" ? (
                <Button variant="ghost" size="sm" onClick={reactivateTraining} disabled={acting}>
                  <RotateCcw className="h-4 w-4" /> Reativar
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)} className="text-muted-foreground hover:text-destructive">
                  <XCircle className="h-4 w-4" /> Cancelar visita
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={deleteTraining} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
            </div>
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

          {training.status === "cancelado" && training.cancellation_reason && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
              <h2 className="text-sm font-semibold text-destructive mb-1 flex items-center gap-2">
                <XCircle className="h-4 w-4" /> Visita cancelada
              </h2>
              {training.cancelled_at && (
                <p className="text-xs text-muted-foreground mb-2">
                  Em {format(new Date(training.cancelled_at), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
              <p className="text-sm whitespace-pre-wrap">
                <span className="text-muted-foreground">Motivo: </span>
                {training.cancellation_reason}
              </p>
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

        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Link2 className="h-4 w-4" /> Link público de aceite
              </h3>
              <p className="text-sm text-muted-foreground">
                Envie este link para quem precisa confirmar o recebimento sem precisar se cadastrar.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <input
                readOnly
                value={publicLink}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm font-mono"
              />
              <Button onClick={copyLink} variant="outline">
                <Link2 className="h-4 w-4" /> Copiar
              </Button>
              <Button asChild>
                <Link to={`/treinamento/${id}/termo`}>
                  <FileText className="h-4 w-4" /> Imprimir termo
                </Link>
              </Button>
            </div>
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

        <section>
          <h2 className="flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground mb-3">
            <UserCheck className="h-4 w-4" /> Aceites via link público ({guests.length})
          </h2>
          {guests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum aceite recebido pelo link ainda.</p>
          ) : (
            <div className="space-y-2">
              {guests.map((g) => (
                <div key={g.id} className="flex items-center justify-between text-sm border-b border-border py-2 gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{g.full_name}</p>
                    {g.email && <p className="text-xs text-muted-foreground truncate">{g.email}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {format(new Date(g.accepted_at), "d MMM HH:mm", { locale: ptBR })}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => removeGuest(g.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar visita</DialogTitle>
            <DialogDescription>
              Informe o motivo do cancelamento. Essa informação ficará registrada no treinamento.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Ex: cliente solicitou reagendamento..."
            rows={4}
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={acting}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={cancelTraining} disabled={acting}>
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TrainingDetail;