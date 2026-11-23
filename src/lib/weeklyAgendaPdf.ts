import { jsPDF } from "jspdf";

type RGB = [number, number, number];

export type WeeklyAgendaPdfStatus =
  | "Cancelada"
  | "Realizada"
  | "Reagendada"
  | "Confirmada"
  | "Pendente";

export type WeeklyAgendaPdfEvent = {
  startMinute: number;
  durationMinutes: number;
  allDay: boolean;
  time: string;
  client: string;
  activity?: string | null;
  durationLabel: string;
  modality: string;
  location?: string | null;
  responsibles?: string | null;
  status: WeeklyAgendaPdfStatus;
  note?: string | null;
};

export type WeeklyAgendaPdfDay = {
  dateLabel: string;
  dayLabel: string;
  events: WeeklyAgendaPdfEvent[];
};

type PositionedPdfEvent = {
  event: WeeklyAgendaPdfEvent;
  lane: number;
  laneCount: number;
  startMinute: number;
  endMinute: number;
};

const PAGE_HEIGHT = 210;
const PAGE_MARGIN = 8;
const HEADER_BOTTOM = 29;
const DAY_HEADER_HEIGHT = 10;
const TIME_AXIS_WIDTH = 12;
const DAY_GAP = 1.2;
const BASE_DAY_WIDTH = 38;
const EVENT_LANE_WIDTH = 30;
const ORANGE: RGB = [242, 107, 31];
const DARK: RGB = [31, 35, 42];
const MUTED: RGB = [101, 108, 118];
const GRID: RGB = [224, 227, 232];

function statusColors(status: WeeklyAgendaPdfStatus) {
  if (status === "Cancelada") {
    return { accent: [218, 48, 48] as RGB, fill: [255, 242, 242] as RGB, text: [177, 35, 35] as RGB };
  }
  if (status === "Realizada") {
    return { accent: [91, 112, 180] as RGB, fill: [242, 245, 252] as RGB, text: [68, 86, 148] as RGB };
  }
  if (status === "Confirmada") {
    return { accent: [31, 157, 85] as RGB, fill: [237, 249, 242] as RGB, text: [23, 119, 66] as RGB };
  }
  if (status === "Reagendada") {
    return { accent: [225, 118, 24] as RGB, fill: [255, 247, 237] as RGB, text: [155, 77, 14] as RGB };
  }
  return { accent: [218, 172, 43] as RGB, fill: [255, 249, 228] as RGB, text: [137, 96, 0] as RGB };
}

function positionPdfEvents(events: WeeklyAgendaPdfEvent[]): PositionedPdfEvent[] {
  const sorted = [...events]
    .filter((event) => !event.allDay)
    .map((event) => ({
      event,
      startMinute: event.startMinute,
      endMinute: event.startMinute + Math.max(15, event.durationMinutes),
    }))
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const result: PositionedPdfEvent[] = [];
  let cluster: Array<(typeof sorted)[number] & { lane: number }> = [];
  let active: Array<{ lane: number; endMinute: number }> = [];
  let clusterEnd = -1;
  let laneCount = 0;

  const flush = () => {
    cluster.forEach((item) => result.push({ ...item, laneCount }));
    cluster = [];
    active = [];
    clusterEnd = -1;
    laneCount = 0;
  };

  sorted.forEach((item) => {
    if (cluster.length && item.startMinute >= clusterEnd) flush();
    active = active.filter((entry) => entry.endMinute > item.startMinute);
    const used = new Set(active.map((entry) => entry.lane));
    let lane = 0;
    while (used.has(lane)) lane += 1;
    active.push({ lane, endMinute: item.endMinute });
    cluster.push({ ...item, lane });
    clusterEnd = Math.max(clusterEnd, item.endMinute);
    laneCount = Math.max(laneCount, lane + 1);
  });
  flush();
  return result;
}

function truncateLines(pdf: jsPDF, text: string, width: number, maxLines: number) {
  const lines = pdf.splitTextToSize(text, width) as string[];
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  let last = visible[maxLines - 1].replace(/[.…]+$/, "").trimEnd();
  while (last && pdf.getTextWidth(`${last}…`) > width) last = last.slice(0, -1).trimEnd();
  visible[maxLines - 1] = `${last}…`;
  return visible;
}

