import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ehStatusDeInfra, mensagemServidorFora } from "@/lib/authErrors";

/* ---------------------------------------------------------------------------
   Diagnóstico de acesso — responde, em português, por que o login não passa:
   · o servidor de login (GoTrue) está de pé?
   · o banco (PostgREST) responde?
   · a integração do relatório já foi publicada?
   · existe sessão salva neste navegador?
   Tudo com a chave pública (anon), então pode ser rodado na tela de login.
--------------------------------------------------------------------------- */

const URL_BASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "") || "";
const CHAVE = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || "";
const PROJETO =
  (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) ||
  URL_BASE.replace(/^https?:\/\//, "").split(".")[0] ||
  "—";

type Nivel = "ok" | "aviso" | "erro";

type Checagem = {
  chave: string;
  rotulo: string;
  nivel: Nivel;
  detalhe: string;
  /** Link de ação (ex.: painel do Supabase para retomar o projeto). */
  acao?: { href: string; texto: string };
};

const buscar = async (url: string, ms = 8000) => {
  const ctrl = new AbortController();
  const alarme = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` },
    });
  } finally {
    clearTimeout(alarme);
  }
};

const porqueFalhou = (e: unknown) =>
  (e as Error)?.name === "AbortError" ? "sem resposta em 8s" : (e as Error)?.message || "falha de rede";

const PAINEL = PROJETO && PROJETO !== "—" ? `https://supabase.com/dashboard/project/${PROJETO}` : "https://supabase.com/dashboard";

const postar = async (url: string, corpo: unknown, ms = 8000) => {
  const ctrl = new AbortController();
  const alarme = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
  } finally {
    clearTimeout(alarme);
  }
};

const AuthDiagnostics = () => {
  const [rodando, setRodando] = useState(true);
  const [checagens, setChecagens] = useState<Checagem[]>([]);

  const rodar = useCallback(async () => {
    setRodando(true);
    const out: Checagem[] = [];

    // 1) servidor de autenticação (é ele que valida e-mail e senha)
    try {
      const r = await buscar(`${URL_BASE}/auth/v1/health`);
      const corpo = await r.text().catch(() => "");
      out.push(
        r.ok
          ? {
              chave: "login",
              rotulo: "Servidor de login",
              nivel: "ok",
              detalhe: `respondeu (${r.status})${corpo && corpo.length < 40 ? ` ${corpo.trim()}` : ""}`,
            }
          : {
              chave: "login",
              rotulo: "Servidor de login",
              nivel: r.status === 401 || r.status === 403 ? "erro" : ehStatusDeInfra(r.status) ? "erro" : "aviso",
              detalhe:
                r.status === 401 || r.status === 403
                  ? `respondeu ${r.status} — a chave pública do app não é aceita por este projeto`
                  : ehStatusDeInfra(r.status)
                    ? mensagemServidorFora(r.status, { projeto: PROJETO })
                    : `respondeu ${r.status} (instável)`,
              acao: ehStatusDeInfra(r.status) ? { href: PAINEL, texto: "Abrir o painel do Supabase" } : undefined,
            },
      );
    } catch (e) {
      out.push({
        chave: "login",
        rotulo: "Servidor de login",
        nivel: "erro",
        detalhe: `${porqueFalhou(e)} — sem isso, ninguém entra. Confira a internet e se o projeto ${PROJETO} está ativo no Supabase (projeto pausado derruba tudo).`,
        acao: { href: PAINEL, texto: "Abrir o painel do Supabase" },
      });
    }

    // 1b) teste real de login: tenta entrar com uma conta de mentira.
    //     400/invalid_grant = servidor funcionando (quem recusou foi a conta de teste).
    //     5xx = servidor fora / projeto pausado — e é isso que explica o erro "{}" na tela.
    try {
      const r = await postar(`${URL_BASE}/auth/v1/token?grant_type=password`, {
        email: "diagnostico@treinacheck.invalid",
        password: "diagnostico-treinacheck",
      });
      const corpo = await r.text().catch(() => "");
      const semDetalhe = !corpo.trim() || corpo.trim() === "{}";
      if (ehStatusDeInfra(r.status) || semDetalhe) {
        out.push({
          chave: "login-teste",
          rotulo: "Teste real de login",
          nivel: "erro",
          detalhe: semDetalhe && !ehStatusDeInfra(r.status)
            ? `o servidor respondeu ${r.status} sem nenhuma explicação — é o mesmo caso do erro "{}" na tela: quem está falhando é o servidor, não a senha de quem tenta entrar`
            : mensagemServidorFora(r.status, { projeto: PROJETO }),
          acao: { href: PAINEL, texto: "Abrir o painel do Supabase" },
        });
      } else if (r.status === 429) {
        out.push({
          chave: "login-teste",
          rotulo: "Teste real de login",
          nivel: "aviso",
          detalhe: "o servidor respondeu 429 (muitas tentativas seguidas). Espere alguns minutos antes de tentar entrar.",
        });
      } else if (/invalid_grant|invalid login credentials|invalid_credentials/i.test(corpo)) {
        out.push({
          chave: "login-teste",
          rotulo: "Teste real de login",
          nivel: "ok",
          detalhe: "o servidor recusou a conta de teste (e-mail/senha inválidos), como esperado — o login está funcionando",
        });
      } else {
        out.push({
          chave: "login-teste",
          rotulo: "Teste real de login",
          nivel: "aviso",
          detalhe: `respondeu ${r.status}: ${corpo.slice(0, 140) || "sem corpo"}`,
        });
      }
    } catch (e) {
      out.push({
        chave: "login-teste",
        rotulo: "Teste real de login",
        nivel: "erro",
        detalhe: `${porqueFalhou(e)} — o navegador não conseguiu completar o pedido de login`,
        acao: { href: PAINEL, texto: "Abrir o painel do Supabase" },
      });
    }

    // 2) banco de dados (PostgREST)
    try {
      const r = await buscar(`${URL_BASE}/rest/v1/`);
      out.push(
        r.ok
          ? { chave: "banco", rotulo: "Banco de dados", nivel: "ok", detalhe: `respondeu (${r.status})` }
          : { chave: "banco", rotulo: "Banco de dados", nivel: "aviso", detalhe: `respondeu ${r.status}` },
      );
    } catch (e) {
      out.push({ chave: "banco", rotulo: "Banco de dados", nivel: "erro", detalhe: porqueFalhou(e) });
    }

    // 3) integração do relatório (tabela `documentos`)
    try {
      const r = await buscar(`${URL_BASE}/rest/v1/documentos?select=id&limit=1`);
      if (r.ok) {
        out.push({ chave: "integracao", rotulo: "Integração do relatório", nivel: "ok", detalhe: "tabela lida com sucesso" });
      } else {
        const corpo = await r.text().catch(() => "");
        const pendente = /does not exist|schema cache|42P01|PGRST205/i.test(corpo);
        out.push({
          chave: "integracao",
          rotulo: "Integração do relatório",
          nivel: pendente ? "aviso" : "erro",
          detalhe: pendente
            ? "a migração da integração ainda não foi publicada neste banco (passo 1 de docs/como-publicar-a-integracao.md)"
            : `${r.status} ${corpo.slice(0, 140)}`,
        });
      }
    } catch (e) {
      out.push({ chave: "integracao", rotulo: "Integração do relatório", nivel: "aviso", detalhe: porqueFalhou(e) });
    }

    // 4) sessão neste navegador
    try {
      const { data } = await supabase.auth.getSession();
      const s = data.session;
      out.push(
        s?.user
          ? { chave: "sessao", rotulo: "Sessão neste navegador", nivel: "ok", detalhe: `logado como ${s.user.email ?? s.user.id}` }
          : { chave: "sessao", rotulo: "Sessão neste navegador", nivel: "aviso", detalhe: "nenhuma sessão salva (é normal na tela de login)" },
      );
    } catch (e) {
      out.push({ chave: "sessao", rotulo: "Sessão neste navegador", nivel: "aviso", detalhe: porqueFalhou(e) });
    }

    setChecagens(out);
    setRodando(false);
  }, []);

  useEffect(() => {
    void rodar();
  }, [rodar]);

  const resumo = () => {
    const linhas = checagens.map((c) => `[${c.nivel}] ${c.rotulo}: ${c.detalhe}`);
    return [
      `Diagnóstico TreinaCheck — ${new Date().toLocaleString("pt-BR")}`,
      `Página: ${typeof window !== "undefined" ? window.location.origin : "—"}`,
      `Banco (URL): ${URL_BASE || "(sem VITE_SUPABASE_URL)"}`,
      `Projeto: ${PROJETO}`,
      ...linhas,
    ].join("\n");
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(resumo());
      toast.success("Diagnóstico copiado — cole para o suporte");
    } catch {
      toast.error("Não foi possível copiar neste navegador");
    }
  };

  const ICONE: Record<Nivel, JSX.Element> = {
    ok: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />,
    aviso: <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />,
    erro: <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />,
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2 text-sm" aria-live="polite">
        {rodando && checagens.length === 0 && (
          <li className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Testando o servidor...
          </li>
        )}
        {checagens.map((c) => (
          <li key={c.chave} className="flex gap-2">
            {ICONE[c.nivel]}
            <span className="min-w-0">
              <span className="font-medium">{c.rotulo}: </span>
              <span className="text-muted-foreground break-words">{c.detalhe}</span>
              {c.acao && (
                <>
                  {" "}
                  <a className="underline whitespace-nowrap" href={c.acao.href} target="_blank" rel="noreferrer">
                    {c.acao.texto}
                  </a>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void rodar()} disabled={rodando}>
          {rodando ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Testar novamente
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void copiar()}>
          <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar diagnóstico
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Banco em uso: <code>{URL_BASE || "(sem VITE_SUPABASE_URL no .env)"}</code> · projeto <code>{PROJETO}</code>. Guia completo
        de acesso em <code>docs/acesso-e-login.md</code>.
      </p>
    </div>
  );
};

export { AuthDiagnostics };
