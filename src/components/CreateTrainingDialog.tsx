import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Feather, CalendarClock, MapPin, Building2, BookOpen } from "lucide-react";
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
  const [requiresAcceptance, setRequiresAcceptance] = useState(true);
  const [loading, setLoading] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [companies, setCompanies] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Altura realmente visível no celular (desconta barra de endereço e teclado).
  // Sem isso o diálogo fica mais alto que a tela e a parte de baixo do
  // formulário não pode ser alcançada com o dedo.
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsSmallScreen(mq.matches);
    update();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    // Safari antigo (iOS 13) ainda usa addListener.
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setViewport(null);
      return;
    }
    const vv = window.visualViewport;
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = vv?.height ?? window.innerHeight;
        if (!height) return;
        const top = vv?.offsetTop ?? 0;
        setViewport((prev) =>
          prev && prev.height === Math.round(height) && prev.top === Math.round(top)
            ? prev
            : { height: Math.round(height), top: Math.round(top) },
        );
      });
    };
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, [open]);

  // Sempre começa no topo do formulário.
  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: 0 });
  }, [open]);

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
    setRequiresAcceptance(true); setAllDay(false);
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
      requires_acceptance: requiresAcceptance,
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
      <DialogContent
        className="
          flex flex-col gap-0 overflow-hidden p-0 shadow-2xl
          left-0 top-0 right-0 bottom-0 translate-x-0 translate-y-0
          w-screen max-w-none h-[100dvh] max-h-none rounded-none border-0 bg-card
          sm:left-1/2 sm:top-1/2 sm:right-auto sm:bottom-auto sm:-translate-x-1/2 sm:-translate-y-1/2
          sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:h-auto sm:max-h-[92vh]
          sm:rounded-2xl sm:border sm:border-border/70 sm:bg-transparent
        "
        style={
          isSmallScreen && viewport
            ? { height: viewport.height, top: viewport.top }
            : undefined
        }
      >
        <div className="composer-card paper-surface relative flex min-h-0 flex-auto flex-col overflow-hidden rounded-none border-0 sm:rounded-2xl sm:border sm:border-border/70">
          <span className="composer-sheen" aria-hidden="true" />

          <DialogHeader className="relative shrink-0 space-y-3 px-4 pb-4 pr-12 pt-6 sm:px-8 sm:pb-5 sm:pr-12 sm:pt-8">
            <div className="flex items-center gap-2 text-[11px] tracking-[0.28em] uppercase text-primary/80">
              <Feather className="h-3.5 w-3.5 feather-float" />
              <span className="relative">
                Novo treinamento
                <span className="ink-underline absolute -bottom-1 left-0 right-0" aria-hidden="true" />
              </span>
            </div>
            <DialogTitle asChild>
              <h2 className="font-display text-2xl sm:text-4xl leading-none text-left">
                Marque uma nova visita
              </h2>
            </DialogTitle>
            <p className="hidden text-sm text-muted-foreground max-w-xl sm:block">
              Registre quem, quando e o que será treinado — os detalhes ficam disponíveis no aceite do cliente e no histórico da empresa.
            </p>
          </DialogHeader>

          <form onSubmit={submit} className="relative flex min-h-0 flex-auto flex-col">
            {/* Área rolável: no celular o cabeçalho e os botões ficam fixos,
                então o dedo consegue chegar em todos os campos. */}
            <div
              ref={scrollRef}
              className="min-h-0 flex-auto space-y-7 overflow-y-auto overscroll-contain px-4 pb-6 pt-1 sm:px-8 [-webkit-overflow-scrolling:touch]"
            >
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

              <section className="grid gap-5 sm:grid-cols-[1fr_220px]">
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

              <section className="rounded-xl border border-border/60 bg-muted/30 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <Label className={labelCls}>
                    <CalendarClock className="h-3 w-3" /> Quando
                  </Label>
                  <span className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground">
                    {prettyDate} {date && (allDay ? "· Dia todo" : `· ${time}`)}
                  </span>
                </div>
                <label className="flex items-center gap-2 mb-4 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setAllDay(v);
                      if (v) { setTime("08:00"); setDuration(600); }
                      else { setTime("09:00"); setDuration(60); }
                    }}
                    className="h-4 w-4 accent-primary"
                  />
                  Visita de dia inteiro (08:00 às 18:00)
                </label>
                <div className="grid grid-cols-2 gap-4 items-end sm:grid-cols-3">
                  <div className={`space-y-1.5 ${allDay ? "col-span-2 sm:col-span-3" : ""}`}>
                    <Label htmlFor="date" className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Data</Label>
                    <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={`${underline} font-display text-base h-10`} />
                  </div>
                  {!allDay && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="time" className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Hora</Label>
                        <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required className={`${underline} font-display text-base h-10`} />
                      </div>
                      <div className="space-y-1.5 col-span-2 sm:col-span-1">
                        <Label htmlFor="dur" className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Duração (min)</Label>
                        <Input id="dur" type="number" min={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={`${underline} font-display text-base h-10`} />
                      </div>
                    </>
                  )}
                </div>
              </section>

              <section className="space-y-2">
                <Label className={labelCls}>Tipo</Label>
                <div className="grid grid-cols-3 gap-2">
                  {VISIT_TYPES.map((opt) => {
                    const Icon = opt.icon;
                    const active = visitType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setVisitType(opt.id)}
                        aria-pressed={active}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-colors ${
                          active
                            ? "border-primary/60 bg-primary/[0.08] text-foreground"
                            : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" style={active ? { color: opt.color } : undefined} />
                        {opt.short}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-2">
                <Label className={labelCls}>Necessita aceite?</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: true, label: "Sim, exigir aceite" },
                    { v: false, label: "Não é necessário" },
                  ].map((opt) => (
                    <button
                      key={String(opt.v)}
                      type="button"
                      onClick={() => setRequiresAcceptance(opt.v)}
                      aria-pressed={requiresAcceptance === opt.v}
                      className={`p-3 rounded-xl border text-xs font-medium transition-colors ${
                        requiresAcceptance === opt.v
                          ? "border-primary/60 bg-primary/[0.08] text-foreground"
                          : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] italic text-muted-foreground">
                  Sem aceite, o treinamento não aparece nos relatórios de aceite.
                </p>
              </section>

              <section className="space-y-1.5">
                <Label htmlFor="desc" className={labelCls}>O que será treinado</Label>
                <Textarea
                  id="desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Descreva os tópicos / conteúdos treinados"
                  className="bg-muted/30 border-border/70 rounded-lg text-[15px] leading-relaxed resize-none focus-visible:border-primary"
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
                  className="bg-muted/30 border-dashed border-border/70 rounded-lg text-[14px] leading-relaxed resize-none focus-visible:border-primary"
                />
                <p className="text-[11px] italic text-muted-foreground">Visível apenas internamente. Não aparece para o cliente no aceite.</p>
              </section>
            </div>

            <div className="shrink-0 border-t border-border/60 bg-card/95 px-4 py-3 sm:px-8 sm:py-4">
              <div className="flex items-center gap-2">
                <span className="hidden min-w-0 flex-1 truncate text-[11px] italic text-muted-foreground sm:block">
                  {title ? `“${title.slice(0, 32)}${title.length > 32 ? "…" : ""}”` : "Sem título ainda"}
                </span>
                <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading} className="rounded-full px-5 flex-1 sm:flex-none">
                    <Feather className="h-4 w-4" />
                    {loading ? "Salvando…" : "Registrar visita"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
