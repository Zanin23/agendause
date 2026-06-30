import { useEffect, useState, useCallback } from "react";

export type FontScale = "normal" | "large" | "xlarge";

const SCALE_KEY = "treinacheck-a11y-scale";
const BOLD_KEY = "treinacheck-a11y-bold";
const CONTRAST_KEY = "treinacheck-a11y-contrast";

const SCALE_PX: Record<FontScale, string> = {
  normal: "16px",
  large: "18px",
  xlarge: "20px",
};

function applyScale(scale: FontScale) {
  document.documentElement.style.fontSize = SCALE_PX[scale];
  document.documentElement.dataset.fontScale = scale;
}
function applyBold(on: boolean) {
  document.documentElement.classList.toggle("a11y-bold", on);
}
function applyContrast(on: boolean) {
  document.documentElement.classList.toggle("a11y-contrast", on);
}

export function useA11y() {
  const [scale, setScaleState] = useState<FontScale>(() => {
    if (typeof window === "undefined") return "normal";
    const v = localStorage.getItem(SCALE_KEY);
    return v === "large" || v === "xlarge" ? v : "normal";
  });
  const [bold, setBoldState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(BOLD_KEY) === "1";
  });
  const [contrast, setContrastState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(CONTRAST_KEY) === "1";
  });

  useEffect(() => { applyScale(scale); }, [scale]);
  useEffect(() => { applyBold(bold); }, [bold]);
  useEffect(() => { applyContrast(contrast); }, [contrast]);

  const setScale = useCallback((s: FontScale) => {
    localStorage.setItem(SCALE_KEY, s);
    setScaleState(s);
  }, []);
  const setBold = useCallback((v: boolean) => {
    localStorage.setItem(BOLD_KEY, v ? "1" : "0");
    setBoldState(v);
  }, []);
  const setContrast = useCallback((v: boolean) => {
    localStorage.setItem(CONTRAST_KEY, v ? "1" : "0");
    setContrastState(v);
  }, []);

  return { scale, setScale, bold, setBold, contrast, setContrast };
}