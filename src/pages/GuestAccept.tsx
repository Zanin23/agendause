import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Building2, Calendar as CalIcon, Clock, MapPin, Paperclip, Download, File as FileIcon, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";
import { SignaturePad } from "@/components/SignaturePad";

type Training = {
  id: string;
  title: string;
  client: string | null;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
};

type AttachmentRow = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
};

const formatBytes = (n: number | null) => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const GuestAccept = () => {
  const { id } = useParams();
  const [training, setTraining] = useState<Training | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ name: string; email: string; at: string; signature: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const { data } = await supabase.rpc("get_public_training", { _id: id });
      const t = Array.isArray(data) ? (data[0] as Training | undefined) : (data as Training | null);
      setTraining((t as Training) ?? null);
      const { data: at } = await supabase.rpc("get_public_training_attachments", { _training_id: id });
      setAttachments(((at as AttachmentRow[]) || []));
      setLoading(false);
    })();
  }, [id]);

  const downloadAttachment = async (att: AttachmentRow) => {
    try {
      const { data, error } = await supabase.functions.invoke("attachment-signed-url", {
        body: { attachment_id: att.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      window.open((data as any).url, "_blank");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao baixar");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!fullName.trim()) {
      toast.error("Informe seu nome completo.");
      return;
    }
    const mail = email.trim();
    if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    if (!signature) {
      toast.error("Assine no campo de assinatura para confirmar.");
      return;
    }
    const acceptedAt = new Date().toISOString();
    setSubmitting(true);
    const { error } = await supabase
      .from("guest_acceptances")
      .insert(({
        training_id: id,
        full_name: fullName.trim(),
        email: mail,
        accepted_at: acceptedAt,
        signature,
      }) as any);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDone({ name: fullName.trim(), email: mail, at: acceptedAt, signature });
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
      <SEO
        title={`Aceite: ${training.title} — TreinaCheck`}
        description={`Confirme o recebimento do treinamento "${training.title}"${training.client ? ` para ${training.client}` : ""}.`}
        path={`/aceite/${id ?? ""}`}
      />
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
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

        {attachments.length > 0 && (
          <Card>
            <CardContent className="p-5 space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Paperclip className="h-4 w-4" /> Materiais do treinamento
              </h3>
              <div className="space-y-2">
                {attachments.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => downloadAttachment(a)}
                    className="w-full flex items-center gap-3 rounded-md border border-border p-2.5 text-sm hover:bg-accent transition-colors text-left"
                  >
                    <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{a.file_name}</p>
                      {a.size_bytes != null && (
                        <p className="text-xs text-muted-foreground">{formatBytes(a.size_bytes)}</p>
                      )}
                    </div>
                    <Download className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {done ? (
          <>
            <Card className="border-primary/40 no-print">
              <CardContent className="p-6 text-center space-y-3">
                <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
                <h2 className="font-semibold">Recebimento confirmado</h2>
                <p className="text-sm text-muted-foreground">
                  Obrigado, <strong>{done.name}</strong>. Registramos seu aceite em{" "}
                  {format(new Date(done.at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}.
                </p>
                <Button onClick={() => window.print()} className="w-full sm:w-auto">
                  <Printer className="h-4 w-4 mr-2" /> Imprimir / salvar termo em PDF
                </Button>
              </CardContent>
            </Card>

            {/* Termo imprimível — mesmo layout do termo interno */}
            <div className="print-term bg-white text-black px-8 py-10 rounded-lg border border-neutral-200">
              <header className="text-center mb-10 pb-6 border-b-2 border-black">
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-600">Use Sistemas</p>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-2 uppercase">
                  Termo de Recebimento de Treinamento
                </h1>
              </header>

              <section className="space-y-4 text-[15px] leading-relaxed">
                <p>
                  Declaro, para os devidos fins, que recebi o treinamento descrito abaixo e estou
                  ciente do seu conteúdo, comprometendo-me a aplicar as orientações recebidas no
                  exercício de minhas atividades.
                </p>

                <div className="border border-neutral-300 rounded p-5 space-y-2 avoid-break">
                  <TermField label="Treinamento" value={training.title} />
                  {training.client && <TermField label="Cliente" value={training.client} />}
                  <TermField label="Data" value={format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })} />
                  <TermField label="Horário" value={`${format(date, "HH:mm")} • ${training.duration_minutes} minutos`} />
                  {training.location && <TermField label="Local" value={training.location} />}
                </div>

                <div className="border border-neutral-300 rounded p-5 avoid-break">
                  <p className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
                    Descrição do que foi treinado
                  </p>
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                    {training.description?.trim() || "Não informado."}
                  </p>
                </div>
              </section>

              <section className="mt-10 avoid-break">
                <h2 className="text-sm uppercase tracking-wider text-neutral-600 mb-3">
                  Participantes que confirmaram o recebimento (1)
                </h2>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-neutral-600 border-b border-neutral-300">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Nome</th>
                      <th className="py-2 pr-3">E-mail</th>
                      <th className="py-2 pr-3">Data do aceite</th>
                      <th className="py-2">Assinatura</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-neutral-200 avoid-break">
                      <td className="py-2 pr-3 text-neutral-500">1</td>
                      <td className="py-2 pr-3 font-medium">{done.name}</td>
                      <td className="py-2 pr-3 text-neutral-700">{done.email}</td>
                      <td className="py-2 pr-3 text-neutral-700">
                        {format(new Date(done.at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                      </td>
                      <td className="py-2">
                        {done.signature ? (
                          <img
                            src={done.signature}
                            alt={`Assinatura de ${done.name}`}
                            className="h-12 w-auto max-w-[180px] object-contain"
                          />
                        ) : (
                          <span className="text-neutral-400 italic text-xs">sem assinatura</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <footer className="mt-16 pt-4 border-t border-neutral-300 text-xs text-neutral-500 flex justify-between">
                <span>Use Sistemas — Termo de Recebimento</span>
                <span>Gerado em {format(new Date(), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}</span>
              </footer>
            </div>
            <style>{`
              @media print {
                body * { visibility: hidden !important; }
                .print-term, .print-term * { visibility: visible !important; }
                .print-term {
                  position: absolute; left: 0; top: 0; width: 100%;
                  border: none !important; box-shadow: none !important;
                  color: #000 !important; background: #fff !important;
                }
                @page { size: A4 portrait; margin: 18mm; }
                .print-term { padding: 0 !important; }
                .avoid-break { break-inside: avoid; page-break-inside: avoid; }
              }
            `}</style>
          </>
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
              <Label htmlFor="email">E-mail *</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
            </div>
            <SignaturePad
              label="Assinatura do participante *"
              onChange={setSignature}
            />
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