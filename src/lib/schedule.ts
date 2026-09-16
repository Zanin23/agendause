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
  return addDays(base, within);
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
  return addDays(startDate, Math.round(base + within));
}