/* ---------------------------------------------------------------------------
   Qual projeto do Supabase este site usa.

   O projeto OFICIAL do TreinaCheck é o **Agendause** (`pnaupodddxrbqbjilhft`):
   é onde estão as contas, os dados, o relatório e o que está publicado.
   Em 11/10/2026 algumas instruções deste repositório passaram a mandar publicar
   tudo em `psgekwifthuzduhpreay` — um projeto que o sistema nunca usou. O
   resultado foi SQL colado no lugar errado e mensagens de erro citando um
   projeto diferente do que aparece no painel.

   Este arquivo é a fonte da verdade: guarda o projeto oficial, a lista dos que
   o app NUNCA deve usar, e a regra que conserta o build quando a variável de
   ambiente aponta para o lugar errado.
--------------------------------------------------------------------------- */

/**
 * Chave pública (publishable/anon) do projeto oficial.
 * Pública por natureza: vai no HTML do site, de qualquer forma.
 * Enquanto estiver vazia, o app AVISA mas não troca nada sozinho (não quebra).
 */
export const CHAVE_PUBLICA = "sb_publishable_vz9REAkToghXmd1R0adsTw_J8PYkZmz";

/** Projeto oficial — espelha o `.env` do repositório (há teste conferindo). */
export const PROJETO_ATUAL = {
  nome: "Agendause",
  ref: "pnaupodddxrbqbjilhft",
  url: "https://pnaupodddxrbqbjilhft.supabase.co",
  chave: CHAVE_PUBLICA,
} as const;

/** Projetos que o app não deve usar (criados por engano / aposentados). */
export const PROJETOS_APOSENTADOS = ["psgekwifthuzduhpreay"] as const;

/** "psgekwifthuzduhpreay" a partir de "https://psgekwifthuzduhpreay.supabase.co". */
export function refDoProjeto(url?: string | null): string | null {
  const m = /https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)/i.exec((url || "").trim());
  return m ? m[1].toLowerCase() : null;
}

/** "ok" = usando o que está configurado e válido · "trocado" = o app corrigiu
 *  sozinho · "aviso" = está apontado para o lugar errado e não pôde corrigir. */
export type SituacaoProjeto = "ok" | "trocado" | "aviso";

export type ProjetoResolvido = {
  /** O que o cliente do Supabase deve usar. */
  url: string;
  chave: string;
  /** Projeto que está de fato em uso. */
  ref: string;
  /** Projeto que o build trouxe (pode ser um aposentado). */
  refDeclarada: string | null;
  /** Projeto oficial do sistema. */
  refOficial: string;
  situacao: SituacaoProjeto;
};

export const ehProjetoAposentado = (ref?: string | null) =>
  !!ref && (PROJETOS_APOSENTADOS as readonly string[]).includes(ref.toLowerCase());

/**
 * Decide a URL e a chave do Supabase a partir do que o build recebeu.
 * - configuração válida (e não aposentada) → é respeitada, sem mexer em nada;
 * - configuração apontando para projeto aposentado/vazio → usa o projeto
 *   oficial quando a chave pública é conhecida ("trocado"); sem a chave,
 *   apenas avisa ("aviso"), para não trocar por um cliente sem credencial.
 */
export function resolverProjeto(
  urlEnv?: string | null,
  chaveEnv?: string | null,
  refEnv?: string | null,
): ProjetoResolvido {
  const url = (urlEnv || "").replace(/\/+$/, "");
  const chave = (chaveEnv || "").trim();
  const refDeclarada = (refEnv || "").trim().toLowerCase() || refDoProjeto(url);
  const oficial = { url: PROJETO_ATUAL.url, chave: PROJETO_ATUAL.chave.trim(), ref: PROJETO_ATUAL.ref };

  const precisaCorrigir = !url || !chave || ehProjetoAposentado(refDeclarada);

  if (!precisaCorrigir) {
    return { url, chave, ref: refDeclarada ?? "", refDeclarada, refOficial: oficial.ref, situacao: "ok" };
  }
  if (oficial.chave) {
    return { url: oficial.url, chave: oficial.chave, ref: oficial.ref, refDeclarada, refOficial: oficial.ref, situacao: "trocado" };
  }
  return { url, chave, ref: refDeclarada ?? "", refDeclarada, refOficial: oficial.ref, situacao: "aviso" };
}

export const painelDoProjeto = (ref?: string | null) =>
  ref ? `https://supabase.com/dashboard/project/${ref}` : "https://supabase.com/dashboard";

/** Onde a configuração do site é corrigida (o build lê de lá). */
export const ONDE_CORRIGIR = "Vercel → Settings → Environment Variables";

const NOMES_DAS_VARIAVEIS =
  "VITE_SUPABASE_URL, VITE_SUPABASE_PROJECT_ID e VITE_SUPABASE_PUBLISHABLE_KEY";

/**
 * Aviso para a tela de login quando o build está apontado para o projeto
 * errado. `null` quando está tudo certo.
 */
export function avisoDeProjetoAntigo(p: ProjetoResolvido): string | null {
  if (p.situacao === "ok") return null;

  const antigo = p.refDeclarada ? `“${p.refDeclarada}”` : "nenhum projeto";
  const oficial = `“${PROJETO_ATUAL.nome}” (${PROJETO_ATUAL.ref})`;

  if (p.situacao === "trocado") {
    return (
      `Este site foi publicado apontando para ${antigo}, que o TreinaCheck não usa — o projeto oficial é o ${oficial}. ` +
      `Para você não ficar sem entrar, o app já está usando o projeto oficial. ` +
      `Para corrigir em definitivo: ${ONDE_CORRIGIR}, atualize ${NOMES_DAS_VARIAVEIS} com os valores do .env do repositório e faça um novo deploy.`
    );
  }

  return (
    `Este site está apontado para ${antigo}, mas o projeto oficial do TreinaCheck é o ${oficial}. ` +
    `O app não conseguiu corrigir sozinho porque ainda não tem a chave pública do projeto oficial no código. ` +
    `Corrija em ${ONDE_CORRIGIR}: atualize ${NOMES_DAS_VARIAVEIS} com os valores do .env do repositório e faça um novo deploy.`
  );
}
