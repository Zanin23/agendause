export type HealthLevel = "ok" | "warn" | "late" | "done";

export const HEALTH_LABELS: Record<HealthLevel, string> = {
  ok: "Em dia",
  warn: "Atenção",
  late: "Atrasado",
  done: "Concluído",
};

// Classes semânticas (tokens do index.css / paleta tailwind do projeto)
export const HEALTH_CLASSES: Record<HealthLevel, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  late: "border-destructive/40 bg-destructive/10 text-destructive",
  done: "border-primary/40 bg-primary/10 text-primary",
};

export const HEALTH_BAR: Record<HealthLevel, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  late: "bg-destructive",
  done: "bg-primary",
};

/** Data local (sem fuso) a partir de "yyyy-mm-dd" */
export const parseDateOnly = (v?: string | null) => {
  if (!v) return null;
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

export const daysBetween = (a: Date, b: Date) =>
  Math.round((a.getTime() - b.getTime()) / 86_400_000);

export const computeHealth = (args: {
  scheduleStatus: string;
  total: number;
  done: number;
  overdue: number;
  dueSoon: number;
}): HealthLevel => {
  const { scheduleStatus, total, done, overdue, dueSoon } = args;
  if (scheduleStatus === "completed" || (total > 0 && done === total)) return "done";
  if (overdue > 0) return "late";
  if (dueSoon > 0) return "warn";
  return "ok";
};

export const SURVEY_STATUS_LABELS: Record<string, string> = {
  none: "Sem levantamento",
  draft: "Rascunho",
  sent: "Aguardando cliente",
  submitted: "Respondido",
};
