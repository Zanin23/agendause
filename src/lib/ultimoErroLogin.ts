/* ---------------------------------------------------------------------------
   Guarda o último erro de login neste navegador.

   Por que existe: quando o login falha, a mensagem desaparece ao recarregar a
   página — e quem for ajudar fica sem saber o que o servidor respondeu de
   verdade (o Supabase às vezes só devolve um código, sem texto). Aqui o erro
   fica salvo com status e código e aparece no "Verificar o acesso", inclusive
   no "Copiar diagnóstico" — ou seja, dá para mandar o caso exato para o suporte.
--------------------------------------------------------------------------- */

export type DetalheErroDeLogin = {
  /** Quando aconteceu (ISO). */
  quando: string;
  /** Mensagem já traduzida para quem está tentando entrar. */
  mensagem: string;
  /** Código HTTP (ex.: 500). */
  status?: number;
  /** Código do Supabase quando existe (ex.: unexpected_failure). */
  codigo?: string;
  /** Projeto em uso, para não confundir bancos. */
  projeto?: string;
};

const CHAVE = "treinacheck:ultimo-erro-de-login";

type Armazenamento = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const doNavegador = (): Armazenamento | null => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    // navegador em modo restrito
    return null;
  }
};

/** Salva o erro (nunca lança: login quebrado não pode piorar por causa disso). */
export function registrarErroDeLogin(
  dados: Omit<DetalheErroDeLogin, "quando"> & { quando?: string },
  armazenamento?: Armazenamento,
): void {
  const a = armazenamento ?? doNavegador();
  if (!a) return;
  const detalhe: DetalheErroDeLogin = { quando: dados.quando ?? new Date().toISOString(), ...dados };
  try {
    a.setItem(CHAVE, JSON.stringify(detalhe));
  } catch {
    // modo privado / cota cheia
  }
}

/** Lê o último erro salvo; `null` quando não há (ou quando o conteúdo está corrompido). */
export function lerUltimoErroDeLogin(armazenamento?: Armazenamento): DetalheErroDeLogin | null {
  const a = armazenamento ?? doNavegador();
  if (!a) return null;
  try {
    const bruto = a.getItem(CHAVE);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as Partial<DetalheErroDeLogin>;
    if (!dados || typeof dados.mensagem !== "string" || !dados.mensagem) return null;
    return {
      quando: typeof dados.quando === "string" ? dados.quando : "",
      mensagem: dados.mensagem,
      status: typeof dados.status === "number" ? dados.status : undefined,
      codigo: typeof dados.codigo === "string" ? dados.codigo : undefined,
      projeto: typeof dados.projeto === "string" ? dados.projeto : undefined,
    };
  } catch {
    return null;
  }
}

/** Apaga o registro (chamado quando alguém consegue entrar). */
export function limparUltimoErroDeLogin(armazenamento?: Armazenamento): void {
  const a = armazenamento ?? doNavegador();
  if (!a) return;
  try {
    a.removeItem(CHAVE);
  } catch {
    // ignora
  }
}

/** Texto curto para exibir no diagnóstico: quando, código e o que apareceu. */
export function descreverErroDeLogin(detalhe: DetalheErroDeLogin): string {
  const partes: string[] = [];

  const quando = detalhe.quando ? new Date(detalhe.quando) : null;
  if (quando && !Number.isNaN(quando.getTime())) {
    try {
      partes.push(quando.toLocaleString("pt-BR"));
    } catch {
      partes.push(detalhe.quando);
    }
  }

  const codigos = [detalhe.status ? `erro ${detalhe.status}` : "", detalhe.codigo ?? ""].filter(Boolean);
  if (codigos.length) partes.push(codigos.join(" · "));

  const contexto = partes.length ? `${partes.join(" — ")} — ` : "";
  return `${contexto}${detalhe.mensagem}`;
}
