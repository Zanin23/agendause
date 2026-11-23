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

export type PositionedAgendaEvent<T> = {
  event: T;
  startMinute: number;
  endMinute: number;
  lane: number;
  laneCount: number;
};

/**
 * Organiza eventos que ocupam o mesmo horário em faixas laterais, como nas
 * visualizações semanais de calendários modernos. Eventos conectados por uma
 * sobreposição usam a mesma quantidade de faixas para manter o alinhamento.
 */
export function positionOverlappingEvents<
  T extends { scheduled_at: string; duration_minutes: number },
>(events: readonly T[]): PositionedAgendaEvent<T>[] {
  const sorted = [...events]
    .map((event) => {
      const start = new Date(event.scheduled_at);
      const startMinute = start.getHours() * 60 + start.getMinutes();
      return {
        event,
        startMinute,
        endMinute: startMinute + Math.max(15, Number(event.duration_minutes) || 0),
      };
    })
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const positioned: PositionedAgendaEvent<T>[] = [];
  let cluster: Array<(typeof sorted)[number] & { lane: number }> = [];
  let active: Array<{ lane: number; endMinute: number }> = [];
  let clusterEnd = -1;
  let clusterLaneCount = 0;

  const flushCluster = () => {
    cluster.forEach((item) => {
      positioned.push({
        event: item.event,
        startMinute: item.startMinute,
        endMinute: item.endMinute,
        lane: item.lane,
        laneCount: clusterLaneCount,
      });
    });
    cluster = [];
    active = [];
    clusterEnd = -1;
    clusterLaneCount = 0;
  };

  sorted.forEach((item) => {
    if (cluster.length > 0 && item.startMinute >= clusterEnd) flushCluster();

    active = active.filter((entry) => entry.endMinute > item.startMinute);
    const usedLanes = new Set(active.map((entry) => entry.lane));
    let lane = 0;
    while (usedLanes.has(lane)) lane += 1;

    active.push({ lane, endMinute: item.endMinute });
    cluster.push({ ...item, lane });
    clusterEnd = Math.max(clusterEnd, item.endMinute);
    clusterLaneCount = Math.max(clusterLaneCount, lane + 1);
  });

  flushCluster();
  return positioned.sort((a, b) => a.startMinute - b.startMinute || a.lane - b.lane);
}
