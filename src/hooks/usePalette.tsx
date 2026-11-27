import { useEffect, useState, useCallback } from "react";

export type Palette =
  | "default"
  | "oceano"
  | "pitaya"
  | "uva"
  | "esmeralda"
  | "americana"
  | "feira"
  | "botanica"
  | "pedro";

const PALETTE_KEY = "treinacheck-theme-palette";
const PALETTE_CLASSES = [
  "theme-oceano",
  "theme-pitaya",
  "theme-uva",
  "theme-esmeralda",
  "theme-americana",
  "theme-feira",
  "theme-botanica",
  "theme-pedro",
] as const;

export const PALETTE_OPTIONS: {
  id: Palette;
  name: string;
  description: string;
  /** Cores aproximadas só para o swatch de prévia. */
  swatch: [string, string, string];
}[] = [
  {
    id: "default",
    name: "Padrão da marca",
    description: "O visual atual: laranja queimado, papel creme e azul-noite.",
    swatch: ["#d0712a", "#7a1f1a", "#1c2b47"],
  },
  {
    id: "oceano",
    name: "Oceano",
    description: "Ciano e azul elétrico com tinta náutica: fundo, cartões e bordas também mergulham no azul.",
    swatch: ["#2fd4ff", "#2f7df6", "#123a6b"],
  },
  {
    id: "pitaya",
    name: "Pitaya",
    description: "Rosa choque intenso com toques de coral e magenta, da seleção aos cartões.",
    swatch: ["#ff4fa3", "#e11d74", "#6b1145"],
  },
  {
    id: "uva",
    name: "Uva",
    description: "Violeta elétrico com gradientes que vão do lilás ao magenta e fundo todo envernizado.",
    swatch: ["#a855f7", "#7c3aed", "#3b0764"],
  },
  {
    id: "esmeralda",
    name: "Esmeralda",
    description: "Verde vívido com limão e teal: um visual energizante de ponta a ponta.",
    swatch: ["#34d399", "#0d9488", "#064e3b"],
  },
  {
    id: "americana",
    name: "Americana — Rota 66",
    description: "Vanilla custard, tangerina cítrica, vermelho-bandeira e azul espacial: um pôster retrô de viagem em cada tela.",
    swatch: ["#f77f00", "#d62828", "#003049"],
  },
  {
    id: "feira",
    name: "Feira Livre",
    description: "Sol, laranja-cenoura, vermelho-tomate e verde-floresta: o retrato de uma feira retrô brasileira.",
    swatch: ["#ffc926", "#f96015", "#18542a"],
  },
  {
    id: "botanica",
    name: "Botânica",
    description: "Terracota, ameixa-seca e sálvia sobre carvão quente: o clima de um apotécari@ escuro e acolhedor.",
    swatch: ["#f29033", "#6a3250", "#1f2420"],
  },
  {
    id: "pedro",
    name: "Pedro — Rosa BOLD",
    description: "Especialmente para o Pedro: rosa framboesa sobre creme, inspirado nos rótulos da The Boldest Co. — o mais ousado e pessoal de todos.",
    swatch: ["#ff5fa2", "#d6336c", "#eedbcb"],
  },
];

const PALETTE_IDS = PALETTE_OPTIONS.map((option) => option.id);

function isPalette(value: string | null): value is Palette {
  return value !== null && (PALETTE_IDS as string[]).includes(value) && value !== "default";
}

function getInitialPalette(): Palette {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(PALETTE_KEY);
  return isPalette(stored) ? stored : "default";
}

export function applyPalette(palette: Palette) {
  const root = document.documentElement;
  for (const cls of PALETTE_CLASSES) root.classList.remove(cls);
  if (palette !== "default") root.classList.add(`theme-${palette}`);
}

export function usePalette() {
  const [palette, setPaletteState] = useState<Palette>(() => getInitialPalette());

  useEffect(() => {
    applyPalette(palette);
    try {
      if (palette === "default") window.localStorage.removeItem(PALETTE_KEY);
      else window.localStorage.setItem(PALETTE_KEY, palette);
    } catch {
      /* ignore */
    }
  }, [palette]);

  const setPalette = useCallback((p: Palette) => setPaletteState(p), []);

  return { palette, setPalette };
}
