import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { addWeeks, endOfWeek, format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, FileText, Users, Search, Sparkles, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

type TrainingRow = {
  id: string;
  title: string;
  client: string | null;
  scheduled_at: string;
  location: string | null;
  user_count: number;
  guest_count: number;
};

const Reports = () => {
  const [rows, setRows] = useState<TrainingRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<Date>(() => {
    // default to last week's Monday
    const thisMon = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addWeeks(thisMon, -1);
  });
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [stats, setStats] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: trainings }, { data: ua }, { data: ga }] = await Promise.all([
        supabase.from("trainings").select("id, title, client, scheduled_at, location").order("scheduled_at", { ascending: false }),
        supabase.from("training_acceptances").select("training_id"),
        supabase.from("guest_acceptances").select("training_id"),
      ]);

      const userMap = new Map<string, number>();
      ((ua as any[]) || []).forEach((r) => userMap.set(r.training_id, (userMap.get(r.training_id) || 0) + 1));
      const guestMap = new Map<string, number>();
      ((ga as any[]) || []).forEach((r) => guestMap.set(r.training_id, (guestMap.get(r.training_id) || 0) + 1));

      setRows(
        ((trainings as any[]) || []).map((t) => ({
          ...t,
          user_count: userMap.get(t.id) || 0,
          guest_count: guestMap.get(t.id) || 0,
        }))
      );
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter((r) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      r.title.toLowerCase().includes(q) ||
      (r.client || "").toLowerCase().includes(q) ||
      (r.location || "").toLowerCase().includes(q)
    );
  });

  const weekLabel = `${format(weekStart, "d MMM", { locale: ptBR })} – ${format(endOfWeek(weekStart, { weekStartsOn: 1 }), "d MMM yyyy", { locale: ptBR })}`;

  const generateReport = async () => {
    setGenerating(true);
    setReport(null);
    setStats(null);
    try {
      const { data, error } = await supabase.functions.invoke("weekly-report", {
        body: { week_start: weekStart.toISOString() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setReport((data as any).report);
      setStats((data as any).stats);
    } catch (e: any) {
      toast({ title: "Erro ao gerar relatório", description: e.message || String(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <Link to="/" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="h-3 w-3" /> Início
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight mt-2">Relatórios de aceite</h1>
            <p className="text-muted-foreground mt-1">Veja quantos participantes confirmaram cada treinamento e imprima os termos.</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Relatório semanal com IA</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setWeekStart((d) => addWeeks(d, -1))} disabled={generating}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm capitalize min-w-[180px] text-center">{weekLabel}</span>
                <Button variant="outline" size="sm" onClick={() => setWeekStart((d) => addWeeks(d, 1))} disabled={generating}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button onClick={generateReport} disabled={generating} size="sm">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {generating ? "Gerando..." : "Gerar relatório"}
                </Button>
              </div>
            </div>

            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <StatBox label="Visitas" value={stats.total_visits} />
                <StatBox label="Concluídas" value={stats.concluded_count} />
                <StatBox label="Canceladas" value={stats.cancelled_count} tone="destructive" />
                <StatBox label="Confirmação" value={`${stats.confirmation_rate_pct}%`} />
              </div>
            )}

            {report && (
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap rounded-md border bg-muted/40 p-4 text-sm leading-relaxed">
                {report}
              </div>
            )}
            {!report && !generating && (
              <p className="text-xs text-muted-foreground">
                Selecione a semana desejada e clique em "Gerar relatório" para obter um resumo automático com cancelamentos, taxa de confirmação e recomendações.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="relative max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título, cliente ou local..."
            className="pl-9"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              Nenhum treinamento encontrado.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((t) => {
              const total = t.user_count + t.guest_count;
              return (
                <Card key={t.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">{t.title}</h3>
                        {t.client && <Badge variant="secondary">{t.client}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                        <span>{format(new Date(t.scheduled_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}</span>
                        {t.location && <span>• {t.location}</span>}
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" /> {total} aceite{total === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link to={`/treinamento/${t.id}`}>
                        <Button variant="outline" size="sm">Detalhes</Button>
                      </Link>
                      <Link to={`/treinamento/${t.id}/termo`}>
                        <Button size="sm">
                          <FileText className="h-4 w-4" /> Termo
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

const StatBox = ({ label, value, tone }: { label: string; value: string | number; tone?: "destructive" }) => (
  <div className={`rounded-md border p-3 ${tone === "destructive" ? "border-destructive/40 bg-destructive/5" : "bg-muted/30"}`}>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`text-2xl font-semibold mt-0.5 ${tone === "destructive" ? "text-destructive" : ""}`}>{value}</div>
  </div>
);

export default Reports;