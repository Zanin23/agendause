import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Building2, Calendar as CalIcon, Clock, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

type Training = {
  id: string;
  title: string;
  client: string | null;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
};

const GuestAccept = () => {
  const { id } = useParams();
  const [training, setTraining] = useState<Training | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ name: string; at: string } | null>(null);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const { data } = await supabase
        .from("trainings")
        .select("id,title,client,description,scheduled_at,duration_minutes,location")
        .eq("id", id)
        .maybeSingle();
      setTraining(data as Training | null);
      setLoading(false);
    })();
  }, [id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !fullName.trim()) return;
    const acceptedAt = new Date().toISOString();
    setSubmitting(true);
    const { error } = await supabase
      .from("guest_acceptances")
      .insert({ training_id: id, full_name: fullName.trim(), email: email.trim() || null, accepted_at: acceptedAt });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDone({ name: fullName.trim(), at: acceptedAt });
  };

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando...</div>;
  }
  if (!training) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Link inválido ou treinamento removido.</div>;
  }

  const date = new Date(training.scheduled_at);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-xl mx-auto px-6 py-12 space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Confirmação de recebimento</p>
          <h1 className="text-2xl font-semibold tracking-tight">{training.title}</h1>
        </header>

        <Card>
          <CardContent className="p-5 space-y-2 text-sm">
            {training.client && (
              <p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{training.client}</p>
            )}
            <p className="flex items-center gap-2"><CalIcon className="h-4 w-4 text-muted-foreground" />{format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
            <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />{format(date, "HH:mm")} • {training.duration_minutes} min</p>
            {training.location && (
              <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{training.location}</p>
            )}
            {training.description && (
              <p className="pt-2 text-foreground/80 whitespace-pre-wrap">{training.description}</p>
            )}
          </CardContent>
        </Card>

        {done ? (
          <Card className="border-primary/40">
            <CardContent className="p-6 text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
              <h2 className="font-semibold">Recebimento confirmado</h2>
              <p className="text-sm text-muted-foreground">
                Obrigado, <strong>{done.name}</strong>. Registramos seu aceite em{" "}
                {format(new Date(done.at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}.
              </p>
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ao confirmar abaixo, você declara ter recebido o treinamento descrito acima.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome completo *</Label>
              <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome completo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail (opcional)</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              <CheckCircle2 className="h-4 w-4" />
              {submitting ? "Confirmando..." : "Confirmo o recebimento"}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
};

export default GuestAccept;