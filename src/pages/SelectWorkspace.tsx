import { useNavigate } from "react-router-dom";
import { Database, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";
import { useState } from "react";

const SelectWorkspace = () => {
  const { workspaces, loading, setActive, activeId } = useWorkspace();
  const navigate = useNavigate();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const choose = async (id: string) => {
    try {
      setPendingId(id);
      await setActive(id);
      toast.success("Base selecionada");
      navigate("/", { replace: true });
    } catch (e: any) {
      toast.error(e.message || "Erro ao selecionar base");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Selecionar base — TreinaCheck" description="Escolha a base de dados que você quer acessar." path="/selecionar-base" />
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="text-center mb-10">
          <p className="text-xs uppercase tracking-[0.3em] text-primary font-semibold">Base de dados</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-3">Escolha sua base</h1>
          <p className="text-muted-foreground mt-2">
            {activeId ? "Você pode trocar de base a qualquer momento em Configurações." : "Selecione qual base você quer acessar agora."}
          </p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : workspaces.length === 0 ? (
          <p className="text-center text-muted-foreground">Você não tem acesso a nenhuma base. Solicite acesso ao administrador.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {workspaces.map((w) => {
              const isActive = w.id === activeId;
              const pending = pendingId === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => choose(w.id)}
                  disabled={pending}
                  className={`group relative overflow-hidden text-left p-6 rounded-2xl border transition-all duration-300 hover:-translate-y-1 disabled:opacity-60 ${
                    isActive ? "border-primary/60 bg-primary/[0.06]" : "border-border/60 bg-card/80 hover:border-primary/40"
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5">
                    <Database className="h-6 w-6" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">{w.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">Base de dados {w.slug}</p>
                  {isActive && <span className="absolute top-4 right-4 text-[10px] uppercase tracking-wider text-primary font-semibold">Atual</span>}
                  {pending && <span className="absolute bottom-4 right-4 text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Trocando</span>}
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default SelectWorkspace;