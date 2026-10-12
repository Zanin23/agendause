import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/logo-use-sistemas.png.asset.json";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { AuthDiagnostics } from "@/components/AuthDiagnostics";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";
import { LifeBuoy, Stethoscope } from "lucide-react";

/* ---------------------------------------------------------------------------
   Entrar — e, se não conseguir entrar, sair daqui com um caminho.
   As mensagens do Supabase são traduzidas para o que fazer na prática, o
   "Esqueci minha senha" resolve sozinho e existe um diagnóstico que mostra se
   o banco está respondendo (projeto pausado, sem internet, integração pendente).
--------------------------------------------------------------------------- */

/** Converte o erro cru do Supabase em uma frase útil (com o próximo passo). */
const explicarErro = (bruto: string): string => {
  const m = (bruto || "").toLowerCase();
  if (/invalid login credentials|invalid_grant|invalid credentials/.test(m))
    return "E-mail ou senha não conferem neste banco. Se a sua conta foi criada antes de 11/10 (o sistema trocou de banco nesse dia), use “Esqueci minha senha” ou peça ao administrador para recriar a conta.";
  if (/email not confirmed/.test(m))
    return "A conta existe, mas o e-mail ainda não foi confirmado. Peça ao administrador para confirmar o acesso (Admin → contas).";
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/.test(m))
    return "Não foi possível falar com o servidor de login. Veja se a internet está ok e rode “Verificar o acesso” abaixo — se o banco estiver pausado no Supabase, nada entra até reativá-lo.";
  if (/too many requests|rate limit|over_request_rate_limit/.test(m))
    return "Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.";
  if (/provider is not enabled|unsupported provider|validation_failed/.test(m))
    return "O login com Google ainda não está habilitado neste banco. Entre com e-mail e senha (ou habilite o Google no Supabase → Authentication → Providers).";
  if (/signups not allowed|signup_disabled/.test(m))
    return "O cadastro público está desativado — as contas são criadas pelo administrador.";
  return bruto || "Erro na autenticação";
};

const Auth = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [emailEnviado, setEmailEnviado] = useState(false);
  const [mostrarAjuda, setMostrarAjuda] = useState(false);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/redefinir-senha`,
        });
        if (error) throw error;
        setEmailEnviado(true);
        toast.success("Pedido de nova senha enviado", {
          description: "Confira a caixa de entrada (e o spam) do e-mail informado.",
        });
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    } catch (err: any) {
      const mensagem = explicarErro(err?.message || String(err));
      setErro(mensagem);
      toast.error(mensagem);
      if (/servidor|internet|pausado/i.test(mensagem)) setMostrarAjuda(true);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setErro(null);
    // Fora dos domínios Lovable (ex.: Vercel), usa o Google OAuth nativo do Supabase.
    const host = window.location.hostname;
    const onLovable = /(^|\.)(lovable\.app|lovableproject\.com|lovableproject-dev\.com)$/.test(host);
    if (!onLovable) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        const mensagem = explicarErro(error.message);
        setErro(mensagem);
        toast.error(mensagem);
      }
      return;
    }
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      const mensagem = explicarErro(result.error.message || "Erro ao entrar com Google");
      setErro(mensagem);
      toast.error(mensagem);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <SEO
        title={mode === "signin" ? "Entrar — TreinaCheck" : "Recuperar acesso — TreinaCheck"}
        description="Acesse o TreinaCheck para gerenciar a agenda de treinamentos da sua equipe e registrar aceites."
        path="/auth"
      />
      <div className="w-full max-w-md space-y-4">
        <Card className="w-full">
          <CardHeader className="text-center space-y-2">
            <img src={logoAsset.url} alt="Use Sistemas" className="mx-auto h-16 w-auto" />
            <h1 className="text-2xl font-semibold leading-none">TreinaCheck</h1>
            <CardDescription>
              {mode === "signin" ? "Entre para acessar a agenda" : "Vamos criar uma senha nova para você"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {emailEnviado ? (
              <div className="space-y-3 text-sm">
                <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  Se existir uma conta com <strong>{email}</strong> neste banco, o e-mail de redefinição já saiu.
                  O link abre a tela para você escolher a senha nova.
                </p>
                <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                  <li>Confira o <strong>spam</strong> e a aba <strong>Promoções</strong>.</li>
                  <li>
                    Nada chegou em alguns minutos? A conta provavelmente não existe neste banco — o guia
                    <code className="mx-1 text-xs">docs/acesso-e-login.md</code> mostra como resolver (inclusive para
                    contas antigas).
                  </li>
                </ul>
                <Button variant="outline" className="w-full" onClick={() => { setEmailEnviado(false); setMode("signin"); }}>
                  Voltar para o login
                </Button>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                  {mode === "signin" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="password">Senha</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                        minLength={6}
                      />
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : "Enviar link de nova senha"}
                  </Button>
                </form>

                {erro && (
                  <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
                    {erro}
                  </p>
                )}

                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">ou</span>
                  <span className="h-px flex-1 bg-border" />
                </div>

                <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 mr-2">
                    <path
                      fill="#4285F4"
                      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
                    />
                    <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z" />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
                    />
                  </svg>
                  Entrar com Google
                </Button>

                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  {mode === "signin" ? (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => { setMode("reset"); setErro(null); }}
                    >
                      Esqueci minha senha
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-muted-foreground hover:underline"
                      onClick={() => { setMode("signin"); setErro(null); }}
                    >
                      Voltar para o login
                    </button>
                  )}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => setMostrarAjuda((v) => !v)}
                    aria-expanded={mostrarAjuda}
                  >
                    <LifeBuoy className="h-3.5 w-3.5" />
                    Não consigo entrar
                  </button>
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  Apenas contas criadas por administradores podem acessar o sistema.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {mostrarAjuda && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Stethoscope className="h-4 w-4 text-primary" />
                Verificar o acesso
              </div>
              <AuthDiagnostics />
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
};

export default Auth;
