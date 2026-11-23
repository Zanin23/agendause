import { jsPDF } from "jspdf";

type RGB = [number, number, number];
type FontStyle = "normal" | "bold" | "italic";

export type WeeklyAgendaPdfStatus =
  | "Cancelada"
  | "Realizada"
  | "Reagendada"
  | "Confirmada"
  | "Pendente";

export type WeeklyAgendaPdfEvent = {
  startMinute: number;
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

type TextBlock = {
  lines: string[];
  size: number;
  style: FontStyle;
  color: RGB;
  marginTop: number;
};

type CardLayout = {
  event: WeeklyAgendaPdfEvent;
  blocks: TextBlock[];
  height: number;
};

type PeriodLayout = {
  cards: CardLayout[];
  height: number;
};

type DayLayout = {
  day: WeeklyAgendaPdfDay;
  allDay: PeriodLayout;
  morning: PeriodLayout;
  afternoon: PeriodLayout;
  contentHeight: number;
  width: number;
};

const MIN_PAGE_HEIGHT = 230;
const PAGE_MARGIN = 8;
const DAY_TOP = 32;
const DAY_HEADER_HEIGHT = 12;
const DAY_PADDING = 2;
const DAY_GAP = 2.5;
const DAY_WIDTH = 78;
const CARD_WIDTH = DAY_WIDTH - DAY_PADDING * 2;
const CARD_GAP = 2;
const CARD_PADDING = 2.4;
const STATUS_HEIGHT = 4.5;
const PERIOD_LABEL_HEIGHT = 6;

const ORANGE: RGB = [242, 107, 31];
const DARK: RGB = [31, 35, 42];
const MUTED: RGB = [101, 108, 118];
const LIGHT_BORDER: RGB = [222, 226, 231];

const lineHeight = (fontSize: number) => fontSize * 0.352778 * 1.18;

function truncateLines(pdf: jsPDF, text: string, width: number, maxLines: number) {
  const lines = pdf.splitTextToSize(text, width) as string[];
  if (lines.length <= maxLines) return lines;

  const visible = lines.slice(0, maxLines);
  let lastLine = visible[maxLines - 1].replace(/[.…]+$/, "").trimEnd();
  while (lastLine && pdf.getTextWidth(`${lastLine}…`) > width) {
    lastLine = lastLine.slice(0, -1).trimEnd();
  }
  visible[maxLines - 1] = `${lastLine}…`;
  return visible;
}

function statusColors(status: WeeklyAgendaPdfStatus) {
  if (status === "Cancelada") {
    return { accent: [218, 48, 48] as RGB, fill: [255, 244, 244] as RGB, text: [177, 35, 35] as RGB };
  }
  if (status === "Realizada") {
    return { accent: [91, 112, 180] as RGB, fill: [245, 247, 252] as RGB, text: [68, 86, 148] as RGB };
  }
  if (status === "Confirmada") {
    return { accent: [31, 157, 85] as RGB, fill: [241, 250, 245] as RGB, text: [23, 119, 66] as RGB };
  }
  if (status === "Reagendada") {
    return { accent: [225, 118, 24] as RGB, fill: [255, 248, 239] as RGB, text: [155, 77, 14] as RGB };
  }
  return { accent: [218, 172, 43] as RGB, fill: [255, 251, 236] as RGB, text: [137, 96, 0] as RGB };
}

function buildCardLayout(pdf: jsPDF, event: WeeklyAgendaPdfEvent): CardLayout {
  const blocks: TextBlock[] = [];
  const contentWidth = CARD_WIDTH - CARD_PADDING * 2;
  const colors = statusColors(event.status);

  const addBlock = (
    value: string | null | undefined,
    size: number,
    style: FontStyle,
    color: RGB,
    marginTop: number,
    maxLines: number,
  ) => {
    const text = value?.trim();
    if (!text) return;
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    blocks.push({
      lines: truncateLines(pdf, text, contentWidth, maxLines),
      size,
      style,
      color,
      marginTop,
    });
  };

  addBlock(`${event.time} · ${event.client}`, 7.8, "bold", event.status === "Cancelada" ? colors.text : DARK, 0, 3);
  addBlock(event.activity, 6.7, "normal", event.status === "Cancelada" ? colors.text : [67, 72, 80], 0.8, 2);
  addBlock(
    [event.durationLabel, event.modality, event.location].filter(Boolean).join(" · "),
    6.1,
    "normal",
    event.status === "Cancelada" ? colors.text : MUTED,
    1,
    2,
  );
  addBlock(
    event.responsibles ? `Responsáveis: ${event.responsibles}` : null,
    5.9,
    "normal",
    event.status === "Cancelada" ? colors.text : MUTED,
    0.9,
    2,
  );
  addBlock(event.note, 6, "italic", colors.text, 1, 2);

  const textHeight = blocks.reduce(
    (total, block, index) => total + (index === 0 ? 0 : block.marginTop) + block.lines.length * lineHeight(block.size),
    0,
  );
  return {
    event,
    blocks,
    height: Math.max(22, CARD_PADDING + textHeight + 1.8 + STATUS_HEIGHT + CARD_PADDING),
  };
}

function stackPeriod(cards: CardLayout[]): PeriodLayout {
  return {
    cards,
    height: cards.reduce(
      (total, card, index) => total + card.height + (index ? CARD_GAP : 0),
      0,
    ),
  };
}

function buildDayLayout(pdf: jsPDF, day: WeeklyAgendaPdfDay): DayLayout {
  const allDayCards = day.events
    .filter((event) => event.allDay)
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((event) => buildCardLayout(pdf, event));
  const morningCards = day.events
    .filter((event) => !event.allDay && event.startMinute < 12 * 60)
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((event) => buildCardLayout(pdf, event));
  const afternoonCards = day.events
    .filter((event) => !event.allDay && event.startMinute >= 12 * 60)
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((event) => buildCardLayout(pdf, event));
  const allDay = stackPeriod(allDayCards);
  const morning = stackPeriod(morningCards);
  const afternoon = stackPeriod(afternoonCards);
  const visiblePeriods = [allDay, morning, afternoon].filter((period) => period.cards.length);
  const contentHeight = visiblePeriods.reduce(
    (total, period) => total + PERIOD_LABEL_HEIGHT + period.height,
    Math.max(0, visiblePeriods.length - 1) * 3,
  );

  return {
    day,
    allDay,
    morning,
    afternoon,
    contentHeight,
    width: DAY_WIDTH,
  };
}

function drawCard(pdf: jsPDF, card: CardLayout, x: number, y: number) {
  const colors = statusColors(card.event.status);
  pdf.setFillColor(...colors.fill);
  pdf.setDrawColor(...LIGHT_BORDER);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(x, y, CARD_WIDTH, card.height, 1.8, 1.8, "FD");
  pdf.setFillColor(...colors.accent);
  pdf.roundedRect(x, y, 1.3, card.height, 0.65, 0.65, "F");

  let cursorY = y + CARD_PADDING;
  card.blocks.forEach((block, blockIndex) => {
    if (blockIndex > 0) cursorY += block.marginTop;
    pdf.setFont("helvetica", block.style);
    pdf.setFontSize(block.size);
    pdf.setTextColor(...block.color);
    const blockLineHeight = lineHeight(block.size);
    block.lines.forEach((line) => {
      pdf.text(line, x + CARD_PADDING, cursorY + blockLineHeight * 0.78);
      cursorY += blockLineHeight;
    });
  });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.8);
  const statusWidth = Math.min(CARD_WIDTH - CARD_PADDING * 2, pdf.getTextWidth(card.event.status.toUpperCase()) + 4.5);
  const statusY = y + card.height - CARD_PADDING - STATUS_HEIGHT;
  pdf.setFillColor(...colors.fill);
  pdf.setDrawColor(...colors.accent);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(x + CARD_PADDING, statusY, statusWidth, STATUS_HEIGHT, 2.2, 2.2, "FD");
  pdf.setTextColor(...colors.text);
  pdf.text(card.event.status.toUpperCase(), x + CARD_PADDING + statusWidth / 2, statusY + 3.05, { align: "center" });
}

