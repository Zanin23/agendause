import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Crop,
  FileText,
  LoaderCircle,
  RotateCcw,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createPdfSignatureImage,
  NormalizedCrop,
  renderPdfPage,
  RenderedPdfPage,
} from "@/lib/pdfSignature";

type Props = {
  onChange: (dataUrl: string | null) => void;
};

type Point = { x: number; y: number };

export const PdfSignatureImporter = ({ onChange }: Props) => {
  const [file, setFile] = useState<File | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<RenderedPdfPage | null>(null);
  const [crop, setCrop] = useState<NormalizedCrop | null>(null);
  const [draftCrop, setDraftCrop] = useState<NormalizedCrop | null>(null);
  const [scale, setScale] = useState(100);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditingCrop, setIsEditingCrop] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const generationId = useRef(0);
  const pageUrl = useRef<string | null>(null);
  const dragStart = useRef<Point | null>(null);

  const loadPage = useCallback(async (selectedFile: File, selectedPage: number) => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setError("");
    setPage(null);
    setCrop(null);
    setDraftCrop(null);
    setSignatureImage(null);
    setIsEditingCrop(false);
    setScale(100);
    onChange(null);

    if (pageUrl.current) {
      URL.revokeObjectURL(pageUrl.current);
      pageUrl.current = null;
    }

    try {
      const renderedPage = await renderPdfPage(selectedFile, selectedPage);
      if (currentRequest !== requestId.current) {
        URL.revokeObjectURL(renderedPage.imageUrl);
        return;
      }

      pageUrl.current = renderedPage.imageUrl;
      setPage(renderedPage);
      setCrop(renderedPage.autoCrop);
      setDraftCrop(renderedPage.autoCrop);
    } catch (cause) {
      if (currentRequest === requestId.current) {
        setError(cause instanceof Error ? cause.message : "Não foi possível ler esse PDF.");
      }
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [onChange]);

  useEffect(() => () => {
    requestId.current += 1;
    generationId.current += 1;
    if (pageUrl.current) URL.revokeObjectURL(pageUrl.current);
  }, []);

  useEffect(() => {
    if (!page || !crop) return;
    if (!page.hasVisibleContent) {
      setSignatureImage(null);
      setIsGenerating(false);
      setError("Não encontrei conteúdo visível nesta página. Escolha outra página ou outro PDF.");
      onChange(null);
      return;
    }
    let cancelled = false;
    const currentGeneration = ++generationId.current;
    setIsGenerating(true);
    setError("");
    setSignatureImage(null);
    onChange(null);

    createPdfSignatureImage(page.imageUrl, crop, scale)
      .then((signature) => {
        if (cancelled || currentGeneration !== generationId.current) return;
        setSignatureImage(signature);
        onChange(signature);
      })
      .catch((cause) => {
        if (cancelled || currentGeneration !== generationId.current) return;
        setError(cause instanceof Error ? cause.message : "Não foi possível preparar a assinatura.");
      })
      .finally(() => {
        if (!cancelled && currentGeneration === generationId.current) setIsGenerating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, crop, scale, onChange]);

  const selectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!selectedFile) return;

    setFile(selectedFile);
    setPageNumber(1);
    setIsEditingCrop(false);
    void loadPage(selectedFile, 1);
  };

  const changePage = (nextPage: number) => {
    if (!file || !page || isLoading || nextPage < 1 || nextPage > page.pageCount) return;
    setPageNumber(nextPage);
    void loadPage(file, nextPage);
  };

  const pointFromEvent = (event: React.PointerEvent<HTMLDivElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    };
  };

  const cropBetween = (start: Point, end: Point): NormalizedCrop => ({
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  });

  const startCrop = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isEditingCrop || !page) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    dragStart.current = point;
    setIsDragging(true);
    setDraftCrop({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const moveCrop = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    setDraftCrop(cropBetween(dragStart.current, pointFromEvent(event)));
  };

  const finishCrop = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const nextCrop = cropBetween(dragStart.current, pointFromEvent(event));
    dragStart.current = null;
    setIsDragging(false);

    if (nextCrop.width >= 0.02 && nextCrop.height >= 0.015) {
      setCrop(nextCrop);
      setDraftCrop(nextCrop);
    } else {
      setDraftCrop(crop ?? page?.autoCrop ?? null);
    }
  };

  const resetCrop = () => {
    if (!page) return;
    setCrop(page.autoCrop);
    setDraftCrop(page.autoCrop);
  };

  const visibleCrop = isDragging ? draftCrop : crop;
  const stageRatio = page ? page.width / page.height : 1;
  const stageMaxWidth = page ? Math.min(1000, 360 * stageRatio) : 360;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate" title={file?.name}>
            {file?.name ?? "Nenhum PDF selecionado"}
          </span>
          {file && <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file.size)}</span>}
        </div>
        <Button asChild type="button" size="sm" variant="outline">
          <label htmlFor="pdf-signature-file" className="cursor-pointer">
            <Upload className="h-4 w-4" />
            {isLoading ? "Lendo PDF…" : file ? "Trocar PDF" : "Escolher PDF"}
          </label>
        </Button>
        <input
          id="pdf-signature-file"
          type="file"
          accept="application/pdf,.pdf"
          onChange={selectFile}
          className="sr-only"
          aria-label="Escolher PDF com a assinatura"
        />
      </div>

      {!page && !isLoading && (
        <p className="text-xs text-muted-foreground">
          Envie um PDF de até 15 MB. A página é preparada neste dispositivo; depois você pode escolher
          a página, ajustar o recorte e o tamanho da assinatura.
        </p>
      )}

      {isLoading && (
        <div className="flex min-h-24 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Preparando a página do PDF…
        </div>
      )}

      {page && crop && (
        <>
          <div className="relative flex h-[150px] items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-white p-2 sm:h-[170px]">
            {!page.hasVisibleContent ? (
              <span className="px-4 text-center text-xs text-muted-foreground">
                Não encontrei conteúdo visível nesta página.
              </span>
            ) : signatureImage ? (
              <img
                src={signatureImage}
                alt="Pré-visualização da assinatura extraída do PDF"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Preparando assinatura…
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {page.pageCount > 1 ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={isLoading || pageNumber <= 1}
                  onClick={() => changePage(pageNumber - 1)}
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-20 text-center">Página {pageNumber} de {page.pageCount}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={isLoading || pageNumber >= page.pageCount}
                  onClick={() => changePage(pageNumber + 1)}
                  aria-label="Próxima página"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                {page.hasVisibleContent ? "Recorte automático aplicado" : "Sem conteúdo detectado"}
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!page.hasVisibleContent}
              onClick={() => setIsEditingCrop((value) => !value)}
            >
              <Crop className="h-4 w-4" />
              {isEditingCrop ? "Fechar recorte" : "Ajustar recorte"}
            </Button>
          </div>

          {isEditingCrop && (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Arraste sobre a assinatura para escolher a área que será usada.
                </p>
                <Button type="button" size="sm" variant="ghost" onClick={resetCrop}>
                  <RotateCcw className="h-3.5 w-3.5" /> Recorte automático
                </Button>
              </div>
              <div
                className={`relative mx-auto max-w-full touch-none select-none overflow-hidden rounded-md border bg-white ${
                  isEditingCrop ? "cursor-crosshair" : ""
                }`}
                style={{
                  width: `min(100%, ${stageMaxWidth}px)`,
                  aspectRatio: `${page.width} / ${page.height}`,
                }}
                onPointerDown={startCrop}
                onPointerMove={moveCrop}
                onPointerUp={finishCrop}
                onPointerCancel={finishCrop}
              >
                <img
                  src={page.imageUrl}
                  alt={`Página ${pageNumber} do PDF`}
                  draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
                {visibleCrop && (
                  <div
                    className="pointer-events-none absolute border-2 border-primary bg-primary/10"
                    style={{
                      left: `${visibleCrop.x * 100}%`,
                      top: `${visibleCrop.y * 100}%`,
                      width: `${visibleCrop.width * 100}%`,
                      height: `${visibleCrop.height * 100}%`,
                    }}
                  />
                )}
              </div>
              <Button type="button" size="sm" className="w-full" onClick={() => setIsEditingCrop(false)}>
                <Check className="h-4 w-4" /> Concluir recorte
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="pdf-signature-size" className="text-sm font-medium">
                Tamanho da assinatura
              </label>
              <span className="min-w-12 text-right text-xs tabular-nums text-muted-foreground">{scale}%</span>
            </div>
            <input
              id="pdf-signature-size"
              type="range"
              min="50"
              max="150"
              step="5"
              value={scale}
              onChange={(event) => setScale(Number(event.currentTarget.value))}
              disabled={!page.hasVisibleContent}
              className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Redimensionar assinatura"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Menor</span>
              <span>Maior</span>
            </div>
            <p className="text-xs text-muted-foreground">
              O tamanho já vem ajustado. Use o controle se quiser que ela apareça maior ou menor no termo.
            </p>
            {isGenerating && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Atualizando pré-visualização…
              </p>
            )}
          </div>
        </>
      )}

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
