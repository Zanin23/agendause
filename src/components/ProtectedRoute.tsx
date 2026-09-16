import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";

export const ProtectedRoute = ({ children, requireWorkspace = true }: { children: JSX.Element; requireWorkspace?: boolean }) => {
  const { user, loading } = useAuth();
  const { activeId, loading: wsLoading } = useWorkspace();
  const location = useLocation();
  if (loading || (user && wsLoading)) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (requireWorkspace && !activeId && location.pathname !== "/selecionar-base") {
    // Guarda a tela pedida (ex.: impressão do cronograma) para voltar nela depois da base carregar
    return <Navigate to="/selecionar-base" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
};