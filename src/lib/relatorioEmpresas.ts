/* ============================================================================
   Empresas do Relatório de Implantações — leitura, comparação e restauração.

   Por que existe: o relatório de implantações vive na tabela `documentos`
   (uma linha por empresa). Quando o app trocou de banco (e quando alguém
   restaura o `dados.js`), parte da carteira pode ficar para trás — empresas
   que existem num arquivo/backup e não existem mais no banco "de agora".
   Esta biblioteca lê esse arquivo em qualquer um dos formatos que o relatório
   exporta, compara com o que está no banco e diz o que foi perdido.

   Formatos aceitos:
     · JSON exportado pelo relatório ("Dados ▾ → Exportar JSON")
       { app: "relatorio-implantacoes", versao: 1, data: "2026-10-08",
         geradoEm: "...", empresas: [ { id?, nome, ... }, ... ] }
     · dados.js (o baseline do repositório do relatório)
       window.DADOS_INICIAIS = { data: "...", empresas: [ ... ] };
     · lista solta de empresas: [ { nome, ... }, ... ]
     · linhas da tabela documentos: [ { id, dados, ordem }, ... ]
       ou { documentos: [ ... ] }
     · mapa id -> dados: { "nraguso-1abc": { nome: "Raguso", ... } }

   As regras de id são EXATAMENTE as do relatório (app.js/sync.js) e as da
   função SQL `rel_id_documento()`, para o TreinaCheck reconhecer a mesma
   empresa sem criar duplicata.
   ============================================================================ */

export type EmpresaDados = {
  id?: string;
  nome?: string;
  tipo?: string;
  status?: string;
  progresso?: number;
  statusText?: string;
  feito?: string[];
  falta?: string[];
  grupo?: string[];
  fases?: [string, string][];
  observacao?: string;
  atualizado?: string;
  historico?: unknown[];
  cronograma?: unknown[];
  [campo: string]: unknown;
};

export type DocumentoEmpresa = {
  id: string;
  dados: EmpresaDados;
  ordem: number;
};

export type ArquivoEmpresas = {
  documentos: DocumentoEmpresa[];
  meta: { data?: string; geradoEm?: string } | null;
  formato: string;
  ignorados: number;
  avisos: string[];
};

/* ---------------------------------------------------------------------------
   Id da empresa — igual ao app.js do relatório:
   "n" + chave do nome (28 chars, sem acento) + "-" + djb2 em base 36
--------------------------------------------------------------------------- */
export function chaveNome(valor: unknown): string {
  let s = String(valor == null ? "" : valor).toLowerCase();
  // remove acentos (o relatório e a função SQL fazem o mesmo)
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, 28);
}

export function idDeNome(nome: unknown): string {
  const chave = chaveNome(nome) || "empresa";
  const cru = String(nome == null ? "" : nome).trim().toLowerCase();
  let h = 5381;
  for (let i = 0; i < cru.length; i++) h = ((h << 5) + h + cru.charCodeAt(i)) >>> 0;
  return `n${chave}-${h.toString(36)}`;
}

const STATUS_VALIDOS = ["cliente", "desenvolvimento", "andamento", "risco", "concluido"];

const listaDeTexto = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];

/** Deixa a empresa no mesmo formato que o relatório grava (sem perder campo desconhecido). */
export function normalizarEmpresa(entrada: Partial<EmpresaDados> | null | undefined): EmpresaDados {
  const e = (entrada || {}) as Record<string, unknown>;
  const nome = String(e.nome ?? e.name ?? "").trim();
  const out: EmpresaDados = { ...(e as EmpresaDados) };
  out.id = String(e.id ?? (nome ? idDeNome(nome) : "")) || undefined;
  out.nome = nome || "Sem nome";
  out.tipo = String(e.tipo ?? e.type ?? "Outro").trim() || "Outro";
  const status = String(e.status ?? "");
  out.status = STATUS_VALIDOS.includes(status) ? status : "andamento";
  const progresso = Number(e.progresso ?? e.progress ?? 0);
  out.progresso = Number.isFinite(progresso) ? Math.max(0, Math.min(100, Math.round(progresso))) : 0;
  out.statusText = String(e.statusText ?? "").trim();
  out.feito = listaDeTexto(e.feito ?? e.done);
  out.falta = listaDeTexto(e.falta ?? e.pending);
  out.grupo = listaDeTexto(e.grupo ?? e.subs);
  out.fases = Array.isArray(e.fases) ? (e.fases as [string, string][]) : Array.isArray(e.phases) ? (e.phases as [string, string][]) : [];
  out.observacao = typeof e.observacao === "string" ? e.observacao : typeof e.note === "string" ? (e.note as string) : "";
  out.atualizado = typeof e.atualizado === "string" && e.atualizado ? e.atualizado : new Date().toISOString().slice(0, 10);
  if (!Array.isArray(out.historico)) delete out.historico;
  if (!Array.isArray(out.cronograma)) delete out.cronograma;
  return out;
}

