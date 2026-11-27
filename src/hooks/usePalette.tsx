import { useEffect, useState, useCallback } from "react";

export type Palette = "default" | "oceano" | "pitaya" | "uva" | "esmeralda";

const PALETTE_KEY = "treinacheck-theme-palette";
const PALETTE_CLASSES = ["theme-oceano", "theme-pitaya", "theme-uva", "theme-esmeralda"] as const;

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
    description: "Ciano e azul elétrico para quem gosta de contraste frio e vivo.",
    swatch: ["#2fd4ff", "#2f7df6", "#123a6b"],
  },
  {
    id: "pitaya",
    name: "Pitaya",
    description: "Rosa choque intenso com toques de coral e magenta.",
    swatch: ["#ff4fa3", "#e11d74", "#6b1145"],
  },
  {
    id: "uva",
    name: "Uva",
    description: "Violeta elétrico com gradientes que vão do lilás ao magenta.",
    swatch: ["#a855f7", "#7c3aed", "#3b0764"],
  },
  {
    id: "esmeralda",
    name: "Esmeralda",
    description: "Verde vívido com limão e teal para um visual energizante.",
    swatch: ["#34d399", "#0d9488", "#064e3b"],
  },
];

function isPalette(value: string | null): value is Palette {
  return value === "oceano" || value === "pitaya" || value === "uva" || value === "esmeralda";
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
