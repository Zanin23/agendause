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
import { LifeBuoy, Stethoscope, Mail, LockKeyhole, Eye, EyeOff, ArrowRight, Loader2, ShieldCheck } from "lucide-react";

import { AuthWelcome } from "@/components/AuthWelcome";
import { ehStatusDeInfra, explicarErroDeLogin, extrairErroAuth } from "@/lib/authErrors";
import { avisoDeProjetoAntigo, painelDoProjeto, resolverProjeto } from "@/lib/projetoAtual";
import { limparUltimoErroDeLogin, registrarErroDeLogin } from "@/lib/ultimoErroLogin";
import "@/styles/auth.css";

/* ---------------------------------------------------------------------------
   Entrar — e, se não conseguir entrar, sair daqui com um caminho.
   As mensagens do Supabase são traduzidas para o que fazer na prática, o
   "Esqueci minha senha" resolve sozinho e existe um diagnóstico que mostra se
   o banco está respondendo (projeto pausado, sem internet, integração pendente).
--------------------------------------------------------------------------- */

/* Projeto em uso (com a correção automática, quando necessária) e aviso
   visível quando o site foi publicado apontando para o projeto errado. */
const PROJETO_RESOLVIDO = resolverProjeto(
  import.meta.env.VITE_SUPABASE_URL as string | undefined,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
  import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined,
);
const PROJETO = PROJETO_RESOLVIDO.ref || PROJETO_RESOLVIDO.refOficial;
const PAINEL = painelDoProjeto(PROJETO);
const AVISO_PROJETO = avisoDeProjetoAntigo(PROJETO_RESOLVIDO);

const Auth = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [emailEnviado, setEmailEnviado] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mostrarAjuda, setMostrarAjuda] = useState(false);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  useEffect(() => { setShowPassword(false); }, [mode]);

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
      limparUltimoErroDeLogin();
    } catch (err) {
      const mensagem = explicarErroDeLogin(err, { projeto: PROJETO, painel: PAINEL });
      setErro(mensagem);
      toast.error(mensagem);
      const { status, codigo } = extrairErroAuth(err);
      // Fica registrado para o diagnóstico (dá para mandar o caso exato ao suporte).
      registrarErroDeLogin({ mensagem, status, codigo, projeto: PROJETO });
      if (ehStatusDeInfra(status) || /servidor|internet|pausado/i.test(mensagem)) setMostrarAjuda(true);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setErro(null);
    setGoogleLoading(true);
    try {
      const host = window.location.hostname;
      const onLovable = /(^|\.)(lovable\.app|lovableproject\.com|lovableproject-dev\.com)$/.test(host);
      if (!onLovable) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin },
        });
        if (error) throw error;
      } else {
        const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
        if (result.error) throw result.error;
      }
    } catch (error) {
      const message = explicarErroDeLogin(error, { projeto: PROJETO, painel: PAINEL });
      setErro(message);
      toast.error(message);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <SEO
        title={mode === "signin" ? "Entrar — TreinaCheck" : "Recuperar acesso — TreinaCheck"}
        description="Acesse o TreinaCheck para gerenciar a agenda de treinamentos da sua equipe e registrar aceites."
        path="/auth"
      />
      <div className="auth-shell">
        <AuthWelcome />
        <div className="auth-form-panel">
          <div className="auth-mobile-brand"><span className="auth-logo"><img src={logoAsset.url} alt="Use Sistemas" /></span>TreinaCheck</div>
          <div className="auth-form-inner space-y-4">
        {AVISO_PROJETO && (
          <p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
            {AVISO_PROJETO}
          </p>
        )}
        <Card className="auth-form-card">
          <CardHeader className="auth-form-heading space-y-2">
            <p className="auth-form-kicker">{mode === "signin" ? "SEU ESPAÇO DE TRABALHO" : "VAMOS RECUPERAR SEU ACESSO"}</p>
            <h1>{mode === "signin" ? "Bom ter você por aqui." : "Uma nova senha, um novo começo."}</h1>
            <CardDescription>
              {mode === "signin" ? "Entre na sua conta e continue de onde parou." : "Informe seu e-mail para receber o link de recuperação."}
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
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">E-mail de acesso</Label>
                    <div className="auth-input-wrap"><Mail size={16} />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="voce@empresa.com.br"
                      disabled={loading || googleLoading}
                      autoComplete="email"
                      required
                    />
                    </div>
                  </div>
                  {mode === "signin" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="password">Sua senha</Label>
                      <div className="auth-input-wrap auth-password-input"><LockKeyhole size={16} />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Digite sua senha"
                        disabled={loading || googleLoading}
                        autoComplete="current-password"
                        required
                        minLength={6}
                      />
                      <button type="button" className="auth-password-toggle" onClick={() => setShowPassword(value => !value)}
                        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword}>
                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                      </div>
                    </div>
                  )}
                  <Button type="submit" className="w-full auth-primary-button" disabled={loading || googleLoading}>
                    {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aguarde...</> : <>{mode === "signin" ? "Entrar na minha conta" : "Enviar link de recuperação"}<ArrowRight className="h-4 w-4 ml-2" /></>}
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

                <Button type="button" variant="outline" className="w-full auth-google-button" onClick={handleGoogle} disabled={loading || googleLoading}>
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
                  {googleLoading ? "Conectando ao Google..." : "Continuar com Google"}
                </Button>

                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  {mode === "signin" ? (
                    <button
                      type="button"
                      className="text-primary hover:underline disabled:opacity-50"
                      disabled={loading || googleLoading}
                      onClick={() => { setMode("reset"); setErro(null); }}
                    >
                      Esqueci minha senha
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-muted-foreground hover:underline disabled:opacity-50"
                      disabled={loading || googleLoading}
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

                <p className="text-center text-xs leading-relaxed text-muted-foreground pt-2">
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
          <p className="auth-form-footnote"><ShieldCheck size={13} /> Acesso à sua equipe · TreinaCheck por Use Sistemas</p>
        </div>
      </div>
    </main>
  );
};

export default Auth;
