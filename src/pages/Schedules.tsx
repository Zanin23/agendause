import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, ClipboardList, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Row = {
  id: string;
  client_name: string;
  start_date: string;
  status: string;
  cadence: string;
  modality: string;
  accepted_at: string | null;
};

export default function Schedules() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("implementation_schedules")
      .select("id,client_name,start_date,status,cadence,modality,accepted_at")
      .order("start_date", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as Row[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user?.id]);

  const remove = async (id: string) => {
    if (!confirm("Remover este cronograma?")) return;
    const { error } = await supabase.from("implementation_schedules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cronograma removido");
    load();
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Cronogramas de implantação — TreinaCheck"
        description="Gerencie cronogramas de implantação do sistema ERP USE para seus clientes."
        path="/cronogramas"
      />
      <AppHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <ClipboardList className="h-7 w-7 text-primary" /> Cronogramas
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Cronogramas de implantação do ERP USE — criados a partir do template padrão e totalmente editáveis.
            </p>
          </div>
          <Button onClick={() => navigate("/cronogramas/novo")}>
            <Plus className="h-4 w-4" /> Novo cronograma
          </Button>
        </div>

        {loading ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Carregando…</CardContent></Card>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/60" />
              <p className="text-muted-foreground">Nenhum cronograma criado ainda.</p>
              <Button onClick={() => navigate("/cronogramas/novo")}>
                <Plus className="h-4 w-4" /> Criar primeiro cronograma
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {rows.map((r) => (
              <Card key={r.id} className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-4 flex-wrap">
                  <Link to={`/cronogramas/${r.id}`} className="min-w-0 flex-1">
                    <h3 className="font-semibold break-words">{r.client_name}</h3>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
                      <span>Início: {format(new Date(r.start_date), "d MMM yyyy", { locale: ptBR })}</span>
                      <span>Cadência: {r.cadence}</span>
                      <span>Modalidade: {r.modality}</span>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    {r.accepted_at && <Badge variant="success">Aceito</Badge>}
                    <Badge variant="outline">{r.status}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/cronogramas/${r.id}`)}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(r.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}