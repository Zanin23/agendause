import { addDays } from "date-fns";

export type TemplatePhase = { title: string; items: string[] };
export type TemplateContent = { observations: string; phases: TemplatePhase[] };

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
  return addDays(base, within);
}