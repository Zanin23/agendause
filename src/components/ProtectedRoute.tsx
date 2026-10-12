import { Navigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";

export const ProtectedRoute = ({ children, requireWorkspace = true }: { children: JSX.Element; requireWorkspace?: boolean }) => {
  const { user, loading } = useAuth();
  const { activeId, loading: wsLoading, error, refresh } = useWorkspace();
  const location = useLocation();
  const [tentando, setTentando] = useState(false);

  if (loading || (user && wsLoading)) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;

  // Banco fora de alcance (internet, projeto pausado, RLS): em vez de girar para
  // sempre, diz o que houve e deixa tentar de novo.
  if (error) {
    return (
      <main className="min-h-screen bg-background px-4 py-20">
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card/70 p-6">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <TriangleAlert className="h-5 w-5 text-destructive" />
            Não foi possível carregar suas bases
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Detalhe técnico: a lista de bases vem de <code>workspaces</code> no projeto{" "}
            <code>{import.meta.env.VITE_SUPABASE_PROJECT_ID || "Supabase"}</code>. Passo a passo em{" "}
            <code>docs/acesso-e-login.md</code>.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                setTentando(true);
                try {
                  await refresh();
                } finally {
                  setTentando(false);
                }
              }}
              disabled={tentando}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${tentando ? "animate-spin" : ""}`} />
              Tentar de novo
            </Button>
            <Button variant="outline" asChild>
              <a href="/auth">Voltar para o login</a>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (requireWorkspace && !activeId && location.pathname !== "/selecionar-base") {
    // Guarda a tela pedida (ex.: impressão do cronograma) para voltar nela depois da base carregar
    return <Navigate to="/selecionar-base" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
};
