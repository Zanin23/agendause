import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileSignature,
  Loader2,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getVisitType } from "@/lib/visitType";
import { SEO } from "@/components/SEO";
import { SignaturePad } from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";

type CancellationTerm = {
  id: string;
  document_number: string;
  document_status: "pending" | "signed" | "voided";
  document_version: number;
  training_title: string;
  client_name: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  visit_type: string;
  cancellation_reason: string;
  cancelled_at: string;
  schedule_name: string | null;
  schedule_start_date: string | null;
  schedule_item_title: string | null;
  schedule_item_planned_date: string | null;
  signer_name: string | null;
  signer_email: string | null;
  signer_role: string | null;
  signature: string | null;
  signed_at: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
};

const longDate = (value: string) =>
  format(new Date(value), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });

const CancellationTermPublic = () => {
  const { token } = useParams();
  const [term, setTerm] = useState<CancellationTerm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.rpc("get_cancellation_term_by_token", {
      _token: token,
    });
    if (error) {
      setLoadError(error.message);
      setTerm(null);
    } else {
      setTerm((data as unknown as CancellationTerm | null) ?? null);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const sign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !term) return;
    if (name.trim().length < 3) return toast.error("Informe o nome de quem vai assinar.");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      return toast.error("Confira o e-mail informado ou deixe o campo em branco.");
    }
    if (!signature) return toast.error("Assine no campo indicado para continuar.");
    if (!agreed) return toast.error("Confirme que leu e concorda com o documento.");

    setSubmitting(true);
    const { error } = await supabase.rpc("sign_cancellation_term", {
      _token: token,
      _name: name.trim(),
      _email: email.trim(),
      _role: role.trim(),
      _signature: signature,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);

    toast.success("Documento assinado e registrado");
    await load();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando documento…</span>
      </div>
    );
  }

  if (!term) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6 text-center">
        <div className="max-w-md space-y-3">
          <AlertTriangle className="mx-auto h-9 w-9 text-destructive" />
          <h1 className="text-xl font-semibold">Documento não encontrado</h1>
          <p className="text-sm text-muted-foreground">
            {loadError || "Confira se o link foi copiado por completo ou solicite um novo link à equipe da Use Sistemas."}
          </p>
        </div>
      </div>
    );
  }

  const scheduledDate = new Date(term.scheduled_at);
  const visitLabel = getVisitType(term.visit_type).label.toLowerCase();
  const signed = term.document_status === "signed";
  const voided = term.document_status === "voided";

  return (
    <div className="cancellation-term-page min-h-screen bg-background">
      <SEO
        title={`Documento de cancelamento — ${term.client_name || term.training_title}`}
        description="Documento de cancelamento de visita ou treinamento e registro do ajuste necessário no cronograma."
        path={`/cancelamento/${token ?? ""}`}
      />
      <style>{`
        .cancellation-document { font-family: Georgia, 'Times New Roman', serif; }
        .cancellation-document h1, .cancellation-document h2, .cancellation-document h3 {
          font-family: Georgia, 'Times New Roman', serif;
        }
        @media print {
          @page { size: A4 portrait; margin: 13mm 15mm 15mm; }
          .no-print { display: none !important; }
          html, body, #root, body > div, .cancellation-term-page {
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            color: #111 !important;
          }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .cancellation-main {
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .cancellation-document {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 2mm !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            color: #111 !important;
            background: #fff !important;
          }
          .cancellation-document .print-muted { color: #555 !important; }
          .cancellation-document .print-border { border-color: #999 !important; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <header className="no-print border-b border-border bg-card/70 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-4xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <img src={logoAsset.url} alt="Use Sistemas" className="h-8 w-auto" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Documento de cancelamento</p>
            <p className="text-xs text-muted-foreground">Use Sistemas · Implantação</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir / salvar PDF
          </Button>
        </div>
      </header>

      <main className="cancellation-main mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
        {voided && (
          <div className="no-print rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">Este documento foi invalidado</p>
                <p className="mt-1 text-muted-foreground">
                  {term.void_reason || "A visita foi reativada ou o cancelamento foi substituído."}
                  {term.voided_at ? ` Em ${format(new Date(term.voided_at), "dd/MM/yyyy 'às' HH:mm")}.` : ""}
                </p>
              </div>
            </div>
          </div>
        )}

        {signed && (
          <div className="no-print rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="font-semibold text-emerald-700 dark:text-emerald-300">Documento assinado e registrado</p>
                <p className="mt-1 text-muted-foreground">
                  {term.signer_name} confirmou em {term.signed_at ? format(new Date(term.signed_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR }) : "data não informada"}.
                </p>
              </div>
            </div>
          </div>
        )}

        <article className="cancellation-document relative overflow-hidden rounded-2xl border border-neutral-300 bg-white px-5 py-7 text-neutral-950 shadow-xl sm:px-10 sm:py-10">
          {voided && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden="true">
              <span className="-rotate-12 border-4 border-red-600/30 px-8 py-3 text-4xl font-bold uppercase tracking-[0.2em] text-red-600/25">
                Invalidado
              </span>
            </div>
          )}

          <header className="border-b-2 border-neutral-900 pb-6">
            <div className="flex items-start justify-between gap-4">
              <img src={logoAsset.url} alt="Use Sistemas" className="h-10 w-auto object-contain" />
              <div className="text-right text-[10px] uppercase tracking-[0.2em] text-neutral-500 print-muted">
                <p>Documento nº</p>
                <p className="mt-1 font-mono text-xs font-semibold tracking-wider text-neutral-900">{term.document_number}</p>
                <p className="mt-1">Versão {term.document_version}</p>
              </div>
            </div>
            <div className="mt-7 text-center">
              <p className="text-[10px] uppercase tracking-[0.35em] text-neutral-500 print-muted">Departamento de Implantação</p>
              <h1 className="mt-2 text-2xl font-bold uppercase leading-tight sm:text-3xl">
                Termo de Cancelamento
              </h1>
              <p className="mt-1 text-sm italic text-neutral-600 print-muted">
                registro do cancelamento e do ajuste necessário no cronograma
              </p>
            </div>
          </header>

          <section className="mt-7 text-[14px] leading-relaxed sm:text-[15px]">
            <p className="text-justify">
              Este documento registra que o cliente <strong>{term.client_name || "identificado no agendamento"}</strong>
              {" "}solicitou o cancelamento da <strong>{visitLabel}</strong> descrita abaixo. A data e o horário
              estavam reservados pela <strong>Use Sistemas</strong> para esse atendimento.
            </p>
          </section>

          <section className="avoid-break mt-7">
            <DocumentSectionTitle number="I" title="Dados da visita ou treinamento cancelado" />
            <dl className="mt-4 grid gap-x-8 gap-y-3 border-y border-neutral-300 py-4 sm:grid-cols-2 print-border">
              <DocumentField label="Cliente" value={term.client_name || "Não informado"} />
              <DocumentField label="Modalidade" value={getVisitType(term.visit_type).label} />
              <DocumentField label="Atividade" value={term.training_title} />
              <DocumentField label="Data originalmente agendada" value={longDate(term.scheduled_at)} />
              <DocumentField label="Horário e duração" value={`${format(scheduledDate, "HH:mm")} · ${term.duration_minutes} minutos`} />
              <DocumentField label="Local ou acesso" value={term.location || (term.visit_type === "remoto" ? "Atendimento remoto" : "Não informado")} />
              <DocumentField label="Cancelamento registrado em" value={format(new Date(term.cancelled_at), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })} />
              <DocumentField label="Motivo informado" value={term.cancellation_reason} />
            </dl>
          </section>

          {(term.schedule_name || term.schedule_item_title || term.schedule_start_date) && (
            <section className="avoid-break mt-7">
              <DocumentSectionTitle number="II" title="Cronograma relacionado" />
              <dl className="mt-4 grid gap-x-8 gap-y-3 border-y border-neutral-300 py-4 sm:grid-cols-2 print-border">
                {term.schedule_name && <DocumentField label="Cronograma" value={term.schedule_name} />}
                {term.schedule_item_title && <DocumentField label="Etapa vinculada" value={term.schedule_item_title} />}
                {term.schedule_start_date && (
                  <DocumentField
                    label="Início do cronograma"
                    value={format(new Date(`${term.schedule_start_date}T00:00:00`), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  />
                )}
                {term.schedule_item_planned_date && (
                  <DocumentField
                    label="Data prevista da etapa"
                    value={format(new Date(`${term.schedule_item_planned_date}T00:00:00`), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  />
                )}
              </dl>
            </section>
          )}

          <section className="mt-7">
            <DocumentSectionTitle
              number={term.schedule_name || term.schedule_item_title || term.schedule_start_date ? "III" : "II"}
              title="Como o cancelamento afeta o cronograma"
            />
            <div className="mt-4 space-y-3 text-[14px] leading-relaxed sm:text-[15px]">
              <p className="text-justify">
                Quando uma atividade é cancelada, a equipe precisa reorganizar sua agenda. Por isso, o tempo
                entre a data originalmente marcada e a realização da atividade em uma nova data poderá ser
                acrescentado às próximas etapas e ao prazo final do cronograma.
              </p>
              <p className="text-justify">
                Esse ajuste não será considerado atraso da <strong>Use Sistemas</strong>, pois foi necessário
                por causa do cancelamento solicitado pelo cliente. A nova data da visita ou treinamento será
                combinada entre as partes, de acordo com a disponibilidade de todos, e o cronograma poderá ser
                atualizado para acompanhar essa mudança.
              </p>
            </div>
          </section>

          <section className="avoid-break mt-8">
            <DocumentSectionTitle
              number={term.schedule_name || term.schedule_item_title || term.schedule_start_date ? "IV" : "III"}
              title="Confirmação de quem assina"
            />
            <p className="mt-4 text-[14px] leading-relaxed sm:text-[15px]">
              Ao assinar, a pessoa escolhida pelo cliente confirma que leu este documento, que o cancelamento
              foi solicitado pelo cliente e que entendeu que as datas do cronograma poderão ser ajustadas.
            </p>

            <div className="mt-9 grid gap-8 sm:grid-cols-2">
              <div className="min-w-0">
                <div className="flex min-h-24 items-end justify-center overflow-hidden pb-2">
                  {term.signature && (
                    <img
                      src={term.signature}
                      alt={`Assinatura de ${term.signer_name || "pessoa escolhida pelo cliente"}`}
                      className="max-h-24 max-w-full object-contain"
                    />
                  )}
                </div>
                <div className="border-t border-neutral-700 pt-2 text-center">
                  <p className="break-words text-sm font-semibold">{term.signer_name || "Pessoa escolhida pelo cliente"}</p>
                  <p className="mt-0.5 break-words text-[11px] text-neutral-500 print-muted">
                    {term.signer_role || (signed ? "Pessoa indicada pelo cliente" : "Nome e assinatura")}
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 flex-col justify-end border-t border-neutral-700 pt-2 text-center sm:mt-24">
                <p className="break-words text-sm font-semibold">
                  {term.signer_email || (signed ? "Assinatura registrada eletronicamente" : "E-mail (opcional)")}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500 print-muted">
                  {term.signed_at
                    ? format(new Date(term.signed_at), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })
                    : "Data e horário da assinatura"}
                </p>
              </div>
            </div>
          </section>

          <footer className="avoid-break mt-10 border-t border-neutral-300 pt-4 text-[9px] uppercase tracking-[0.18em] text-neutral-500 print-border print-muted">
            <div className="flex flex-wrap justify-between gap-2">
              <span>Use Sistemas</span>
              <span>Termo de cancelamento</span>
              <span>Emitido em {format(new Date(term.created_at), "dd/MM/yyyy")}</span>
            </div>
            <p className="mt-2 normal-case tracking-normal">
              A autenticidade deste documento é vinculada ao número acima e ao registro eletrônico da assinatura.
            </p>
          </footer>
        </article>

        {!signed && !voided && (
          <Card className="no-print border-primary/30">
            <CardContent className="p-5 sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileSignature className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-semibold">Assinatura indicada pelo cliente</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    O cliente pode escolher quem vai assinar. Basta que essa pessoa tenha conhecimento do cancelamento, leia o documento e confirme as informações.
                  </p>
                </div>
              </div>

              <form onSubmit={sign} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="cancellation-signer-name">Nome de quem vai assinar *</Label>
                    <Input
                      id="cancellation-signer-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                      maxLength={160}
                      required
                      placeholder="Nome completo"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cancellation-signer-email">E-mail (opcional)</Label>
                    <Input
                      id="cancellation-signer-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      maxLength={254}
                      placeholder="nome@empresa.com"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cancellation-signer-role">Relação com o cliente (opcional)</Label>
                  <Input
                    id="cancellation-signer-role"
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    maxLength={120}
                    placeholder="Ex.: colaborador, sócio, gerente, contador"
                  />
                </div>

                <SignaturePad
                  label="Assinatura *"
                  hint="Assine usando o dedo, uma caneta stylus ou o mouse. Também é possível importar a assinatura de um PDF."
                  onChange={setSignature}
                  allowPdf
                />

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(event) => setAgreed(event.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span>
                    Li e concordo com este documento. Confirmo que o cancelamento foi solicitado pelo cliente e entendo que, por causa disso, as datas do cronograma poderão ser ajustadas.
                  </span>
                </label>

                <Button type="submit" disabled={submitting || !agreed} className="w-full sm:w-auto">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {submitting ? "Registrando assinatura…" : "Assinar e confirmar cancelamento"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {signed && (
          <div className="no-print flex justify-center">
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimir / salvar documento em PDF
            </Button>
          </div>
        )}

        <p className="no-print flex items-center justify-center gap-2 pb-4 text-center text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" /> Documento eletrônico emitido pela Use Sistemas
        </p>
      </main>
    </div>
  );
};

const DocumentSectionTitle = ({ number, title }: { number: string; title: string }) => (
  <div className="flex items-baseline gap-3 border-b border-neutral-300 pb-2 print-border">
    <span className="text-sm italic text-neutral-500 print-muted">{number}.</span>
    <h2 className="text-base font-bold sm:text-lg">{title}</h2>
  </div>
);

const DocumentField = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <dt className="text-[9px] uppercase tracking-[0.16em] text-neutral-500 print-muted">{label}</dt>
    <dd className="mt-1 break-words text-[13px] font-semibold leading-snug sm:text-[14px]">{value}</dd>
  </div>
);

export default CancellationTermPublic;