/** nome que aparece na tela: o texto do relatório, com recuo para "Sem nome". */
export const nomeDaEmpresa = (d?: EmpresaDados | null): string => String(d?.nome || "").trim() || "Sem nome";

/* ---------------------------------------------------------------------------
   Leitura do arquivo (texto colado, upload, dados.js ou resposta da API)
--------------------------------------------------------------------------- */
function textoParaObjeto(texto: string): unknown {
  const limpo = texto.trim();
  if (!limpo) throw new Error("Arquivo vazio.");
  try {
    return JSON.parse(limpo);
  } catch {
    // dados.js: window.DADOS_INICIAIS = { ... };
    const i = limpo.indexOf("{");
    const j = limpo.lastIndexOf("}");
    if (i >= 0 && j > i) {
      const recorte = limpo.slice(i, j + 1);
      try {
        return JSON.parse(recorte);
      } catch {
        /* cai no erro abaixo */
      }
    }
    throw new Error("Não consegui ler o arquivo como JSON. Use o JSON exportado pelo relatório (Dados ▾ → Exportar JSON) ou o dados.js.");
  }
}

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Transforma o conteúdo de um arquivo/colagem na lista de empresas do relatório.
 * Nunca lança por causa de uma linha estranha: o que não der para entender volta em `avisos`.
 */
export function lerEmpresas(texto: string): ArquivoEmpresas {
  const bruto = textoParaObjeto(texto);
  const avisos: string[] = [];
  let formato = "desconhecido";
  let ignorados = 0;
  let meta: ArquivoEmpresas["meta"] = null;
  let candidatos: unknown[] = [];

  if (Array.isArray(bruto)) {
    candidatos = bruto;
    formato = "lista";
  } else if (ehObjeto(bruto)) {
    if (Array.isArray(bruto.documentos)) {
      candidatos = bruto.documentos;
      formato = "tabela documentos";
    } else if (Array.isArray(bruto.empresas)) {
      candidatos = bruto.empresas;
      formato = bruto.app === "relatorio-implantacoes" ? "exportação do relatório" : "dados.js";
      if (typeof bruto.data === "string" || typeof bruto.geradoEm === "string") {
        meta = { data: bruto.data as string | undefined, geradoEm: bruto.geradoEm as string | undefined };
      }
    } else if (ehObjeto(bruto.dados) && (bruto.nome || (bruto.dados as Record<string, unknown>).nome)) {
      // uma empresa só
      candidatos = [bruto];
      formato = "empresa única";
    } else {
      // mapa id -> dados
      const valores = Object.values(bruto).filter(ehObjeto);
      if (valores.length) {
        candidatos = Object.entries(bruto)
          .filter(([, v]) => ehObjeto(v))
          .map(([k, v]) => ({ ...(v as Record<string, unknown>), id: (v as Record<string, unknown>).id ?? k }));
        formato = "mapa de empresas";
      }
    }
  }

  if (!candidatos.length) {
    throw new Error(
      "O arquivo não tem uma lista de empresas reconhecível. Aceito: JSON exportado pelo relatório, dados.js, lista de empresas ou linhas de `documentos`.",
    );
  }

  const documentos: DocumentoEmpresa[] = [];
  const vistos = new Set<string>();

  candidatos.forEach((item, i) => {
    if (!ehObjeto(item)) {
      ignorados++;
      return;
    }
    // a linha `__meta__` (data do levantamento) não é empresa
    if (item.id === "__meta__" || (ehObjeto(item.dados) && (item.dados as Record<string, unknown>).data !== undefined && item.nome === undefined)) {
      ignorados++;
      return;
    }
    // linha da tabela: { id, dados, ordem }
    const ehLinha = ehObjeto(item.dados) && (item.dados as Record<string, unknown>).nome !== undefined && item.nome === undefined;
    const dadosBrutos = ehLinha ? (item.dados as Partial<EmpresaDados>) : (item as Partial<EmpresaDados>);
    const nome = nomeDaEmpresa(dadosBrutos as EmpresaDados);
    if (!nome || nome === "Sem nome") {
      if (!ehLinha && !item.nome && !item.name) {
        ignorados++;
        return;
      }
    }
    const idArquivo = String((ehLinha ? item.id : dadosBrutos.id) ?? "").trim();
    const dados = normalizarEmpresa(dadosBrutos);
    const id = idArquivo || idDeNome(dados.nome);
    if (vistos.has(id)) {
      ignorados++;
      return;
    }
    vistos.add(id);
    const ordemArquivo = Number((ehLinha ? item.ordem : dadosBrutos.ordem) ?? i);
    documentos.push({
      id,
      dados: { ...dados, id },
      ordem: Number.isFinite(ordemArquivo) ? ordemArquivo : i,
    });
  });

  const semNome = documentos.filter((d) => d.dados.nome === "Sem nome").length;
  if (semNome) avisos.push(`${semNome} linha(s) sem nome de empresa — confira antes de restaurar.`);
  if (ignorados) avisos.push(`${ignorados} linha(s) do arquivo não pareciam empresa e ficaram de fora.`);
  if (meta?.geradoEm) avisos.push(`Arquivo gerado em ${meta.geradoEm.slice(0, 10)}${meta.data ? ` (levantamento de ${meta.data})` : ""}.`);

  return { documentos, meta, formato, ignorados, avisos };
}

