import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";

type Training = {
  id: string;
  title: string;
  client: string | null;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
};

type Row = { name: string; email: string | null; accepted_at: string; kind: "user" | "guest" };

const TrainingTerm = () => {
  const { id } = useParams();
  const [training, setTraining] = useState<Training | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const [{ data: t }, { data: ua }, { data: ga }] = await Promise.all([
        supabase.from("trainings").select("*").eq("id", id).maybeSingle(),
        supabase.rpc("get_training_user_acceptances", { _training_id: id }),
        supabase
          .from("guest_acceptances")
          .select("full_name, email, accepted_at")
          .eq("training_id", id),
      ]);
      setTraining(t as Training | null);
      const userRows: Row[] = ((ua as any[]) || []).map((a) => ({
        name: a.full_name || a.email || "Usuário",
        email: a.email ?? null,
        accepted_at: a.accepted_at,
        kind: "user",
      }));
      const guestRows: Row[] = ((ga as any[]) || []).map((a) => ({
        name: a.full_name,
        email: a.email,
        accepted_at: a.accepted_at,
        kind: "guest",
      }));
      setRows([...userRows, ...guestRows].sort((a, b) => a.accepted_at.localeCompare(b.accepted_at)));
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="min-h-screen grid place-items-center text-neutral-500">Carregando...</div>;
  if (!training) return <div className="min-h-screen grid place-items-center text-neutral-500">Treinamento não encontrado.</div>;

  const date = new Date(training.scheduled_at);

  return (
    <div className="min-h-screen bg-white text-black">
      <SEO
        title={`Termo de aceite: ${training.title} — TreinaCheck`}
        description={`Termo de aceite do treinamento "${training.title}" para impressão.`}
        path={`/treinamento/${id ?? ""}/termo`}
      />
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 18mm; }
          body { background: white !important; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print border-b border-neutral-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <BackButton to={`/treinamento/${id}`} />
          <Button onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir termo</Button>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-10 py-12">
        <header className="text-center mb-10 pb-6 border-b-2 border-black">
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-600">Use Sistemas</p>
          <h1 className="text-3xl font-bold tracking-tight mt-2 uppercase">
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
            <Field label="Treinamento" value={training.title} />
            {training.client && <Field label="Cliente" value={training.client} />}
            <Field label="Data" value={format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })} />
            <Field label="Horário" value={`${format(date, "HH:mm")} • ${training.duration_minutes} minutos`} />
            {training.location && <Field label="Local" value={training.location} />}
            {training.description && (
              <div className="pt-2">
                <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1">O que foi treinado</p>
                <p className="whitespace-pre-wrap">{training.description}</p>
              </div>
            )}
          </div>
        </section>

        <section className="mt-10 avoid-break">
          <h2 className="text-sm uppercase tracking-wider text-neutral-600 mb-3">
            Participantes que confirmaram o recebimento ({rows.length})
          </h2>
          {rows.length === 0 ? (
            <p className="text-sm text-neutral-500 italic">Nenhuma confirmação registrada até o momento.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-neutral-600 border-b border-neutral-300">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">E-mail</th>
                  <th className="py-2">Data do aceite</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-neutral-200 avoid-break">
                    <td className="py-2 pr-3 text-neutral-500">{i + 1}</td>
                    <td className="py-2 pr-3 font-medium">{r.name}</td>
                    <td className="py-2 pr-3 text-neutral-700">{r.email || "—"}</td>
                    <td className="py-2 text-neutral-700">
                      {format(new Date(r.accepted_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer className="mt-16 pt-4 border-t border-neutral-300 text-xs text-neutral-500 flex justify-between">
          <span>Use Sistemas — Termo de Recebimento</span>
          <span>Gerado em {format(new Date(), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}</span>
        </footer>
      </main>
    </div>
  );
};

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-3 text-sm">
    <span className="text-neutral-500 w-28 shrink-0">{label}</span>
    <span className="font-medium">{value}</span>
  </div>
);

export default TrainingTerm;