function drawEvent(
  pdf: jsPDF,
  positioned: PositionedPdfEvent,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const { event } = positioned;
  const colors = statusColors(event.status);
  const innerWidth = Math.max(6, width - 3.2);

  pdf.setFillColor(...colors.fill);
  pdf.setDrawColor(...colors.accent);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(x, y, width, height, 1.2, 1.2, "FD");
  pdf.setFillColor(...colors.accent);
  pdf.roundedRect(x, y, 1.2, height, 0.6, 0.6, "F");

  let cursorY = y + 1.5;
  const bottom = y + height - 1;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.3);
  pdf.setTextColor(...(event.status === "Cancelada" ? colors.text : DARK));
  const titleLines = truncateLines(pdf, `${event.time} · ${event.client}`, innerWidth, height >= 12 ? 2 : 1);
  titleLines.forEach((line) => {
    if (cursorY + 2 > bottom) return;
    pdf.text(line, x + 2, cursorY + 1.7);
    cursorY += 2.25;
  });

  if (event.activity && height >= 10 && cursorY + 2.5 < bottom) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.3);
    pdf.setTextColor(...MUTED);
    const lines = truncateLines(pdf, event.activity, innerWidth, height >= 15 ? 2 : 1);
    lines.forEach((line) => {
      if (cursorY + 1.8 > bottom) return;
      pdf.text(line, x + 2, cursorY + 1.45);
      cursorY += 1.85;
    });
  }

  if (event.responsibles && height >= 14 && cursorY + 2.2 < bottom) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(4.8);
    pdf.setTextColor(...MUTED);
    const responsible = truncateLines(pdf, event.responsibles, innerWidth, 1)[0];
    pdf.text(responsible, x + 2, cursorY + 1.35);
    cursorY += 1.8;
  }

  if (height >= 9) {
    pdf.setFillColor(...colors.accent);
    pdf.circle(x + 2.4, bottom - 0.8, 0.55, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(4.6);
    pdf.setTextColor(...colors.text);
    const footer = `${event.status} · ${event.modality}`;
    const footerLine = truncateLines(pdf, footer, innerWidth - 1.5, 1)[0];
    pdf.text(footerLine, x + 3.5, bottom - 0.25);
  }
}

