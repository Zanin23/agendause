/* ---------------------------------------------------------------------------
   Módulos do levantamento de processos — sugestões de inclusão.

   Regra: quando um termo de um módulo opcional (ex.: "PCP" → Produção) aparece
   nas respostas do levantamento e o módulo ainda não está nele, o sistema
   SUGERE inseri-lo. Nada é inserido sem o consultor aceitar. Se ele recusar, a
   decisão fica registrada em process_surveys.decided_modules e a sugestão não
   volta para aquele levantamento.

   Sem dependências de propósito: este arquivo é testado com node puro
   (scripts/testes/levantamento-sugestoes.mjs).
--------------------------------------------------------------------------- */

export type SurveyModule = {
  code: string;
  name: string;
  section: string;
  optional: boolean;
  terms: string[];
  position: number;
};

export type BankQuestion = {
  id: string;
  module_code: string;
  position: number;
  label: string;
  help_text: string | null;
  type: string;
  options: unknown;
  required: boolean;
};

export type Sugestao = {
  modulo: SurveyModule;
  termos: string[];
};

/** Minúsculas, sem acento, pontuação virando espaço, com espaço nas pontas. */
export function normalizarTexto(texto: string): string {
  const limpo = (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return limpo ? ` ${limpo} ` : " ";
}

/** Textos de todas as respostas (valor digitado, escolhas e listas), na ordem em que chegam. */
export function textosDasRespostas(
  respostas: Array<{ value?: string | null; value_json?: unknown }>,
): string[] {
  const textos: string[] = [];
  const junta = (v: unknown) => {
    if (typeof v === "string") textos.push(v);
    else if (Array.isArray(v)) v.forEach(junta);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(junta);
  };
  for (const r of respostas) {
    if (r.value) textos.push(r.value);
    junta(r.value_json);
  }
  return textos;
}

/** Quais termos (da lista do módulo) aparecem nos textos. Acento e maiúsculas não contam. */
export function termosEncontrados(textos: string[], termos: string[]): string[] {
  const corpo = normalizarTexto(textos.join(" \n "));
  const achados: string[] = [];
  for (const termo of termos) {
    const alvo = normalizarTexto(termo).trim();
    if (!alvo) continue;
    if (corpo.includes(` ${alvo} `)) achados.push(termo);
  }
  return achados;
}

/**
 * Sugestões a mostrar: módulos OPCIONAIS, com termo citado nas respostas,
 * que ainda não estão no levantamento e que o consultor não decidiu antes.
 */
export function sugestoesDeModulos(params: {
  modulos: SurveyModule[];
  textos: string[];
  secoesNoLevantamento: Set<string>;
  decididos: string[];
}): Sugestao[] {
  const { modulos, textos, secoesNoLevantamento, decididos } = params;
  return [...modulos]
    .sort((a, b) => a.position - b.position)
    .filter((m) => m.optional)
    .filter((m) => !secoesNoLevantamento.has(m.section))
    .filter((m) => !decididos.includes(m.code))
    .map((m) => ({ modulo: m, termos: termosEncontrados(textos, m.terms) }))
    .filter((s) => s.termos.length > 0);
}

/** Perguntas do módulo, na ordem do padrão, já no formato de survey_questions (sem id). */
export function perguntasDoModulo(modulo: SurveyModule, banco: BankQuestion[]) {
  return banco
    .filter((q) => q.module_code === modulo.code)
    .sort((a, b) => a.position - b.position)
    .map((q) => ({
      section: modulo.section,
      label: q.label,
      help_text: q.help_text,
      type: q.type,
      options: (Array.isArray(q.options) ? q.options : []) as unknown[],
      required: q.required,
    }));
}

/** Seções que já têm pelo menos uma pergunta no levantamento. */
export function secoesPresentes(perguntas: Array<{ section: string | null }>): Set<string> {
  return new Set(perguntas.map((q) => q.section).filter((s): s is string => Boolean(s)));
}

/** Termos digitados no editor ("PCP, produção ; MRP") viram lista limpa. */
export function termosDoTexto(texto: string): string[] {
  return texto
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter((t, i, lista) => t.length > 0 && lista.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);
}

/** Tipos de pergunta aceitos pelo levantamento (mesmos valores da coluna `type`). */
export type SurveyQuestionType =
  | "text" | "longtext" | "number" | "date" | "select" | "multiselect" | "boolean" | "file";

export const QUESTION_TYPE_LABELS: Record<SurveyQuestionType, string> = {
  text: "Texto curto",
  longtext: "Texto longo",
  number: "Número",
  date: "Data",
  select: "Escolha única",
  multiselect: "Escolha múltipla",
  boolean: "Sim / Não",
  file: "Envio de arquivo",
};
