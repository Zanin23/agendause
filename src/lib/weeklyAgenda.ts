import { addDays, isSameDay, isWeekend } from "date-fns";

const DAY_LABELS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

/** Monta a agenda a partir da segunda-feira, incluindo só fins de semana com eventos. */
export function getWeeklyAgendaDays<T extends { scheduled_at: string }>(
  weekStart: Date,
  trainings: readonly T[],
) {
  return DAY_LABELS.map((label, index) => {
    const day = addDays(weekStart, index);
    const events = trainings
      .filter((training) => isSameDay(new Date(training.scheduled_at), day))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

    return { day, label, events };
  }).filter(({ day, events }) => !isWeekend(day) || events.length > 0);
}
