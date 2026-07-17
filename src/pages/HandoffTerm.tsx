import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Printer, Link2, Plus, X, CheckCircle2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";

type Module = { name: string; notes?: string };
type Handoff = {
  id: string;
  schedule_id: string;
  client_name: string;
  modules: Module[];
  notes: string | null;
  public_token: string | null;
  client_accepted_at: string | null;
  client_accepted_name: string | null;
  support_accepted_at: string | null;
  support_accepted_name: string | null;
};
type Schedule = { id: string; client_name: string; start_date: string; modality: string };

const DEFAULT_MODULES: Module[] = [
  { name: "Cadastros gerais" },
  { name: "Financeiro" },
  { name: "Estoque" },
  { name: "Compras" },
  { name: "Vendas / Faturamento" },
  { name: "Fiscal / NF-e" },
];

export default function HandoffTerm() {
  const { id } = useParams();
  const { user } = useAuth();
  const { workspaces } = useWorkspace();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [loading, setLoading] = useState(true);
  const [newModule, setNewModule] = useState("");
  const [supportName, setSupportName] = useState("");

  const isSupport = useMemo(() => {
    // check membership in 'suporte' workspace via workspaces list is not enough; we rely on RPC to enforce.
    // Show the section for anyone; RPC will reject non-support users.
    return true;
  }, [workspaces]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: s, error: se } = await supabase
      .from("implementation_schedules")
      .select("id, client_name, start_date, modality")
      .eq("id", id)
      .single();
    if (se) { toast.error(se.message); setLoading(false); return; }
    setSchedule(s as Schedule);

    let { data: h } = await supabase
      .from("handoff_terms")
      .select("*")
      .eq("schedule_id", id)
      .maybeSingle();

    if (!h) {
      const { data: created, error: ce } = await supabase
        .from("handoff_terms")
        .insert(({
          schedule_id: id,
          client_name: (s as Schedule).client_name,
          modules: DEFAULT_MODULES,
          created_by: user?.id ?? null,
        }) as any)
        .select("*")
        .single();
      if (ce) { toast.error(ce.message); setLoading(false); return; }
      h = created;
      // Ao emitir o termo, conclui automaticamente o cronograma de implantação
      const { error: compErr } = await supabase.rpc("complete_schedule_for_handoff", {
        _schedule_id: id,
      });
      if (compErr) {
        toast.error(`Termo criado, mas falhou ao concluir cronograma: ${compErr.message}`);
      } else {
        toast.success("Cronograma marcado como concluído");
      }
    }
    setHandoff(h as unknown as Handoff);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const persist = async (patch: Partial<Handoff>) => {
    if (!handoff) return;
    setHandoff({ ...handoff, ...patch } as Handoff);
    const { error } = await supabase.from("handoff_terms").update(patch as any).eq("id", handoff.id);
    if (error) toast.error(error.message);
  };

  const addModule = () => {
    if (!newModule.trim() || !handoff) return;
    const next = [...(handoff.modules || []), { name: newModule.trim() }];
    persist({ modules: next });
    setNewModule("");
  };

  const removeModule = (idx: number) => {
    if (!handoff) return;
    const next = handoff.modules.filter((_, i) => i !== idx);
    persist({ modules: next });
  };

  const copyPublicLink = async () => {
    if (!handoff?.public_token) return;
    const url = `${window.location.origin}/t/${handoff.public_token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link do termo copiado");
  };

  const acceptAsSupport = async () => {
    if (!handoff) return;
    if (!supportName.trim()) return toast.error("Informe seu nome");
    const { error } = await supabase.rpc("accept_handoff_as_support", {
      _handoff_id: handoff.id, _name: supportName.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success("Termo aceito pelo Suporte");
    await load();
  };

  if (loading || !schedule || !handoff) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="max-w-4xl mx-auto px-4 py-10 text-sm text-muted-foreground">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`Termo de passagem — ${schedule.client_name}`}
        description={`Termo de passagem do cliente ${schedule.client_name} para o suporte.`}
        path={`/cronogramas/${id}/termo`}
      />
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 18mm; }
          body { background: white !important; }
          .print-surface { background: white !important; color: black !important; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print">
        <AppHeader />
      </div>

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-5 print-surface">
        <div className="no-print flex items-center justify-between gap-2 flex-wrap">
          <BackButton to={`/cronogramas/${id}`} />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyPublicLink}>
              <Link2 className="h-4 w-4" /> Link para o cliente
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimir / PDF
            </Button>
          </div>
        </div>

        <header className="text-center border-b border-border pb-6">
          <img src={logoAsset.url} alt="Use Sistemas" className="h-10 mx-auto mb-3" />
          <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Use Sistemas</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-2 uppercase">
            Termo de Passagem para o Suporte
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Formalização da conclusão da implantação e transferência do atendimento
          </p>
        </header>

        <Card className="avoid-break">
          <CardContent className="p-5 space-y-3 text-sm">
            <p>
              Declaramos que a implantação do sistema para o cliente abaixo foi concluída
              conforme o cronograma acordado e o atendimento fica, a partir desta data,
              transferido para a equipe de Suporte da Use Sistemas.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 pt-2">
              <Field label="Cliente" value={handoff.client_name} />
              <Field label="Início da implantação" value={format(new Date(schedule.start_date + "T00:00"), "d 'de' MMMM 'de' yyyy", { locale: ptBR })} />
              <Field label="Modalidade" value={schedule.modality} />
              <Field label="Termo emitido em" value={format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR })} />
            </div>
          </CardContent>
        </Card>

        <Card className="avoid-break">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Módulos implantados / escopo entregue</h2>
              <span className="text-xs text-muted-foreground">{handoff.modules.length} itens</span>
            </div>
            <ul className="space-y-1.5">
              {handoff.modules.map((m, i) => (
                <li key={i} className="flex items-center gap-2 text-sm border-b border-border/40 py-1.5 last:border-0">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="flex-1">{m.name}</span>
                  <button
                    onClick={() => removeModule(i)}
                    className="no-print text-muted-foreground hover:text-destructive"
                    aria-label="Remover módulo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
              {handoff.modules.length === 0 && (
                <li className="text-sm text-muted-foreground italic">Nenhum módulo adicionado.</li>
              )}
            </ul>
            <div className="no-print flex gap-2 pt-1">
              <Input
                value={newModule}
                onChange={(e) => setNewModule(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addModule(); } }}
                placeholder="Adicionar módulo (ex: Fiscal / NF-e)"
              />
              <Button variant="outline" onClick={addModule}>
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="avoid-break">
          <CardContent className="p-5 space-y-2">
            <h2 className="font-semibold">Observações e pendências</h2>
            <Textarea
              className="no-print"
              rows={4}
              value={handoff.notes || ""}
              onChange={(e) => persist({ notes: e.target.value })}
              placeholder="Ex.: pendências em aberto, integrações a acompanhar, prazos combinados…"
            />
            {handoff.notes && (
              <p className="hidden print:block whitespace-pre-wrap text-sm">{handoff.notes}</p>
            )}
          </CardContent>
        </Card>

        <div className="grid sm:grid-cols-2 gap-4 avoid-break">
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Aceite do Suporte</h3>
              </div>
              {handoff.support_accepted_at ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  ✓ Recebido por <strong>{handoff.support_accepted_name}</strong>
                  <br />em {format(new Date(handoff.support_accepted_at), "dd/MM/yyyy HH:mm")}
                </p>
              ) : (
                <div className="space-y-2 no-print">
                  <Input
                    placeholder="Seu nome (Suporte)"
                    value={supportName}
                    onChange={(e) => setSupportName(e.target.value)}
                  />
                  <Button size="sm" onClick={acceptAsSupport} className="w-full">
                    Registrar recebimento
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Apenas membros da base <em>Suporte</em> podem aceitar.
                  </p>
                </div>
              )}
              <div className="hidden print:block border-t border-black/40 pt-1 mt-8 text-xs text-center">
                Assinatura — Equipe de Suporte
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Aceite do Cliente</h3>
              </div>
              {handoff.client_accepted_at ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  ✓ Aceito por <strong>{handoff.client_accepted_name}</strong>
                  <br />em {format(new Date(handoff.client_accepted_at), "dd/MM/yyyy HH:mm")}
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground no-print">
                    Envie o link público para o cliente confirmar o recebimento.
                  </p>
                  <Button variant="outline" size="sm" className="w-full no-print" onClick={copyPublicLink}>
                    <Link2 className="h-4 w-4" /> Copiar link do cliente
                  </Button>
                </>
              )}
              <div className="hidden print:block border-t border-black/40 pt-1 mt-8 text-xs text-center">
                Assinatura — Cliente
              </div>
            </CardContent>
          </Card>
        </div>

        <footer className="text-center text-[11px] text-muted-foreground pt-4">
          Use Sistemas · Termo de Passagem para o Suporte · gerado em {format(new Date(), "dd/MM/yyyy HH:mm")}
        </footer>
      </main>
    </div>
  );
}

const Field = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="font-medium">{value}</p>
  </div>
);