import { addDays } from "date-fns";

export type TemplatePhase = { title: string; items: string[] };
export type TemplateContent = { observations: string; phases: TemplatePhase[] };

/* ---------------------------------------------------------------------------
   Dois tipos de cronograma (coluna `implementation_schedules.kind`):
     · implantacao — cliente do relatório de implantações (o de sempre);
     · livre       — "outras coisas": obra, evento, manutenção, rotina interna…
                     Nasce em branco e quem preenche é você, à mão.
   O cronograma livre NÃO entra no relatório de implantações (a função
   `rel_sincronizar_agenda()` e a view filtram por kind = 'implantacao').
--------------------------------------------------------------------------- */
export type ScheduleKind = "implantacao" | "livre";

export type CronogramaNomeavel = {
  kind?: string | null;
  title?: string | null;
  subject?: string | null;
  client_name?: string | null;
};

export const ehCronogramaLivre = (s?: CronogramaNomeavel | null) => s?.kind === "livre";

/** Nome que aparece na tela: título (cronograma livre) ou cliente (implantação). */
export function tituloDoCronograma(s?: CronogramaNomeavel | null): string {
  const titulo = (s?.title || "").trim();
  const cliente = (s?.client_name || "").trim();
  return ehCronogramaLivre(s) ? titulo || cliente : cliente || titulo;
}

/** Sugestões de "assunto" do cronograma livre — o campo aceita qualquer texto. */
export const ASSUNTOS_SUGERIDOS = [
  "Obra",
  "Evento",
  "Manutenção",
  "Treinamento interno",
  "Implantação interna",
  "Rotina / checklist",
  "Outro",
];

export type LinhaItemColado = {
  title: string;
  planned_date: string | null;
  assignee: string | null;
};

/** Aceita 12/10/2026, 12/10, 12-10-2026 e 2026-10-12. */
export function dataColada(valor: string): string | null {
  const t = (valor || "").trim();
  if (!t) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return t;
  const br = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(t);
  if (!br) return null;
  const dia = br[1].padStart(2, "0");
  const mes = br[2].padStart(2, "0");
  let ano = br[3] || String(new Date().getFullYear());
  if (ano.length === 2) ano = `20${ano}`;
  return `${ano}-${mes}-${dia}`;
}

/**
 * Lê a lista colada para preencher o cronograma à mão: uma atividade por linha,
 * com campos opcionais separados por "|" ou ";".
 *   Título | responsável | 12/10/2026
 *   Título | 12/10
 *   Título
 */
export function lerLinhasDeItens(texto: string): { itens: LinhaItemColado[]; ignoradas: number } {
  const itens: LinhaItemColado[] = [];
  let ignoradas = 0;
  texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((linha) => {
      const partes = linha.split(/\s*[|;]\s*/).map((p) => p.trim());
      const titulo = partes[0];
      if (!titulo) {
        ignoradas++;
        return;
      }
      const resto = partes.slice(1);
      let data: string | null = null;
      const responsaveis: string[] = [];
      resto.forEach((campo) => {
        if (!campo) return;
        const d = dataColada(campo);
        if (d && !data) {
          data = d;
          return;
        }
        responsaveis.push(campo);
      });
      itens.push({ title: titulo.slice(0, 240), planned_date: data, assignee: responsaveis.join(", ") || null });
    });
  return { itens, ignoradas };
}

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  done: "Concluído",
  blocked: "Bloqueado",
  rescheduled: "Reagendado",
  not_applicable: "Não aplicável",
};

export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-foreground",
  in_progress: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  done: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  blocked: "bg-red-500/15 text-red-600 dark:text-red-300",
  rescheduled: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  not_applicable: "bg-muted text-muted-foreground",
};

export function cadenceStepDays(cadence: string) {
  switch (cadence) {
    case "semanal":
      return 7;
    case "quinzenal":
      return 14;
    case "mensal":
      return 30;
    default:
      return 7;
  }
}

