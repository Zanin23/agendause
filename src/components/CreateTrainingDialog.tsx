import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Feather, CalendarClock, MapPin, Timer, Building2, BookOpen } from "lucide-react";
import { VISIT_TYPES, type VisitType } from "@/lib/visitType";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
};

export const CreateTrainingDialog = ({ open, onOpenChange, onCreated }: Props) => {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(60);
  const [location, setLocation] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [visitType, setVisitType] = useState<VisitType>("presencial");
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [t, n] = await Promise.all([
        supabase.from("trainings").select("client").not("client", "is", null),
        supabase.from("company_notes").select("company"),
      ]);
      const s = new Set<string>();
      (t.data ?? []).forEach((r: any) => r.client && s.add(r.client));
      (n.data ?? []).forEach((r: any) => r.company && s.add(r.company));
      setCompanies(Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR")));
    })();
  }, [open]);

  const prettyDate = useMemo(() => {
    if (!date) return "—";
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  }, [date]);

  const reset = () => {
    setTitle(""); setClient(""); setDescription(""); setDate(""); setTime("09:00");
    setDuration(60); setLocation(""); setInternalNotes(""); setVisitType("presencial");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const scheduled_at = new Date(`${date}T${time}`).toISOString();
    const { error } = await supabase.from("trainings").insert({
      title,
      client: client || null,
      description: description || null,
      scheduled_at,
      duration_minutes: duration,
      location: location || null,
      internal_notes: internalNotes.trim() || null,
      visit_type: visitType,
      created_by: user.id,
    } as any);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Treinamento criado!");
    reset();
    onOpenChange(false);
    onCreated();
  };

  const underline =
    "bg-transparent border-x-0 border-t-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary";
  const labelCls = "text-[11px] tracking-[0.22em] uppercase text-muted-foreground flex items-center gap-1.5";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto w-[calc(100vw-2rem)] sm:max-w-2xl p-0 border-border/70 bg-transparent shadow-2xl">
        <div className="composer-card paper-surface relative overflow-hidden rounded-2xl border border-border/70 p-6 sm:p-8">
          <span className="composer-sheen" aria-hidden="true" />

          <DialogHeader className="relative space-y-3 mb-6">
            <div className="flex items-center gap-2 text-[11px] tracking-[0.28em] uppercase text-primary/80">
              <Feather className="h-3.5 w-3.5 feather-float" />
              <span className="relative">
                Novo treinamento
                <span className="ink-underline absolute -bottom-1 left-0 right-0" aria-hidden="true" />
              </span>
            </div>
            <DialogTitle asChild>
              <h2 className="font-display text-3xl sm:text-4xl leading-none text-left">
                Marque uma nova visita
              </h2>
            </DialogTitle>
            <p className="text-sm text-muted-foreground max-w-xl">
              Registre quem, quando e o que será treinado — os detalhes ficam disponíveis no aceite do cliente e no histórico da empresa.
            </p>
          </DialogHeader>

          <form onSubmit={submit} className="relative space-y-7">
            <section className="space-y-1.5">
              <Label htmlFor="title" className={labelCls}>
                <BookOpen className="h-3 w-3" /> Título
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Ex.: Treinamento financeiro — módulo contas a pagar"
                className={`${underline} font-display text-xl h-12`}
              />
            </section>

            <section className="grid sm:grid-cols-[1fr_220px] gap-5">
              <div className="space-y-1.5">
                <Label htmlFor="client" className={labelCls}>
                  <Building2 className="h-3 w-3" /> Cliente
                </Label>
                <Input
                  id="client"
                  list="known-companies"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  placeholder="Nome da empresa"
                  className={`${underline} font-display text-base h-10`}
                />
                <datalist id="known-companies">
                  {companies.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc" className={labelCls}>
                  <MapPin className="h-3 w-3" /> Local / Link
                </Label>
                <Input
                  id="loc"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Sala 2 ou URL"
                  className={`${underline} h-10`}
                />
              </div>
            </section>

            <section className="rounded-xl border border-border/60 bg-background/40 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <Label className={labelCls}>
                  <CalendarClock className="h-3 w-3" /> Quando
                </Label>
                <span className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground">
                  {prettyDate} {date && `· ${time}`}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="date" className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Data</Label>
                  <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={`${underline} font-display text-base h-10`} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="time" className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Hora</Label>
                  <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required className={`${underline} font-display text-base h-10`} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dur" className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Duração (min)</Label>
                  <Input id="dur" type="number" min={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={`${underline} font-display text-base h-10`} />
                </div>
              </div>
            </section>

            <section className="space-y-1.5">
              <Label htmlFor="desc" className={labelCls}>O que será treinado</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Descreva os tópicos / conteúdos treinados"
                className="bg-background/40 border-border/70 rounded-lg text-[15px] leading-relaxed resize-none focus-visible:border-primary"
              />
            </section>

            <section className="space-y-1.5">
              <Label htmlFor="notes" className={labelCls}>Observações internas</Label>
              <Textarea
                id="notes"
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                rows={2}
                placeholder="Visível apenas para a equipe — não aparece para o cliente"
                className="bg-background/40 border-dashed border-border/70 rounded-lg text-[14px] leading-relaxed resize-none focus-visible:border-primary"
              />
              <p className="text-[11px] italic text-muted-foreground">Visível apenas internamente. Não aparece para o cliente no aceite.</p>
            </section>

            <div className="flex items-center justify-between pt-2 border-t border-border/60">
              <span className="text-[11px] italic text-muted-foreground">
                {title ? `“${title.slice(0, 32)}${title.length > 32 ? "…" : ""}”` : "Sem título ainda"}
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading} className="rounded-full px-5">
                  <Feather className="h-4 w-4" />
                  {loading ? "Salvando…" : "Registrar visita"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};