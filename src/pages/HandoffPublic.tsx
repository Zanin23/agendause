import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SignaturePad } from "@/components/SignaturePad";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";

export default function HandoffPublic() {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    const { data: res, error } = await supabase.rpc("get_handoff_by_token", { _token: token });
    if (error) toast.error(error.message);
    setData(res);
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  const accept = async () => {
    if (!name.trim()) return toast.error("Informe seu nome");
    if (!signature) return toast.error("Assine no campo de assinatura");
    setBusy(true);
    const ip = await fetch("https://api.ipify.org?format=json").then((r) => r.json()).then((d) => d.ip).catch(() => null);
    const { error } = await supabase.rpc("accept_handoff_by_token", {
      _token: token,
      _name: name.trim(),
      _ip: ip,
      _signature: signature,
    } as any);
    if (error) { toast.error(error.message); setBusy(false); return; }
    toast.success("Termo aceito. Obrigado!");
    await load();
    setBusy(false);
  };

  if (loading) return <div className="p-10 text-sm text-muted-foreground">Carregando…</div>;
  if (!data) return <div className="p-10 text-sm">Termo não encontrado.</div>;

  return (
    <div className="min-h-screen bg-background">
      <SEO title={`Termo de passagem — ${data.client_name}`} description="Termo de passagem para o suporte" path={`/t/${token}`} />
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <img src={logoAsset.url} alt="Use Sistemas" className="h-7 w-auto" />
          <span className="font-semibold tracking-tight">Use Sistemas · Termo de Passagem</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Cliente</p>
          <h1 className="text-2xl font-bold">{data.client_name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Implantação iniciada em {data.schedule?.start_date ? format(new Date(data.schedule.start_date + "T00:00"), "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : "—"}
          </p>
        </div>

        <Card>
          <CardContent className="p-5 space-y-3 text-sm">
            <p>
              Confirmamos abaixo os módulos implantados e escopo entregue. A partir do aceite,
              o atendimento passa a ser realizado pela equipe de <strong>Suporte</strong> da Use Sistemas.
            </p>
            <div>
              <h3 className="font-semibold mb-2">Módulos implantados</h3>
              <ul className="space-y-1.5">
                {(data.modules || []).map((m: any, i: number) => (
                  <li key={i} className="flex items-center gap-2 border-b border-border/40 py-1.5 last:border-0">
                    <CheckCircle2 className="h-4 w-4 text-primary" /> {m.name}
                  </li>
                ))}
              </ul>
            </div>
            {data.notes && (
              <div>
                <h3 className="font-semibold mb-1">Observações</h3>
                <p className="whitespace-pre-wrap text-muted-foreground">{data.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            {data.client_accepted_at ? (
              <div className="space-y-3">
                <div className="text-emerald-600 dark:text-emerald-400 text-sm">
                  ✓ Termo aceito por <strong>{data.client_accepted_name}</strong> em{" "}
                  {format(new Date(data.client_accepted_at), "dd/MM/yyyy HH:mm")}
                </div>
                {data.client_signature && (
                  <div className="rounded-xl border border-border bg-white p-3 max-w-sm">
                    <img src={data.client_signature} alt={`Assinatura de ${data.client_accepted_name}`} className="w-full h-auto" />
                    <p className="mt-1 border-t border-neutral-300 pt-1 text-[11px] text-neutral-500 text-center">
                      {data.client_accepted_name}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <h3 className="font-semibold">Aceite do cliente</h3>
                <p className="text-sm text-muted-foreground">Confirme o recebimento e a passagem para a equipe de Suporte.</p>
                <Input placeholder="Seu nome completo" value={name} onChange={(e) => setName(e.target.value)} />
                <SignaturePad label="Assinatura do cliente *" onChange={setSignature} />
                <Button onClick={accept} disabled={busy} className="w-full sm:w-auto">
                  {busy ? "Confirmando…" : "Assinar e aceitar termo"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}