/** Move a date to the next business day when it falls on Saturday or Sunday. */
export function toBusinessDay(date: Date) {
  const d = new Date(date);
  const dow = d.getDay();
  if (dow === 6) return addDays(d, 2); // sábado -> segunda
  if (dow === 0) return addDays(d, 1); // domingo -> segunda
  return d;
}

/** Distribute a planned date for every item starting at startDate, advancing per phase. */
export function plannedDateFor(
  startDate: Date,
  cadence: string,
  phaseIndex: number,
  itemIndex: number,
  itemsInPhase: number,
) {
  const step = cadenceStepDays(cadence);
  const base = addDays(startDate, phaseIndex * step);
  // distribute items across the phase window
  const within = Math.floor((itemIndex / Math.max(1, itemsInPhase)) * step);
  return toBusinessDay(addDays(base, within));
}

/** Distribute item dates evenly between startDate and endDate across all phases. */
export function plannedDateForRange(
  startDate: Date,
  endDate: Date,
  phaseIndex: number,
  totalPhases: number,
  itemIndex: number,
  itemsInPhase: number,
) {
  const totalDays = Math.max(
    1,
    Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const phaseWindow = totalDays / Math.max(1, totalPhases);
  const base = phaseIndex * phaseWindow;
  const within = (itemIndex / Math.max(1, itemsInPhase)) * phaseWindow;
  return toBusinessDay(addDays(startDate, Math.round(base + within)));
}
/* ===========================================================================
   Status do cronograma (implementation_schedules.status)

   O app usa `draft` (rascunho), `active`/`in_progress` (em execução),
   `completed` (concluído) e `archived` (arquivado). Pausa tem controle próprio
   (`paused` / `waiting_client`), porque pausar envolve motivo e remanejamento.
   Os rótulos ficam aqui para lista e editor nunca divergirem.
--------------------------------------------------------------------------- */
export const PAUSED_STATUSES = ["paused", "waiting_client"];
export const isPausedStatus = (s?: string | null) => !!s && PAUSED_STATUSES.includes(s);

export const PAUSE_LABELS: Record<string, string> = {
  paused: "Pausado",
  waiting_client: "Pendente pelo cliente",
};

export const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  in_progress: "Em andamento",
  accepted: "Aceito",
  completed: "Concluído",
  archived: "Arquivado",
  paused: "Pausado",
  waiting_client: "Pendente pelo cliente",
};

export const SCHEDULE_STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "outline" | "success" | "destructive"
> = {
  draft: "outline",
  active: "default",
  in_progress: "default",
  accepted: "success",
  completed: "success",
  archived: "secondary",
  paused: "secondary",
  waiting_client: "secondary",
};

export const scheduleStatusLabel = (s?: string | null) => SCHEDULE_STATUS_LABELS[s ?? ""] ?? (s || "—");
export const scheduleStatusVariant = (s?: string | null) => SCHEDULE_STATUS_VARIANTS[s ?? ""] ?? "outline";

/** Status que dá para escolher dentro do cronograma (a pausa tem botão próprio). */
export const SCHEDULE_STATUS_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "draft", label: "Rascunho", hint: "Ainda sendo montado; não conta como atrasado." },
  { value: "active", label: "Ativo", hint: "Em execução — é o estado do dia a dia." },
  { value: "in_progress", label: "Em andamento", hint: "Em curso, para quem prefere este rótulo." },
  { value: "completed", label: "Concluído", hint: "Encerrado: o relatório de implantações mostra como concluído." },
  { value: "archived", label: "Arquivado", hint: "Fora do acompanhamento, sem apagar nada." },
];

/**
 * O que gravar ao trocar o status. Sair de uma pausa limpa `paused_at` e
 * `pause_reason` — senão os relatórios continuariam tratando como parado.
 */
export function payloadStatus(novo: string, atual?: string | null): Record<string, unknown> {
  const saindoDaPausa = isPausedStatus(atual) && !isPausedStatus(novo);
  return saindoDaPausa
    ? { status: novo, paused_at: null, pause_reason: null }
    : { status: novo };
}

