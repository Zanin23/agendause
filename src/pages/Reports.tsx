import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, FileText, Users, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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

export default Reports;