import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Copy, ExternalLink, Loader2, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { checkAdminPublication, SQL_CONTAS, SQL_LISTA, type PublicacaoItem } from "@/lib/adminUsers";
import sqlLista from "../../supabase/migrations/20261013130000_admin_list_users.sql?raw";
import sqlContas from "../../supabase/migrations/20261013140000_admin_contas_sem_edge_function.sql?raw";

/* ---------------------------------------------------------------------------
   Conferir publicação — mostra, dentro do próprio sistema, o que ainda falta
   publicar no banco para o Controle de Acessos funcionar (listar contas,
   criar conta, definir senha, dar/remover admin, salvar permissões).

   A conferência não grava nada: as funções são chamadas com dados inválidos de
   propósito e recusam antes de tocar em qualquer conta.
--------------------------------------------------------------------------- */

const PROJETO =
  (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) ||
  ((import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/^https?:\/\//, "").split(".")[0] ?? "");
const SQL_EDITOR = PROJETO ? `https://supabase.com/dashboard/project/${PROJETO}/sql/new` : "https://supabase.com/dashboard";

const ARQUIVOS: Record<string, { rotulo: string; conteudo: string }> = {
  [SQL_LISTA]: { rotulo: "SQL da listagem de contas", conteudo: sqlLista },
  [SQL_CONTAS]: { rotulo: "SQL de criar/gerenciar contas", conteudo: sqlContas },
};

const ICONE: Record<PublicacaoItem["nivel"], JSX.Element> = {
  ok: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />,
  opcional: <Circle className="h-3.5 w-4 text-muted-foreground shrink-0 mt-1" />,
  faltando: <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />,
  erro: <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />,
};

const copiarTexto = async (texto: string, mensagem: string) => {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(mensagem);
  } catch {
    toast.error("Não foi possível copiar neste navegador. Abra o arquivo no repositório e copie o conteúdo.");
  }
};

const AdminPublicationCheck = () => {
  const [checando, setChecando] = useState(true);
  const [itens, setItens] = useState<PublicacaoItem[]>([]);

  const conferir = useCallback(async () => {
    setChecando(true);
    try {
      setItens(await checkAdminPublication(supabase));
    } catch (e) {
      setItens([
        {
          chave: "conferencia",
          rotulo: "Conferência",
          nivel: "erro",
          detalhe: (e as Error).message || "não consegui falar com o banco",
        },
      ]);
    } finally {
      setChecando(false);
    }
  }, []);

  useEffect(() => {
    void conferir();
  }, [conferir]);

  // A Edge Function é opcional: só o que é exigido conta como pendência.
  const pendentes = itens.filter((i) => i.nivel === "faltando" || i.nivel === "erro");
  const arquivosPendentes = [
    ...new Set(pendentes.map((i) => i.arquivo).filter((a): a is string => Boolean(a))),
  ];
  const tudoOk = !checando && itens.length > 0 && pendentes.length === 0;

  const copiarArquivo = (arquivo: string) =>
    copiarTexto(
      `-- ${ARQUIVOS[arquivo].rotulo} — cole no SQL Editor do projeto ${PROJETO || "(Supabase)"} e clique em Run\n\n${ARQUIVOS[arquivo].conteudo}`,
      `${ARQUIVOS[arquivo].rotulo} copiado — cole no SQL Editor do Supabase e clique em Run`,
    );

  const copiarTudo = () => {
    const conteudo = arquivosPendentes
      .map((a, i) => `-- ===== ${i + 1}/${arquivosPendentes.length} — ${ARQUIVOS[a].rotulo} =====\n\n${ARQUIVOS[a].conteudo}`)
      .join("\n\n");
    void copiarTexto(conteudo, "SQL copiado — cole no SQL Editor do Supabase e clique em Run");
  };

  const diagnostico = () =>
    [
      `Publicação do Controle de Acessos — TreinaCheck — ${new Date().toLocaleString("pt-BR")}`,
      `Projeto: ${PROJETO || "(sem VITE_SUPABASE_PROJECT_ID)"}`,
      `Pendências: ${pendentes.length === 0 ? "nenhuma" : pendentes.map((p) => p.rotulo).join(", ")}`,
      ...itens.map((i) => `[${i.nivel}] ${i.rotulo}: ${i.detalhe}`),
    ].join("\n");

  return (
    <section
      className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5 space-y-3"
      aria-label="Conferir publicação no Supabase"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold flex items-center gap-2">
          {checando ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : tudoOk ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          )}
          Conferir publicação no Supabase
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void conferir()} disabled={checando}>
            {checando ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Conferir novamente
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => void copiarTexto(diagnostico(), "Diagnóstico copiado")}>
            <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar diagnóstico
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {checando && itens.length === 0
          ? "Testando o que está publicado neste banco..."
          : tudoOk
            ? "Tudo certo: listar contas, criar conta, definir senha, dar/remover administrador e salvar permissões estão publicados neste banco."
            : `Falta publicar ${pendentes.length} item(ns) para a tela funcionar por completo. As contas existentes não foram apagadas.`}
      </p>

      <ul className="space-y-2 text-sm" aria-live="polite">
        {itens.map((i) => (
          <li key={i.chave} className="flex gap-2">
            {ICONE[i.nivel]}
            <span className="min-w-0">
              <span className="font-medium">{i.rotulo}: </span>
              <span className="text-muted-foreground break-words">{i.detalhe}</span>
            </span>
          </li>
        ))}
      </ul>

      {!checando && pendentes.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
          <p className="text-sm font-medium">Como publicar (2 minutos, só colar SQL):</p>
          <ol className="text-sm text-muted-foreground list-decimal ml-5 space-y-1">
            <li>
              Abra o{" "}
              <a className="underline inline-flex items-center gap-1" href={SQL_EDITOR} target="_blank" rel="noreferrer">
                SQL Editor do projeto {PROJETO || "Supabase"} <ExternalLink className="h-3 w-3" />
              </a>
              .
            </li>
            <li>Copie o SQL aqui embaixo (o botão já copia o arquivo inteiro).</li>
            <li>Cole no editor e clique em <strong>Run</strong>.</li>
            <li>Volte para esta tela e clique em <strong>Conferir novamente</strong>.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            {arquivosPendentes.map((arquivo) => (
              <Button key={arquivo} type="button" size="sm" onClick={() => void copiarArquivo(arquivo)}>
                <Copy className="h-3.5 w-3.5 mr-1.5" /> {ARQUIVOS[arquivo].rotulo}
              </Button>
            ))}
            {arquivosPendentes.length > 1 && (
              <Button type="button" size="sm" variant="outline" onClick={copiarTudo}>
                <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar os dois de uma vez
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Publicar o site na Vercel <strong>não</strong> publica essas funções no banco: são duas coisas separadas. Nada é apagado ou
            recriado ao rodar o SQL, e ele pode ser executado mais de uma vez. Passo a passo completo em{" "}
            <code>docs/controle-de-usuarios.md</code>.
          </p>
        </div>
      )}
    </section>
  );
};

export { AdminPublicationCheck };