function drawPeriod(
  pdf: jsPDF,
  title: string,
  period: PeriodLayout,
  dayX: number,
  dayWidth: number,
  startY: number,
) {
  if (!period.cards.length) return startY;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.8);
  pdf.setTextColor(...ORANGE);
  const heading = title.toUpperCase();
  pdf.text(heading, dayX + DAY_PADDING, startY + 3.5);
  pdf.setDrawColor(239, 215, 197);
  pdf.setLineWidth(0.2);
  const lineStart = dayX + DAY_PADDING + pdf.getTextWidth(heading) + 2;
  pdf.line(lineStart, startY + 2.8, dayX + dayWidth - DAY_PADDING, startY + 2.8);

  let cardY = startY + PERIOD_LABEL_HEIGHT;
  period.cards.forEach((card) => {
    drawCard(pdf, card, dayX + DAY_PADDING, cardY);
    cardY += card.height + CARD_GAP;
  });
  return startY + PERIOD_LABEL_HEIGHT + period.height;
}

export function createWeeklyAgendaPdf({
  weekLabel,
  days,
}: {
  weekLabel: string;
  days: WeeklyAgendaPdfDay[];
}) {
  const measuringPdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const dayLayouts = days.map((day) => buildDayLayout(measuringPdf, day));
  const boardWidth = dayLayouts.reduce((total, day) => total + day.width, 0)
    + Math.max(0, dayLayouts.length - 1) * DAY_GAP;
  const requestedWidth = Math.max(297, boardWidth + PAGE_MARGIN * 2);
  const minimumDayHeight = MIN_PAGE_HEIGHT - DAY_TOP - PAGE_MARGIN;
  const requiredDayHeight = Math.max(
    minimumDayHeight,
    ...dayLayouts.map(({ contentHeight }) => DAY_HEADER_HEIGHT + DAY_PADDING * 2 + contentHeight),
  );
  const requestedHeight = DAY_TOP + requiredDayHeight + PAGE_MARGIN;
  const pdf = new jsPDF({
    orientation: requestedWidth >= requestedHeight ? "landscape" : "portrait",
    unit: "mm",
    format: [requestedWidth, requestedHeight],
    compress: true,
    putOnlyUsedFonts: true,
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const boardStartX = (pageWidth - boardWidth) / 2;
  const totalEvents = days.reduce((total, day) => total + day.events.length, 0);

  // Cabeçalho limpo, mantendo a identidade da agenda original.
  pdf.setFillColor(...ORANGE);
  pdf.rect(PAGE_MARGIN, 7, 2.2, 18, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(...DARK);
  pdf.text("AGENDA SEMANAL", PAGE_MARGIN + 5.5, 13.5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...MUTED);
  pdf.text(`${weekLabel.toUpperCase()}  ·  ${totalEvents} ${totalEvents === 1 ? "compromisso" : "compromissos"}`, PAGE_MARGIN + 5.5, 19.2);
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(6.5);
  pdf.setTextColor(...ORANGE);
  pdf.text("visitas, reuniões e configurações internas", PAGE_MARGIN + 5.5, 24);

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

  let dayX = boardStartX;
  dayLayouts.forEach(({ day, allDay, morning, afternoon, width }) => {
    const dayHeight = requiredDayHeight;
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(dayX, DAY_TOP, width, dayHeight, 2.2, 2.2, "F");
    pdf.setFillColor(248, 249, 250);
    pdf.roundedRect(dayX, DAY_TOP, width, DAY_HEADER_HEIGHT, 2.2, 2.2, "F");
    pdf.rect(dayX, DAY_TOP + 2, width, DAY_HEADER_HEIGHT - 2, "F");
    pdf.setDrawColor(...LIGHT_BORDER);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(dayX, DAY_TOP, width, dayHeight, 2.2, 2.2, "S");
    pdf.setDrawColor(...ORANGE);
    pdf.setLineWidth(0.7);
    pdf.line(dayX, DAY_TOP, dayX + width, DAY_TOP);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...DARK);
    pdf.text(`${day.dayLabel}  ${day.dateLabel}`, dayX + 3, DAY_TOP + 7.5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.8);
    pdf.setTextColor(...MUTED);
    pdf.text(`${day.events.length} ${day.events.length === 1 ? "item" : "itens"}`, dayX + width - 3, DAY_TOP + 7.5, { align: "right" });

    if (!day.events.length) {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(7);
      pdf.setTextColor(145, 145, 145);
      pdf.text("Sem compromissos", dayX + width / 2, DAY_TOP + DAY_HEADER_HEIGHT + 12, { align: "center" });
    } else {
      let cursorY = DAY_TOP + DAY_HEADER_HEIGHT + DAY_PADDING;
      const periods = [
        { title: "Dia inteiro", layout: allDay },
        { title: "Manhã", layout: morning },
        { title: "Tarde", layout: afternoon },
      ].filter(({ layout }) => layout.cards.length);

      periods.forEach(({ title, layout }, index) => {
        if (index > 0) cursorY += 3;
        cursorY = drawPeriod(pdf, title, layout, dayX, width, cursorY);
      });
    }
    dayX += width + DAY_GAP;
  });

  pdf.setProperties({
    title: `Agenda semanal — ${weekLabel}`,
    subject: "Agenda de visitas, reuniões e configurações internas",
    author: "Use Sistemas",
  });
  return pdf;
}
