import { publicUrl } from "@/lib/publicUrl";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


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
  const [askComplete, setAskComplete] = useState(false);


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
      // Pergunta antes de concluir o cronograma
      setAskComplete(true);
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
    const url = publicUrl(`/t/${handoff.public_token}`);
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
          @page { size: A4; margin: 12mm 14mm; }
          html, body { background: white !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden; }
          main.print-surface, main.print-surface * { visibility: visible; }
          main.print-surface { position: absolute; left: 0; top: 0; right: 0; }
          main.print-surface { max-width: 100% !important; padding: 0 !important; }
          main.print-surface > * { margin-top: 0 !important; }
          main.print-surface > * + * { margin-top: 10px !important; }
          .print-surface {
            background: white !important;
            color: #111 !important;
            font-family: 'Georgia', 'Times New Roman', serif !important;
          }
          .print-surface h1, .print-surface h2, .print-surface h3 {
            font-family: 'Georgia', 'Times New Roman', serif !important;
            color: #111 !important;
          }
          .print-surface .card,
          .print-surface [data-slot="card"] {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
          .print-hairline { border-color: #111 !important; }
          .print-muted { color: #555 !important; }
          .print-body { font-size: 10pt; line-height: 1.45; }
          .print-hero-rule { background: #111 !important; }
          .print-sig-line { border-top: 1px solid #111 !important; }
          .print-compact-header { padding-bottom: 10px !important; }
          .print-compact-header .print-header-top { margin-bottom: 10px !important; }
          .print-compact-header h1 { font-size: 22pt !important; line-height: 1.1 !important; }
          .print-compact-header h1 span { font-size: 12pt !important; }
          .print-compact-header .print-hero-rule { margin-top: 8px !important; }
          .print-fields { margin-top: 10px !important; padding: 8px 0 !important; gap: 6px 24px !important; }
          .print-fields dd { font-size: 10.5pt !important; margin-top: 2px !important; }
          .print-modules { margin-top: 8px !important; }
          .print-modules li { padding: 3px 0 !important; font-size: 10pt !important; }
          .print-signatures { margin-top: 24px !important; padding-top: 0 !important; gap: 32px !important; }
          .print-signatures .sig-space { min-height: 44px !important; }
          .print-footer { padding-top: 10px !important; margin-top: 10px !important; }
        }
        .doc-serif { font-family: 'Georgia', 'Times New Roman', serif; }
      `}</style>

      <div className="no-print">
        <AppHeader />
      </div>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-10 space-y-6 print-surface">
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

        <header className="pb-8 border-b-2 border-foreground/80 print-hairline print-compact-header">
          <div className="flex items-center justify-between gap-4 mb-8 print-header-top">
            <img src={logoAsset.url} alt="Use Sistemas" className="h-9" />
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground print-muted">
                Documento nº
              </p>
              <p className="text-xs font-mono tracking-wider mt-0.5">
                {handoff.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground print-muted mb-3">
              Use Sistemas · Departamento de Implantação
            </p>
            <h1 className="doc-serif text-3xl sm:text-4xl font-normal tracking-tight leading-tight">
              Termo de Passagem
              <span className="block text-lg sm:text-xl italic text-muted-foreground print-muted mt-1">
                para o Suporte Técnico
              </span>
            </h1>
            <div className="mx-auto mt-5 h-px w-16 bg-foreground/60 print-hero-rule" />
          </div>
        </header>

        <section className="avoid-break print-body">
          <p className="doc-serif text-[15px] leading-relaxed text-justify indent-8">
            Pelo presente instrumento, a <strong>Use Sistemas</strong>, por meio de sua equipe de
            Implantação, declara ter concluído os trabalhos de implantação do sistema junto ao
            cliente identificado abaixo, conforme cronograma acordado, e formaliza, nesta data, a
            transferência do atendimento continuado para a equipe de <strong>Suporte Técnico</strong>.
          </p>
          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4 mt-8 border-y border-foreground/20 print-hairline py-5 print-fields">
            <DocField label="Cliente" value={handoff.client_name} />
            <DocField
              label="Início da implantação"
              value={format(new Date(schedule.start_date + "T00:00"), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            />
            <DocField label="Modalidade" value={schedule.modality} />
            <DocField
              label="Termo emitido em"
              value={format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            />
          </dl>
        </section>

        <section className="avoid-break">
          <SectionTitle numeral="I" title="Módulos implantados e escopo entregue" />
          <ol className="mt-4 grid sm:grid-cols-2 gap-x-8 print-modules">
            {handoff.modules.map((m, i) => (
              <li
                key={i}
                className="doc-serif text-[14px] flex items-baseline gap-3 py-2 border-b border-foreground/10 print-hairline group"
              >
                <span className="text-[11px] tabular-nums text-muted-foreground print-muted w-6">
                  {String(i + 1).padStart(2, "0")}.
                </span>
                <span className="flex-1">{m.name}</span>
                <button
                  onClick={() => removeModule(i)}
                  className="no-print opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                  aria-label="Remover módulo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {handoff.modules.length === 0 && (
              <li className="doc-serif text-sm italic text-muted-foreground py-2">
                Nenhum módulo registrado.
              </li>
            )}
          </ol>
          <div className="no-print flex gap-2 pt-4">
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
        </section>

        <section className="avoid-break">
          <SectionTitle numeral="II" title="Observações e pendências" />
          <Textarea
            className="no-print mt-4"
            rows={4}
            value={handoff.notes || ""}
            onChange={(e) => persist({ notes: e.target.value })}
            placeholder="Ex.: pendências em aberto, integrações a acompanhar, prazos combinados…"
          />
          {handoff.notes ? (
            <p className="hidden print:block doc-serif text-[14px] leading-relaxed whitespace-pre-wrap mt-4 text-justify">
              {handoff.notes}
            </p>
          ) : (
            <p className="hidden print:block doc-serif text-[13px] italic text-muted-foreground mt-4">
              Sem observações registradas.
            </p>
          )}
        </section>

        <section className="avoid-break pt-4">
          <SectionTitle numeral="III" title="Aceites" />
          <div className="grid sm:grid-cols-2 gap-10 mt-10 pt-4 print-signatures">
            <SignatureBlock
              role="Equipe de Suporte"
              name={handoff.support_accepted_name}
              at={handoff.support_accepted_at}
            >
              {!handoff.support_accepted_at && (
                <div className="space-y-2 no-print mt-3">
                  <Input
                    placeholder="Seu nome (Suporte)"
                    value={supportName}
                    onChange={(e) => setSupportName(e.target.value)}
                  />
                  <Button size="sm" onClick={acceptAsSupport} className="w-full">
                    <ShieldCheck className="h-4 w-4" /> Registrar recebimento
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Apenas membros da base <em>Suporte</em> podem aceitar.
                  </p>
                </div>
              )}
            </SignatureBlock>
            <SignatureBlock
              role="Equipe de Implantação"
              name={null}
              at={null}
            />
          </div>
        </section>

        <footer className="pt-8 mt-6 border-t border-foreground/20 print-hairline print-footer">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-muted-foreground print-muted">
            <span>Use Sistemas</span>
            <span>Termo de Passagem</span>
            <span>{format(new Date(), "dd/MM/yyyy")}</span>
          </div>
        </footer>
      </main>

      <Dialog open={askComplete} onOpenChange={setAskComplete}>
        <DialogContent className="no-print">
          <DialogHeader>
            <DialogTitle>Concluir o cronograma?</DialogTitle>
            <DialogDescription>
              Deseja marcar todas as etapas do cronograma de {schedule.client_name} como concluídas
              agora que o termo de passagem foi gerado? O termo já está criado de qualquer forma.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAskComplete(false)}>
              Não concluir
            </Button>
            <Button onClick={completeSchedule}>Sim, concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>

  );
}

const DocField = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground print-muted">
      {label}
    </dt>
    <dd className="doc-serif text-[15px] mt-1">{value}</dd>
  </div>
);

const SectionTitle = ({ numeral, title }: { numeral: string; title: string }) => (
  <div className="flex items-baseline gap-3 border-b border-foreground/30 print-hairline pb-2">
    <span className="doc-serif text-sm italic text-muted-foreground print-muted tabular-nums">
      {numeral}.
    </span>
    <h2 className="doc-serif text-lg font-normal tracking-tight">{title}</h2>
  </div>
);

const SignatureBlock = ({
  role,
  name,
  at,
  children,
}: {
  role: string;
  name: string | null;
  at: string | null;
  children?: React.ReactNode;
}) => (
  <div className="flex flex-col">
    <div className="min-h-[64px] flex items-end justify-center pb-1 sig-space">
      {at && name && (
        <span
          className="doc-serif italic text-2xl"
          style={{ fontFamily: "'Homemade Apple', 'Segoe Script', 'Georgia', cursive" }}
        >
          {name}
        </span>
      )}
    </div>
    <div className="border-t border-foreground/70 print-sig-line pt-2 text-center">
      <p className="doc-serif text-[13px] font-medium">{role}</p>
      {at ? (
        <p className="text-[11px] text-muted-foreground print-muted mt-0.5">
          {name} · {format(new Date(at), "dd/MM/yyyy 'às' HH:mm")}
        </p>
      ) : (
        <p className="text-[11px] italic text-muted-foreground print-muted mt-0.5">
          Aguardando assinatura
        </p>
      )}
    </div>
    {children}
  </div>
);