/* ===========================================================================
   Remarcação de um módulo (fase) inteiro

   Dois jeitos de mexer nas datas de todas as etapas de uma fase de uma vez:
     · "inicio"        — informe a nova data da primeira etapa da fase;
     · "deslocamento"  — adie/antecipe tudo em N dias.
   A distância entre as etapas continua a mesma; fim de semana vai para segunda.
--------------------------------------------------------------------------- */
export type RemarcacaoModo = "inicio" | "deslocamento";
export type ItemRemarcavel = {
  id: string;
  planned_date: string | null;
  status?: string | null;
  /** Visita vinculada: a remarcação muda a data prevista, não a visita. */
  training_id?: string | null;
};
export type AlteracaoData = { id: string; de: string; para: string };
export type PlanoRemarcacao = {
  alteracoes: AlteracaoData[];
  deslocamento: number;
  ignorados: number;
  janelaAtual: { inicio: string; fim: string } | null;
  janelaNova: { inicio: string; fim: string } | null;
};

/** "yyyy-mm-dd" (sem fuso) ou null quando vazio/inválido (inclusive 2026-13-40). */
export function diaISO(v?: string | null): string | null {
  const t = (v || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [a, m, d] = t.split("-").map(Number);
  const data = new Date(a, m - 1, d);
  const real = data.getFullYear() === a && data.getMonth() === m - 1 && data.getDate() === d;
  return real ? t : null;
}

const diaLocal = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, (m || 1) - 1, d || 1);
};

const isoDe = (data: Date) =>
  `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;

const janela = (datas: string[]) =>
  datas.length ? { inicio: datas.reduce((a, b) => (a < b ? a : b)), fim: datas.reduce((a, b) => (a > b ? a : b)) } : null;

export function planejarRemarcacao(
  items: ItemRemarcavel[],
  opts: { modo: RemarcacaoModo; valor: string | number; incluirConcluidos?: boolean; ajustarDiaUtil?: boolean },
): PlanoRemarcacao {
  const comData = items
    .map((i) => ({ id: i.id, status: i.status ?? null, data: diaISO(i.planned_date) }))
    .filter((i): i is { id: string; status: string | null; data: string } => !!i.data);

  const alvo = comData.filter(
    (i) => opts.incluirConcluidos || (i.status !== "done" && i.status !== "not_applicable"),
  );
  const ignorados = items.length - alvo.length;

  const atual = janela(alvo.map((i) => i.data));
  if (!alvo.length) {
    return { alteracoes: [], deslocamento: 0, ignorados, janelaAtual: null, janelaNova: null };
  }

  let deslocamento = 0;
  if (opts.modo === "inicio") {
    const novoInicio = diaISO(typeof opts.valor === "string" ? opts.valor : null);
    if (!novoInicio) {
      return { alteracoes: [], deslocamento: 0, ignorados, janelaAtual: atual, janelaNova: atual };
    }
    deslocamento = Math.round((diaLocal(novoInicio).getTime() - diaLocal(atual!.inicio).getTime()) / 86400000);
  } else {
    deslocamento = Math.trunc(Number(opts.valor) || 0);
  }

  const ajustar = opts.ajustarDiaUtil !== false;
  const mover = (iso: string) => {
    const d = addDays(diaLocal(iso), deslocamento);
    return isoDe(ajustar ? toBusinessDay(d) : d);
  };

  const novo = janela(alvo.map((i) => mover(i.data)));
  const alteracoes = deslocamento === 0
    ? []
    : alvo.map((i) => ({ id: i.id, de: i.data, para: mover(i.data) })).filter((a) => a.de !== a.para);

  return { alteracoes, deslocamento, ignorados, janelaAtual: atual, janelaNova: novo };
}

/** "adiadas 7 dias" / "antecipadas 2 dias" / "sem mudança de prazo". */
export function descreveDeslocamento(dias: number): string {
  if (!dias) return "sem mudança de prazo";
  return dias > 0 ? `adiadas ${dias} dia(s)` : `antecipadas ${-dias} dia(s)`;
}
