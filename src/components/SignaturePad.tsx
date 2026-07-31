import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Maximize2, Minimize2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  onChange: (dataUrl: string | null) => void;
  label?: string;
  hint?: string;
  height?: number;
};

/** Campo de assinatura manuscrita (dedo, caneta stylus ou mouse). */
export const SignaturePad = ({
  onChange,
  label = "Assinatura",
  hint = "Assine no campo abaixo usando o dedo, uma caneta stylus ou o mouse.",
  height = 180,
}: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const snapshot = useRef<string | null>(null);

  const setupCanvas = (restore = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    if (restore && snapshot.current) {
      const img = new Image();
      const src = snapshot.current;
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = src;
    }
  };

  useEffect(() => {
    setupCanvas();
    const onResize = () => {
      snapshot.current = hasInk ? canvasRef.current?.toDataURL("image/png") ?? null : null;
      setupCanvas(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reajusta o canvas ao entrar/sair do modo expandido, preservando o traço.
  useEffect(() => {
    requestAnimationFrame(() => {
      setupCanvas(true);
      if (snapshot.current) onChange(snapshot.current);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pointFromEvent(e);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    const p = pointFromEvent(e);
    if (!ctx || !last.current) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (canvas && hasInk) {
      const data = canvas.toDataURL("image/png");
      snapshot.current = data;
      onChange(data);
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    snapshot.current = null;
    setHasInk(false);
    onChange(null);
  };

  const toggleExpanded = () => {
    snapshot.current = hasInk ? canvasRef.current?.toDataURL("image/png") ?? null : snapshot.current;
    setExpanded((v) => !v);
  };

  const body = (
    <div className={expanded ? "flex h-full flex-col gap-2 p-3" : "space-y-2"}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <PenLine className="h-3.5 w-3.5 text-primary" /> {label}
        </span>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasInk}>
            <Eraser className="h-3.5 w-3.5" /> Limpar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={toggleExpanded}>
            {expanded ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" /> Reduzir
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" /> Expandir
              </>
            )}
          </Button>
        </div>
      </div>
      <div
        className={`relative rounded-xl border border-dashed border-border bg-white overflow-hidden ${
          expanded ? "flex-1" : ""
        }`}
        style={expanded ? undefined : { height }}
      >
        <canvas
          ref={canvasRef}
          style={{ touchAction: "none" }}
          className="w-full h-full block cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-xs text-neutral-400">
            Assine aqui
          </span>
        )}
        <span className="pointer-events-none absolute inset-x-8 bottom-5 border-b border-neutral-300" />
      </div>
      {expanded ? (
        <Button type="button" onClick={toggleExpanded} className="w-full">
          <Check className="h-4 w-4" /> Concluir assinatura
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );

  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 bg-background animate-in fade-in">{body}</div>
    );
  }

  return body;
};