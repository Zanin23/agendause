import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/schedule";

export default function SchedulePublic() {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [accepting, setAccepting] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    const { data: res, error } = await supabase.rpc("get_schedule_by_token", { _token: token });
    if (error) toast.error(error.message);
    
    if (res && res.phases) {
      // Ensure items within each phase are strictly sorted by position
      res.phases.forEach((p: any) => {
        if (p.items) {
          p.items.sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
        }
      });
    }
    setData(res);
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
                  <li key={it.id} className="flex items-start justify-between gap-2 text-sm border-b border-border/40 pb-1.5 last:border-0">
                    <div className="flex items-start gap-2 flex-1">
                      <span className="text-muted-foreground">›</span>
                      <div>
                        <div>{it.title}</div>
                        {it.scheduled_date && (
                          <div className="text-xs text-muted-foreground">
                            Visita agendada: {format(new Date(it.scheduled_date), "dd/MM/yyyy")}
                          </div>
                        )}
                        {it.planned_date && !it.scheduled_date && (
                          <div className="text-xs text-muted-foreground">
                            Previsto: {format(new Date(it.planned_date), "dd/MM/yyyy")}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-1 rounded shrink-0 ${STATUS_COLORS[it.status]}`}>
                      {STATUS_LABELS[it.status]}
                    </span>
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