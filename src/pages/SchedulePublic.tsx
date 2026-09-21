import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarPlus, CheckCircle2, Clock3 } from "lucide-react";
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
      // Sort phases by position
      typedRes.phases.sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
      
      // Ensure items within each phase are strictly sorted by position
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

  return (
    <div className="min-h-screen bg-background">
      <SEO title={`Cronograma — ${schedule.client_name}`}
        description={`Cronograma de implantação ERP USE para ${schedule.client_name}.`}
        path={`/c/${token}`} />
      <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <img src={logoAsset.url} alt="Use Sistemas" className="h-7 w-auto" />
          <span className="font-semibold tracking-tight">TreinaCheck · Cronograma</span>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{schedule.client_name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Início: {format(new Date(schedule.start_date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            {" · "}{schedule.modality}{" · "}{schedule.cadence}
          </p>
        </div>

        {phases.map((p: any, i: number) => (
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
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:pl-2">
                      {it.status !== "done" && it.status !== "not_applicable" && it.approval_status !== "approved" && (
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openRequest(it)}>
                          <CalendarPlus className="h-3.5 w-3.5" />
                          {it.approval_status === "pending" ? "Trocar data" : "Agendar data"}
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
    </div>
  );
}