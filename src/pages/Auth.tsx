import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";

const Auth = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin"); // Note: signup UI is kept for the component but could be restricted if needed. However, since the user asked that only admins create accounts, we should probably remove the toggle or restrict it.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu email se a confirmação estiver ativada.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message || "Erro na autenticação");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Erro ao entrar com Google");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <SEO
        title={mode === "signin" ? "Entrar — TreinaCheck" : "Criar conta — TreinaCheck"}
        description="Acesse o TreinaCheck para gerenciar a agenda de treinamentos da sua equipe e registrar aceites."
        path="/auth"
      />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <img src={logoAsset.url} alt="Use Sistemas" className="mx-auto h-16 w-auto" />
          <CardTitle>TreinaCheck</CardTitle>
          <CardDescription>
            {mode === "signin" ? "Entre para acessar a agenda" : "Crie sua conta"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome completo</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            Apenas contas criadas por administradores podem acessar o sistema.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;