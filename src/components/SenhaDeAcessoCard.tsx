import { useState } from "react";
import { KeyRound, Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  classificarForca,
  trocarSenhaDeAcesso,
  type CampoDeSenha,
  type NivelDeForca,
} from "@/lib/trocarSenha";

/* ---------------------------------------------------------------------------
   Senha de acesso — troca da própria senha, sem sair do sistema.

   Pede a senha atual de propósito: sem isso, quem passasse por um computador
   com a sessão aberta trocaria a senha do dono da conta. A confirmação é feita
   no próprio Supabase (entrar com a senha atual), o que também renova a sessão.
--------------------------------------------------------------------------- */

const CORES_DA_FORCA: Record<NivelDeForca, string> = {
  curta: "bg-destructive",
  fraca: "bg-destructive",
  media: "bg-amber-500",
  boa: "bg-emerald-500",
  forte: "bg-emerald-600",
};

const Campo = ({
  id,
  rotulo,
  valor,
  onChange,
  autoComplete,
  ajuda,
  erro,
  disabled,
  visivel,
  alternarVisibilidade,
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  autoComplete: string;
  ajuda?: string;
  erro?: string | null;
  disabled?: boolean;
  visivel: boolean;
  alternarVisibilidade: () => void;
}) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{rotulo}</Label>
    <div className="relative">
      <Input
        id={id}
        type={visivel ? "text" : "password"}
        value={valor}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-describedby={ajuda ? `${id}-ajuda` : undefined}
        aria-invalid={erro ? true : undefined}
        className="pr-11"
      />
      <button
        type="button"
        onClick={alternarVisibilidade}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={visivel ? `Ocultar ${rotulo.toLowerCase()}` : `Mostrar ${rotulo.toLowerCase()}`}
        aria-pressed={visivel}
        tabIndex={-1}
      >
        {visivel ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
    {ajuda && !erro && (
      <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
        {ajuda}
      </p>
    )}
  </div>
);

export function SenhaDeAcessoCard() {
  const { user } = useAuth();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<{ campo?: CampoDeSenha; mensagem: string } | null>(null);
  const [mostrar, setMostrar] = useState<{ atual: boolean; nova: boolean; confirmar: boolean }>({
    atual: false,
    nova: false,
    confirmar: false,
  });

  const email = user?.email ?? null;
  const forca = classificarForca(nova);

  const limpar = () => {
    setAtual("");
    setNova("");
    setConfirmar("");
    setMostrar({ atual: false, nova: false, confirmar: false });
  };

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const resultado = await trocarSenhaDeAcesso(supabase.auth, { email, atual, nova, confirmar });
      if (!resultado.ok) {
        const mensagem = resultado.mensagem || "Não foi possível trocar a senha. Tente novamente.";
        setErro({ campo: resultado.campo, mensagem });
        toast.error(mensagem);
        return;
      }
      limpar();
      toast.success("Senha de acesso atualizada", {
        description: "Use a nova senha no próximo login. Esta sessão continua aberta.",
      });
    } finally {
      setSalvando(false);
    }
  };

  if (!email) {
    return (
      <section className="rounded-2xl border border-border bg-card/60 p-6">
        <header className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Senha de acesso</h2>
            <p className="text-sm text-muted-foreground">
              Entre novamente para trocar sua senha (não conseguimos identificar seu e-mail nesta sessão).
            </p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card/60 p-6">
      <header className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Senha de acesso</h2>
          <p className="text-sm text-muted-foreground">
            Troque a sua senha sem sair do sistema. Vale para o próximo login.
          </p>
        </div>
      </header>

      <form onSubmit={enviar} className="space-y-4">
        <Campo
          id="senha-atual"
          rotulo="Senha atual"
          valor={atual}
          onChange={setAtual}
          autoComplete="current-password"
          erro={erro?.campo === "atual" ? erro.mensagem : null}
          disabled={salvando}
          visivel={mostrar.atual}
          alternarVisibilidade={() => setMostrar((v) => ({ ...v, atual: !v.atual }))}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            id="senha-nova"
            rotulo="Nova senha"
            valor={nova}
            onChange={setNova}
            autoComplete="new-password"
            ajuda="Pelo menos 6 caracteres — misturar letras, números e um símbolo deixa a senha bem mais forte."
            erro={erro?.campo === "nova" ? erro.mensagem : null}
            disabled={salvando}
            visivel={mostrar.nova}
            alternarVisibilidade={() => setMostrar((v) => ({ ...v, nova: !v.nova }))}
          />
          <Campo
            id="senha-confirmar"
            rotulo="Repita a nova senha"
            valor={confirmar}
            onChange={setConfirmar}
            autoComplete="new-password"
            erro={erro?.campo === "confirmar" ? erro.mensagem : null}
            disabled={salvando}
            visivel={mostrar.confirmar}
            alternarVisibilidade={() => setMostrar((v) => ({ ...v, confirmar: !v.confirmar }))}
          />
        </div>

        {nova.length > 0 && (
          <div className="space-y-1.5" aria-live="polite">
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all ${CORES_DA_FORCA[forca.nivel]}`}
                  style={{ width: `${(forca.nivelVisual / 4) * 100}%` }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{forca.rotulo}</span>
            </div>
            <p className="text-xs text-muted-foreground">{forca.dica}</p>
          </div>
        )}

        {erro && (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
            {erro.mensagem}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-primary/5 border border-primary/15 p-4">
          <div className="flex items-start gap-2 text-xs text-muted-foreground max-w-md">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <span>
              Conferimos a senha atual antes de trocar. Não lembra dela? Saia e use <strong>“Esqueci minha senha”</strong> na
              tela de login.
            </span>
          </div>
          <Button type="submit" disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
            {salvando ? "Salvando..." : "Trocar senha"}
          </Button>
        </div>
      </form>
    </section>
  );
}
