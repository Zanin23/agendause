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

type DayLayout = {
  day: WeeklyAgendaPdfDay;
  lanes: CardLayout[][];
  width: number;
};

const PAGE_HEIGHT = 210;
const PAGE_MARGIN = 8;
const DAY_TOP = 33;
const DAY_HEADER_HEIGHT = 10;
const DAY_BOTTOM = PAGE_HEIGHT - PAGE_MARGIN;
const DAY_PADDING = 1.5;
const DAY_GAP = 2.5;
const LANE_WIDTH = 44;
const LANE_GAP = 1.5;
const CARD_GAP = 2;
const CARD_PADDING = 2;
const STATUS_HEIGHT = 4;
const MAX_CARDS_PER_LANE = 4;

const ORANGE: RGB = [242, 107, 31];
const DARK: RGB = [28, 28, 28];
const MUTED: RGB = [95, 95, 95];
const LIGHT_BORDER: RGB = [222, 222, 222];

const lineHeight = (fontSize: number) => fontSize * 0.352778 * 1.16;

function statusColors(status: WeeklyAgendaPdfStatus) {
  if (status === "Cancelada") {
    return { border: [218, 48, 48] as RGB, fill: [255, 242, 242] as RGB, text: [185, 35, 35] as RGB };
  }
  if (status === "Realizada") {
    return { border: [91, 112, 180] as RGB, fill: [244, 246, 253] as RGB, text: [72, 91, 155] as RGB };
  }
  if (status === "Confirmada") {
    return { border: [31, 157, 85] as RGB, fill: [237, 250, 242] as RGB, text: [24, 125, 68] as RGB };
  }
  if (status === "Reagendada") {
    return { border: [224, 122, 30] as RGB, fill: [255, 247, 237] as RGB, text: [163, 83, 16] as RGB };
  }
  return { border: [218, 172, 43] as RGB, fill: [255, 249, 229] as RGB, text: [145, 101, 0] as RGB };
}

function buildCardLayout(pdf: jsPDF, event: WeeklyAgendaPdfEvent): CardLayout {
  const blocks: TextBlock[] = [];
  const contentWidth = LANE_WIDTH - CARD_PADDING * 2;
  const status = statusColors(event.status);

  const addBlock = (
    value: string | null | undefined,
    size: number,
    style: FontStyle,
    color: RGB,
    marginTop: number,
  ) => {
    const text = value?.trim();
    if (!text) return;
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    blocks.push({
      lines: pdf.splitTextToSize(text, contentWidth) as string[],
      size,
      style,
      color,
      marginTop,
    });
  };

  addBlock(`${event.time} · ${event.client}`, 7.2, "bold", event.status === "Cancelada" ? status.text : DARK, 0);
  addBlock(event.activity, 6.3, "normal", event.status === "Cancelada" ? status.text : [60, 60, 60], 0.8);
  addBlock(
    [event.durationLabel, event.modality, event.location].filter(Boolean).join(" · "),
    5.8,
    "normal",
    event.status === "Cancelada" ? status.text : MUTED,
    0.9,
  );
  addBlock(
    event.responsibles ? `Responsáveis: ${event.responsibles}` : null,
    5.6,
    "normal",
    event.status === "Cancelada" ? status.text : MUTED,
    0.8,
  );
  addBlock(event.note, 5.7, "italic", status.text, 1);

  const textHeight = blocks.reduce(
    (total, block, index) => total + (index === 0 ? 0 : block.marginTop) + block.lines.length * lineHeight(block.size),
    0,
  );
  const height = Math.max(18, CARD_PADDING + textHeight + 1.5 + STATUS_HEIGHT + CARD_PADDING);
  return { event, blocks, height };
}

function buildDayLayout(pdf: jsPDF, day: WeeklyAgendaPdfDay): DayLayout {
  const availableHeight = DAY_BOTTOM - (DAY_TOP + DAY_HEADER_HEIGHT + DAY_PADDING);
  const cards = day.events.map((event) => buildCardLayout(pdf, event));
  const lanes: CardLayout[][] = [];
  let lane: CardLayout[] = [];
  let laneHeight = 0;

  cards.forEach((card) => {
    const nextHeight = laneHeight + (lane.length ? CARD_GAP : 0) + card.height;
    if (lane.length && (lane.length >= MAX_CARDS_PER_LANE || nextHeight > availableHeight)) {
      lanes.push(lane);
      lane = [];
      laneHeight = 0;
    }
    laneHeight += (lane.length ? CARD_GAP : 0) + card.height;
    lane.push(card);
  });
  if (lane.length) lanes.push(lane);
  if (lanes.length === 0) lanes.push([]);

  return {
    day,
    lanes,
    width: DAY_PADDING * 2 + lanes.length * LANE_WIDTH + Math.max(0, lanes.length - 1) * LANE_GAP,
  };
}

