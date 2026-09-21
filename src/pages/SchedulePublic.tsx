import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Clock3, List, Network } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/schedule";

export default function SchedulePublic() {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [view, setView] = useState<"lista" | "mapa">("lista");
  const [requestItem, setRequestItem] = useState<any>(null);
  const [requestDate, setRequestDate] = useState("");
  const [requestTime, setRequestTime] = useState("09:00");
  const [requestName, setRequestName] = useState("");
  const [sending, setSending] = useState(false);

  const openRequest = (item: any) => {
    setRequestItem(item);
    setRequestDate(item.planned_date ?? "");
    setRequestTime("09:00");
  };

  const sendRequest = async () => {
    if (!requestDate) return toast.error("Escolha uma data");
    if (!requestName.trim()) return toast.error("Informe seu nome");
    setSending(true);
    const { error } = await supabase.rpc("request_schedule_visit" as any, {
      _token: token,
      _item_id: requestItem.id,
      _date: requestDate,
      _time: requestTime,
      _name: requestName.trim(),
    } as any);
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success("Data enviada! Aguarde a confirmação da equipe.");
    setRequestItem(null);
    await load();
  };

  const load = async () => {
    if (!token) return;
    setLoading(true);
    const { data: res, error } = await supabase.rpc("get_schedule_by_token", { _token: token });
    if (error) toast.error(error.message);

    const typedRes = res as any;
    if (typedRes && typedRes.phases) {
      typedRes.phases.sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
      typedRes.phases.forEach((p: any) => {
        if (p.items) {
          p.items.sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
        }
      });
    }
    setData(typedRes);
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  const accept = async () => {
    if (!name.trim()) return toast.error("Informe seu nome");
    setAccepting(true);
    const ip = await fetch("https://api.ipify.org?format=json").then((r) => r.json()).then((d) => d.ip).catch(() => null);
    const { error } = await supabase.rpc("accept_schedule_by_token", { _token: token, _name: name.trim(), _ip: ip });
    if (error) { toast.error(error.message); setAccepting(false); return; }
    toast.success("Cronograma aceito!");
    await load();
    setAccepting(false);
  };

  if (loading) return <div className="p-10 text-sm text-muted-foreground">Carregando…</div>;
  if (!data || !data.schedule) return <div className="p-10 text-sm">Cronograma não encontrado.</div>;

  const { schedule, phases } = data;

  const canSchedule = (it: any) => it.status !== "done" && it.status !== "not_applicable";
  const scheduleLabel = (it: any) =>
    it.approval_status === "pending" || it.scheduled_date ? "Trocar data" : "Agendar data";

  const ItemBadges = ({ it }: { it: any }) => (
    <>
      {it.approval_status === "pending" && (
        <Badge variant="outline" className="mt-1 gap-1 text-[10px]">
          <Clock3 className="h-3 w-3" /> Aguardando confirmação da equipe
        </Badge>
      )}
      {it.approval_status === "approved" && it.scheduled_date && (
        <Badge variant="success" className="mt-1 gap-1 text-[10px]">
          <CheckCircle2 className="h-3 w-3" /> Data confirmada
        </Badge>
      )}
      {it.approval_status === "rejected" && (
        <Badge variant="destructive" className="mt-1 gap-1 text-[10px]">
          Data recusada — escolha outra
        </Badge>
      )}
    </>
  );

  const ItemDates = ({ it }: { it: any }) => (
    <>
      {it.scheduled_date && (
        <div className="text-xs text-muted-foreground">
          Visita agendada: {format(new Date(it.scheduled_date), "dd/MM/yyyy 'às' HH:mm")}
        </div>
      )}
      {it.planned_date && !it.scheduled_date && (
        <div className="text-xs text-muted-foreground">
          Previsto: {format(new Date(it.planned_date), "dd/MM/yyyy")}
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <SEO title={`Cronograma — ${schedule.client_name}`}
        description={`Cronograma de implantação ERP USE para ${schedule.client_name}.`}
        path={`/c/${token}`} />
      <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <img src={logoAsset.url} alt="Use Sistemas" className="h-7 w-auto" />
          <span className="font-semibold tracking-tight">TreinaCheck · Cronograma</span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{schedule.client_name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Início: {format(new Date(schedule.start_date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
              {" · "}{schedule.modality}{" · "}{schedule.cadence}
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-border p-1 self-start">
            <Button size="sm" variant={view === "lista" ? "default" : "ghost"} className="h-8 gap-1.5 text-xs" onClick={() => setView("lista")}>
              <List className="h-3.5 w-3.5" /> Lista
            </Button>
            <Button size="sm" variant={view === "mapa" ? "default" : "ghost"} className="h-8 gap-1.5 text-xs" onClick={() => setView("mapa")}>
              <Network className="h-3.5 w-3.5" /> Organograma
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          Para escolher a data de uma etapa, use o botão <strong>Agendar data</strong> em cada etapa. A equipe Use Sistemas confirma a data em seguida.
        </div>

        {view === "lista" && phases.map((p: any, i: number) => (
          <Card key={p.id}>
            <CardContent className="p-4 space-y-2">
              <h2 className="font-semibold">{String(i + 1).padStart(2, "0")}. {p.title}</h2>
              <ul className="space-y-1.5">
                {p.items.map((it: any) => (
                  <li key={it.id} className="flex flex-col gap-2 border-b border-border/40 pb-2 text-sm last:border-0 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-1 items-start gap-2">
                      <span className="text-muted-foreground">›</span>
                      <div className="min-w-0">
                        <div>{it.title}</div>
                        <ItemDates it={it} />
                        <ItemBadges it={it} />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:pl-2">
                      {canSchedule(it) && (
                        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => openRequest(it)}>
                          <CalendarPlus className="h-3.5 w-3.5" />
                          {scheduleLabel(it)}
                        </Button>
                      )}
                      <span className={`text-[10px] px-2 py-1 rounded shrink-0 ${STATUS_COLORS[it.status]}`}>
                        {STATUS_LABELS[it.status]}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}

        {view === "mapa" && (
          <div className="relative -mx-4">
            <div className="mb-2 flex items-center justify-between gap-2 px-4">
              <p className="text-[11px] text-muted-foreground">Arraste para o lado ou use as setas para ver todas as fases.</p>
              <div className="flex gap-1.5">
                <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Fases anteriores" onClick={() => mapRef.current?.scrollBy({ left: -300, behavior: "smooth" })}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Próximas fases" onClick={() => mapRef.current?.scrollBy({ left: 300, behavior: "smooth" })}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div
              ref={mapRef}
              onWheel={(e) => {
                const el = mapRef.current;
                if (!el) return;
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                  el.scrollLeft += e.deltaY;
                  e.preventDefault();
                }
              }}
              className="overflow-x-auto overscroll-x-contain px-4 pb-3"
            >
              <div className="flex min-w-max items-stretch gap-4">
                {phases.map((p: any, i: number) => (
                  <div key={p.id} className="flex max-h-[68vh] w-[280px] shrink-0 flex-col">
                    <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Fase {String(i + 1).padStart(2, "0")}</div>
                      <div className="text-sm font-semibold leading-snug">{p.title}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {p.items.filter((it: any) => it.status === "done").length} de {p.items.length} concluídas
                      </div>
                    </div>
                    <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                      {p.items.map((it: any) => (
                        <div key={it.id} className="rounded-xl border border-border bg-card p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-medium leading-snug">{it.title}</div>
                            <span className={`text-[10px] px-2 py-1 rounded shrink-0 ${STATUS_COLORS[it.status]}`}>
                              {STATUS_LABELS[it.status]}
                            </span>
                          </div>
                          <div className="mt-1.5 space-y-1">
                            <ItemDates it={it} />
                            <ItemBadges it={it} />
                          </div>
                          {canSchedule(it) && (
                            <Button size="sm" className="mt-2 h-8 w-full gap-1.5 text-xs" onClick={() => openRequest(it)}>
                              <CalendarPlus className="h-3.5 w-3.5" />
                              {scheduleLabel(it)}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {schedule.observations && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2">Observações</h3>
              <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">{schedule.observations}</pre>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 space-y-3">
            {schedule.accepted_at ? (
              <div className="text-emerald-600 dark:text-emerald-300 text-sm">
                ✓ Cronograma aceito por <strong>{schedule.accepted_by}</strong> em{" "}
                {format(new Date(schedule.accepted_at), "dd/MM/yyyy HH:mm")}
              </div>
            ) : (
              <>
                <h3 className="font-semibold">Aceite do cronograma</h3>
                <p className="text-sm text-muted-foreground">Confirme o recebimento e aceite as etapas planejadas.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input placeholder="Seu nome completo" value={name} onChange={(e) => setName(e.target.value)} />
                  <Button onClick={accept} disabled={accepting}>
                    {accepting ? "Confirmando…" : "Aceitar cronograma"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={Boolean(requestItem)} onOpenChange={(open) => !open && setRequestItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agendar visita</DialogTitle>
            <DialogDescription>{requestItem?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="req-date">Data</Label>
                <Input id="req-date" type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-time">Horário</Label>
                <Input id="req-time" type="time" value={requestTime} onChange={(e) => setRequestTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-name">Seu nome</Label>
              <Input id="req-name" placeholder="Quem está solicitando" value={requestName} onChange={(e) => setRequestName(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              A data fica registrada como solicitação e passa por confirmação da equipe Use Sistemas.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestItem(null)}>Cancelar</Button>
            <Button onClick={sendRequest} disabled={sending}>{sending ? "Enviando…" : "Enviar data"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
