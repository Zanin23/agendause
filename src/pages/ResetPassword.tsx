import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SEO } from "@/components/SEO";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";

/* ---------------------------------------------------------------------------
   /redefinir-senha — destino do link "Esqueci minha senha".
   O Supabase manda o usuário para cá com uma sessão de recuperação; aqui ele
   escolhe a senha nova. Se o link veio quebrado/expirado, explicamos e damos o
   caminho de volta.
--------------------------------------------------------------------------- */

const erroDoLink = (): string | null => {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash?.replace(/^#/, "") || "";
  const query = window.location.search?.replace(/^\?/, "") || "";
  const params = new URLSearchParams(hash || query);
  const erro = params.get("error") || params.get("error_code");
  if (!erro) return null;
  const codigo = params.get("error_code") || erro;
  const descricao = (params.get("error_description") || "").replace(/\+/g, " ");
  if (/otp_expired|expired/i.test(codigo + descricao))
    return "Este link já expirou (eles valem por 1 hora). Peça um novo em “Esqueci minha senha”.";
  if (/access_denied/i.test(codigo))
    return `O link não foi aceito${descricao ? ` (${descricao})` : ""}. Peça um novo em “Esqueci minha senha”.`;
  return descricao || `Não foi possível usar este link (${codigo}).`;
};

const explicarSenha = (bruto: string) => {
  const m = (bruto || "").toLowerCase();
  if (/weak|easy to guess|pwned|leaked/.test(m))
    return "Esta senha é muito comum e foi recusada por segurança. Use letras, números e um símbolo.";
  if (/at least|should be|length/.test(m)) return "A senha é curta demais — use pelo menos 6 caracteres.";
  return bruto || "Não foi possível salvar a senha";
};

const ResetPassword = () => {
  const navigate = useNavigate();
  const [erroLink, setErroLink] = useState<string | null>(null);
  const [temSessao, setTemSessao] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const falha = erroDoLink();
    if (falha) {
      setErroLink(falha);
      setVerificando(false);
      return;
    }

    let vivo = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (!vivo) return;
      if (evento === "PASSWORD_RECOVERY" || sessao) {
        setTemSessao(true);
        setEmail(sessao?.user?.email ?? null);
        setVerificando(false);
      }
    });

    // se o link já criou a sessão antes deste componente montar
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      if (data.session) {
        setTemSessao(true);
        setEmail(data.session.user.email ?? null);
        setVerificando(false);
      } else {
        // dá um tempo para o supabase-js trocar o token do hash por sessão
        setTimeout(() => {
          if (!vivo) return;
          setVerificando((v) => {
            if (v) setErroLink("Não encontramos um link de recuperação válido nesta página. Peça um novo em “Esqueci minha senha”.");
            return false;
          });
        }, 1500);
      }
    });

    return () => {
      vivo = false;
      subscription.unsubscribe();
    };
  }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < 6) return toast.error("A senha precisa ter pelo menos 6 caracteres");
    if (senha !== confirmar) return toast.error("As senhas não coincidem");
    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      toast.success("Senha atualizada. Você já está dentro.");
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(explicarSenha(err?.message || String(err)));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <SEO title="Nova senha — TreinaCheck" description="Defina uma nova senha de acesso ao TreinaCheck." path="/redefinir-senha" />
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <KeyRound className="h-5 w-5" />
            <span className="text-xs uppercase tracking-[0.2em] font-semibold">Recuperar acesso</span>
          </div>
          <h1 className="text-2xl font-semibold leading-none">Escolha uma senha nova</h1>
          <CardDescription>{email ? `Para a conta ${email}.` : "Você chega aqui pelo link enviado por e-mail."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {verificando ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Conferindo o link...
            </p>
          ) : !temSessao ? (
            <div className="space-y-3 text-sm">
              <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">{erroLink}</p>
              <Button asChild className="w-full">
                <Link to="/auth">Voltar e pedir um novo link</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={salvar} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="senha">Nova senha</Label>
                <Input
                  id="senha"
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmar">Repita a nova senha</Label>
                <Input
                  id="confirmar"
                  type="password"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar senha e entrar"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Dica: uma frase com números e um símbolo (ex.: <em>Use2026!agenda</em>) é fácil de lembrar e difícil de adivinhar.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default ResetPassword;