/* ---------------------------------------------------------------------------
   Comparação com o que existe hoje no banco
--------------------------------------------------------------------------- */
export type SituacaoEmpresa = "ok" | "id-diferente" | "nome-diferente";

export type Comparacao = {
  totalArquivo: number;
  totalAtual: number;
  /** no arquivo e não existe mais no banco: é o que "foi perdido" */
  perdidas: DocumentoEmpresa[];
  /** no arquivo e no banco (mesmo id, ou mesmo nome com id diferente) */
  presentes: { arquivo: DocumentoEmpresa; atual: DocumentoEmpresa; situacao: SituacaoEmpresa }[];
  /** no banco e não está no arquivo (empresas criadas depois do arquivo) */
  extras: DocumentoEmpresa[];
};

export function compararEmpresas(arquivo: DocumentoEmpresa[], atual: DocumentoEmpresa[]): Comparacao {
  const porId = new Map(atual.map((d) => [d.id, d]));
  const porNome = new Map<string, DocumentoEmpresa>();
  atual.forEach((d) => {
    const chave = chaveNome(d.dados.nome);
    if (chave && !porNome.has(chave)) porNome.set(chave, d);
  });

  const usados = new Set<string>();
  const perdidas: DocumentoEmpresa[] = [];
  const presentes: Comparacao["presentes"] = [];

  arquivo.forEach((linha) => {
    const mesmoId = porId.get(linha.id);
    if (mesmoId) {
      usados.add(mesmoId.id);
      const situacao: SituacaoEmpresa =
        chaveNome(mesmoId.dados.nome) === chaveNome(linha.dados.nome) ? "ok" : "nome-diferente";
      presentes.push({ arquivo: linha, atual: mesmoId, situacao });
      return;
    }
    const mesmoNome = porNome.get(chaveNome(linha.dados.nome));
    if (mesmoNome) {
      usados.add(mesmoNome.id);
      presentes.push({ arquivo: linha, atual: mesmoNome, situacao: "id-diferente" });
      return;
    }
    perdidas.push(linha);
  });

  const extras = atual.filter((d) => !usados.has(d.id));
  return { totalArquivo: arquivo.length, totalAtual: atual.length, perdidas, presentes, extras };
}

/* ---------------------------------------------------------------------------
   Restauração — grava as empresas perdidas em `documentos`
--------------------------------------------------------------------------- */
export type LinhaParaRestaurar = {
  id: string;
  dados: EmpresaDados;
  ordem: number;
};

/**
 * Monta as linhas que serão gravadas em `documentos`.
 * `trazerCronograma = false` remove o cronograma antigo que veio no arquivo
 * (útil quando a empresa terá um cronograma novo na agenda — que sempre manda).
 */
export function prepararRestauracao(
  perdidas: DocumentoEmpresa[],
  opcoes: {
    /** primeira posição livre na carteira de agora (usada quando não se mantém a ordem do arquivo) */
    ordemInicial?: number;
    /** true = cada empresa volta para a posição que tinha no arquivo */
    manterOrdemOriginal?: boolean;
    trazerCronograma?: boolean;
    hoje?: string;
  } = {},
): LinhaParaRestaurar[] {
  const {
    ordemInicial = 0,
    manterOrdemOriginal = false,
    trazerCronograma = true,
    hoje = new Date().toISOString().slice(0, 10),
  } = opcoes;
  return perdidas.map((linha, i) => {
    const dados: EmpresaDados = { ...linha.dados, id: linha.id, atualizado: linha.dados.atualizado || hoje };
    if (!trazerCronograma) delete dados.cronograma;
    const ordem = manterOrdemOriginal && Number.isFinite(linha.ordem) ? linha.ordem : ordemInicial + i;
    return { id: linha.id, dados, ordem };
  });
}

/** CSV simples (abre no Excel) com as empresas perdidas. */
export function perdidasParaCsv(perdidas: DocumentoEmpresa[]): string {
  const cab = ["id", "nome", "tipo", "status", "progresso", "atualizado", "statusText", "observacao"];
  const campo = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const linhas = perdidas.map((d) => [
    d.id,
    d.dados.nome,
    d.dados.tipo,
    d.dados.status,
    d.dados.progresso ?? 0,
    d.dados.atualizado,
    d.dados.statusText,
    d.dados.observacao,
  ]);
  return [cab, ...linhas].map((l) => l.map(campo).join(",")).join("\n");
}
