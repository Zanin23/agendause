import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, isAfter, isSameDay, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Printer, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Training = {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
};

const PrintAgenda = () => {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("trainings")
        .select("*")
        .order("scheduled_at", { ascending: true });
      setTrainings((data as Training[]) || []);
      setLoading(false);
    })();
  }, []);

  const upcoming = useMemo(() => {
    const today = startOfDay(new Date());
    return trainings.filter(
      (t) => isAfter(new Date(t.scheduled_at), today) || isSameDay(new Date(t.scheduled_at), today)
    );
  }, [trainings]);

  const grouped = useMemo(() => {
    const map = new Map<string, Training[]>();
    upcoming.forEach((t) => {
      const key = format(new Date(t.scheduled_at), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries());
  }, [upcoming]);

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 16mm; }
          body { background: white !important; }
          .print-row { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print border-b bg-muted/30">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-8 py-10">
        <header className="mb-8 pb-6 border-b-2 border-black">
          <h1 className="text-3xl font-bold tracking-tight">Agenda de Treinamentos</h1>
          <p className="text-sm mt-2 text-neutral-600">
            Gerado em {format(new Date(), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </header>

        {loading ? (
          <p className="text-sm text-neutral-600">Carregando…</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-neutral-600">Nenhum treinamento agendado.</p>
        ) : (
          <div className="space-y-8">
            {grouped.map(([dayKey, items]) => {
              const date = new Date(dayKey + "T00:00:00");
              return (
                <section key={dayKey} className="print-row">
                  <h2 className="text-lg font-semibold border-b border-neutral-300 pb-1 mb-3 capitalize">
                    {format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </h2>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-neutral-600">
                        <th className="py-2 pr-4 w-20">Hora</th>
                        <th className="py-2 pr-4">Treinamento</th>
                        <th className="py-2 pr-4 w-40">Local</th>
                        <th className="py-2 w-20">Duração</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((t) => (
                        <tr key={t.id} className="border-t border-neutral-200 align-top print-row">
                          <td className="py-2 pr-4 font-mono">
                            {format(new Date(t.scheduled_at), "HH:mm")}
                          </td>
                          <td className="py-2 pr-4">
                            <div className="font-medium">{t.title}</div>
                            {t.description && (
                              <div className="text-xs text-neutral-600 mt-0.5">{t.description}</div>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-neutral-700">{t.location || "—"}</td>
                          <td className="py-2 text-neutral-700">{t.duration_minutes} min</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>
        )}

        <footer className="mt-12 pt-4 border-t border-neutral-300 text-xs text-neutral-500 flex justify-between">
          <span>TreinaCheck — Agenda de Treinamentos</span>
          <span>Total: {upcoming.length} treinamento(s)</span>
        </footer>
      </main>
    </div>
  );
};

export default PrintAgenda;