export function createWeeklyAgendaPdf({
  weekLabel,
  days,
}: {
  weekLabel: string;
  days: WeeklyAgendaPdfDay[];
}) {
  const positionedDays = days.map((day) => {
    const positioned = positionPdfEvents(day.events);
    const laneCount = Math.max(1, ...positioned.map((event) => event.laneCount));
    return {
      day,
      positioned,
      allDay: day.events.filter((event) => event.allDay),
      width: Math.max(BASE_DAY_WIDTH, laneCount * EVENT_LANE_WIDTH),
    };
  });

  const timedEvents = days.flatMap((day) => day.events).filter((event) => !event.allDay);
  const earliest = timedEvents.length ? Math.min(...timedEvents.map((event) => event.startMinute)) : 8 * 60;
  const latest = timedEvents.length
    ? Math.max(...timedEvents.map((event) => event.startMinute + Math.max(15, event.durationMinutes)))
    : 18 * 60;
  const rangeStart = Math.max(0, Math.min(8 * 60, Math.floor(earliest / 60) * 60));
  const rangeEnd = Math.min(24 * 60, Math.max(18 * 60, Math.ceil(latest / 60) * 60));
  const rangeMinutes = Math.max(60, rangeEnd - rangeStart);

  const maxAllDay = Math.max(0, ...positionedDays.map((day) => day.allDay.length));
  const allDayHeight = maxAllDay > 0 ? 3 + maxAllDay * 4.5 : 0;
  const notes = days.flatMap((day) => day.events
    .filter((event) => event.note)
    .map((event) => `${day.dateLabel} ${day.dayLabel} · ${event.time} · ${event.client}: ${event.note}`));
  const notesHeight = notes.length ? Math.min(18, 4 + notes.length * 3.5) : 0;
  const gridTop = HEADER_BOTTOM + DAY_HEADER_HEIGHT + allDayHeight;
  const gridBottom = PAGE_HEIGHT - PAGE_MARGIN - notesHeight;
  const gridHeight = gridBottom - gridTop;

  const daysWidth = positionedDays.reduce((total, day) => total + day.width, 0)
    + Math.max(0, positionedDays.length - 1) * DAY_GAP;
  const requestedWidth = Math.max(297, PAGE_MARGIN * 2 + TIME_AXIS_WIDTH + daysWidth);
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [requestedWidth, PAGE_HEIGHT],
    compress: true,
    putOnlyUsedFonts: true,
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentStartX = (pageWidth - (TIME_AXIS_WIDTH + daysWidth)) / 2;
  const daysStartX = contentStartX + TIME_AXIS_WIDTH;
  const totalEvents = days.reduce((total, day) => total + day.events.length, 0);

  // Cabeçalho inspirado em calendários modernos: forte hierarquia e pouco ruído.
  pdf.setFillColor(...ORANGE);
  pdf.rect(PAGE_MARGIN, 7, 2.2, 18, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.setTextColor(...DARK);
  pdf.text("AGENDA SEMANAL", PAGE_MARGIN + 5.5, 13.5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...MUTED);
  pdf.text(`${weekLabel.toUpperCase()}  ·  ${totalEvents} ${totalEvents === 1 ? "compromisso" : "compromissos"}`, PAGE_MARGIN + 5.5, 19);
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(6.2);
  pdf.setTextColor(...ORANGE);
  pdf.text("visitas, reuniões e configurações internas", PAGE_MARGIN + 5.5, 23.5);

  const logoCenterX = pageWidth - PAGE_MARGIN - 11;
  pdf.setDrawColor(...ORANGE);
  pdf.setLineWidth(1);
  [0, 3, 6].forEach((offset) => {
    pdf.line(logoCenterX - 3.5, 7 + offset, logoCenterX, 10 + offset);
    pdf.line(logoCenterX, 10 + offset, logoCenterX + 3.5, 7 + offset);
  });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.8);
  pdf.setTextColor(...ORANGE);
  pdf.text("USE SISTEMAS", logoCenterX, 20.5, { align: "center" });

  // Cabeçalhos dos dias.
  pdf.setFillColor(248, 249, 250);
  pdf.rect(contentStartX, HEADER_BOTTOM, TIME_AXIS_WIDTH, DAY_HEADER_HEIGHT + allDayHeight, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6);
  pdf.setTextColor(...MUTED);
  pdf.text("HORÁRIO", contentStartX + TIME_AXIS_WIDTH / 2, HEADER_BOTTOM + 6.2, { align: "center" });

  let dayX = daysStartX;
  positionedDays.forEach(({ day, allDay, width }) => {
    pdf.setFillColor(248, 249, 250);
    pdf.rect(dayX, HEADER_BOTTOM, width, DAY_HEADER_HEIGHT, "F");
    pdf.setDrawColor(...GRID);
    pdf.setLineWidth(0.2);
    pdf.rect(dayX, HEADER_BOTTOM, width, DAY_HEADER_HEIGHT + allDayHeight, "S");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...DARK);
    pdf.text(`${day.dayLabel}  ${day.dateLabel}`, dayX + 2, HEADER_BOTTOM + 6.3);

    allDay.forEach((event, index) => {
      const colors = statusColors(event.status);
      const y = HEADER_BOTTOM + DAY_HEADER_HEIGHT + 1 + index * 4.5;
      pdf.setFillColor(...colors.fill);
      pdf.setDrawColor(...colors.accent);
      pdf.setLineWidth(0.2);
      pdf.roundedRect(dayX + 1, y, width - 2, 3.5, 1.2, 1.2, "FD");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(5.2);
      pdf.setTextColor(...colors.text);
      const text = truncateLines(pdf, `${event.client} · ${event.status}`, width - 4, 1)[0];
      pdf.text(text, dayX + 2, y + 2.35);
    });

    dayX += width + DAY_GAP;
  });

  // Grade de horários, com linhas discretas de hora e meia hora.
  const hourCount = rangeMinutes / 60;
  for (let index = 0; index <= hourCount * 2; index += 1) {
    const minuteOffset = index * 30;
    const y = gridTop + (minuteOffset / rangeMinutes) * gridHeight;
    const fullHour = index % 2 === 0;
    pdf.setDrawColor(...(fullHour ? GRID : [239, 241, 244] as RGB));
    pdf.setLineWidth(fullHour ? 0.22 : 0.12);
    if (!fullHour) pdf.setLineDashPattern([1, 1.2], 0);
    pdf.line(daysStartX, y, daysStartX + daysWidth, y);
    pdf.setLineDashPattern([], 0);
    if (fullHour && index < hourCount * 2) {
      const hour = Math.floor((rangeStart + minuteOffset) / 60);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(5.5);
      pdf.setTextColor(...MUTED);
      pdf.text(`${String(hour).padStart(2, "0")}:00`, daysStartX - 1.5, y + 1.7, { align: "right" });
    }
  }

  dayX = daysStartX;
  positionedDays.forEach(({ positioned, width }) => {
    pdf.setDrawColor(...GRID);
    pdf.setLineWidth(0.2);
    pdf.rect(dayX, gridTop, width, gridHeight, "S");
    positioned.forEach((event) => {
      const visibleStart = Math.max(rangeStart, event.startMinute);
      const visibleEnd = Math.min(rangeEnd, event.endMinute);
      if (visibleEnd <= visibleStart) return;
      const top = gridTop + ((visibleStart - rangeStart) / rangeMinutes) * gridHeight + 0.6;
      const height = Math.max(4.5, ((visibleEnd - visibleStart) / rangeMinutes) * gridHeight - 1.2);
      const laneWidth = width / event.laneCount;
      const x = dayX + event.lane * laneWidth + 0.6;
      drawEvent(pdf, event, x, top, laneWidth - 1.2, height);
    });
    dayX += width + DAY_GAP;
  });

  if (notes.length) {
    const notesTop = gridBottom + 2;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(5.8);
    pdf.setTextColor(...DARK);
    pdf.text("OBSERVAÇÕES", daysStartX, notesTop + 1.5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.2);
    pdf.setTextColor(...MUTED);
    const availableWidth = daysWidth;
    let y = notesTop + 4;
    notes.forEach((note) => {
      if (y > PAGE_HEIGHT - PAGE_MARGIN) return;
      const line = truncateLines(pdf, `• ${note}`, availableWidth, 1)[0];
      pdf.text(line, daysStartX, y);
      y += 3.2;
    });
  }

  pdf.setProperties({
    title: `Agenda semanal — ${weekLabel}`,
    subject: "Agenda de visitas, reuniões e configurações internas",
    author: "Use Sistemas",
  });
  return pdf;
}
