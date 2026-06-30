import { useState } from "react";
import { Database, Loader2, Check } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";

const Settings = () => {
  const { workspaces, activeId, setActive, loading } = useWorkspace();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const choose = async (id: string) => {
    if (id === activeId) return;
    try {
      setPendingId(id);
      await setActive(id);
      toast.success("Base ativa alterada");
    } catch (e: any) {
      toast.error(e.message || "Erro ao trocar base");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Configurações — TreinaCheck" description="Configurações da conta e da base de dados ativa." path="/configuracoes" />
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        <div>
          <BackButton />
          <h1 className="text-3xl font-semibold tracking-tight mt-3">Configurações</h1>
          <p className="text-muted-foreground mt-1">Ajuste preferências da sua conta.</p>
        </div>

        <section className="rounded-2xl border border-border bg-card/60 p-6">
          <header className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Base de dados ativa</h2>
              <p className="text-sm text-muted-foreground">Trocar a base muda todos os dados visíveis no app.</p>
            </div>
          </header>
          {loading ? (
            <div className="text-muted-foreground inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
          ) : (
            <div className="space-y-2">
              {workspaces.map((w) => {
                const isActive = w.id === activeId;
                const pending = pendingId === w.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => choose(w.id)}
                    disabled={pending || isActive}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-colors ${
                      isActive ? "border-primary/60 bg-primary/[0.06]" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div>
                      <div className="font-medium">{w.name}</div>
                      <div className="text-xs text-muted-foreground">{w.slug}</div>
                    </div>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs text-primary font-semibold uppercase tracking-wider">
                        <Check className="h-3.5 w-3.5" /> Ativa
                      </span>
                    ) : pending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Selecionar</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Settings;