function drawCard(pdf: jsPDF, card: CardLayout, x: number, y: number) {
  const colors = statusColors(card.event.status);
  pdf.setFillColor(...colors.fill);
  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.35);
  pdf.roundedRect(x, y, LANE_WIDTH, card.height, 1.5, 1.5, "FD");

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
  pdf.setFontSize(5.4);
  const statusWidth = Math.min(LANE_WIDTH - CARD_PADDING * 2, pdf.getTextWidth(card.event.status.toUpperCase()) + 4);
  const statusY = y + card.height - CARD_PADDING - STATUS_HEIGHT;
  pdf.setFillColor(...colors.fill);
  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(x + CARD_PADDING, statusY, statusWidth, STATUS_HEIGHT, 2, 2, "FD");
  pdf.setTextColor(...colors.text);
  pdf.text(card.event.status.toUpperCase(), x + CARD_PADDING + statusWidth / 2, statusY + 2.75, { align: "center" });
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

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [requestedWidth, PAGE_HEIGHT],
    compress: true,
    putOnlyUsedFonts: true,
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const boardStartX = (pageWidth - boardWidth) / 2;
  const totalEvents = days.reduce((total, day) => total + day.events.length, 0);

  pdf.setFillColor(...ORANGE);
  pdf.rect(PAGE_MARGIN, 7, 2.5, 19, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(...DARK);
  pdf.text("AGENDA SEMANAL", PAGE_MARGIN + 6, 13.5);
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(8);
  pdf.setTextColor(...ORANGE);
  pdf.text("visitas, reuniões e configurações internas", PAGE_MARGIN + 6, 18.5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...MUTED);
  pdf.text(weekLabel.toUpperCase(), PAGE_MARGIN + 6, 23.5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.text(`${totalEvents} ${totalEvents === 1 ? "compromisso" : "compromissos"}`, PAGE_MARGIN + 6, 27.5);
  const logoCenterX = pageWidth - PAGE_MARGIN - 12;
  pdf.setDrawColor(...ORANGE);
  pdf.setLineWidth(1.1);
  [0, 3.2, 6.4].forEach((offset) => {
    pdf.line(logoCenterX - 3.8, 7 + offset, logoCenterX, 10.2 + offset);
    pdf.line(logoCenterX, 10.2 + offset, logoCenterX + 3.8, 7 + offset);
  });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...ORANGE);
  pdf.text("USE SISTEMAS", logoCenterX, 21, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.8);
  pdf.setTextColor(...MUTED);
  pdf.text("Agenda sujeita a alterações", pageWidth - PAGE_MARGIN, 26, { align: "right" });

  let dayX = boardStartX;
  dayLayouts.forEach(({ day, lanes, width }) => {
    const dayHeight = DAY_BOTTOM - DAY_TOP;
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(dayX, DAY_TOP, width, dayHeight, 2, 2, "F");
    pdf.setFillColor(247, 247, 247);
    pdf.roundedRect(dayX, DAY_TOP, width, DAY_HEADER_HEIGHT, 2, 2, "F");
    pdf.rect(dayX, DAY_TOP + 2, width, DAY_HEADER_HEIGHT - 2, "F");
    pdf.setDrawColor(...ORANGE);
    pdf.setLineWidth(0.45);
    pdf.roundedRect(dayX, DAY_TOP, width, dayHeight, 2, 2, "S");
    pdf.line(dayX, DAY_TOP + DAY_HEADER_HEIGHT, dayX + width, DAY_TOP + DAY_HEADER_HEIGHT);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    pdf.setTextColor(...DARK);
    pdf.text(`${day.dateLabel} ${day.dayLabel}`, dayX + 2.5, DAY_TOP + 6.7);

    if (day.events.length === 0) {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(7);
      pdf.setTextColor(145, 145, 145);
      pdf.text("Sem compromissos", dayX + width / 2, DAY_TOP + DAY_HEADER_HEIGHT + 10, { align: "center" });
    }

    lanes.forEach((lane, laneIndex) => {
      const laneX = dayX + DAY_PADDING + laneIndex * (LANE_WIDTH + LANE_GAP);
      if (laneIndex > 0) {
        const separatorX = laneX - LANE_GAP / 2;
        pdf.setDrawColor(...LIGHT_BORDER);
        pdf.setLineDashPattern([1, 1], 0);
        pdf.line(separatorX, DAY_TOP + DAY_HEADER_HEIGHT + 1, separatorX, DAY_BOTTOM - 1);
        pdf.setLineDashPattern([], 0);
      }
      let cardY = DAY_TOP + DAY_HEADER_HEIGHT + DAY_PADDING;
      lane.forEach((card) => {
        drawCard(pdf, card, laneX, cardY);
        cardY += card.height + CARD_GAP;
      });
    });

    dayX += width + DAY_GAP;
  });

  pdf.setProperties({
    title: `Agenda semanal — ${weekLabel}`,
    subject: "Agenda de visitas, reuniões e configurações internas",
    author: "Use Sistemas",
  });
  return pdf;
}
