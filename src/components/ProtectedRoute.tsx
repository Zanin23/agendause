import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  return children;
};