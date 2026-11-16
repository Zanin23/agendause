export type NormalizedCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RenderedPdfPage = {
  imageUrl: string;
  pageNumber: number;
  pageCount: number;
  width: number;
  height: number;
  hasVisibleContent: boolean;
  autoCrop: NormalizedCrop;
};

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_RENDER_SIDE = 1800;
const SIGNATURE_CANVAS_WIDTH = 1200;
const SIGNATURE_CANVAS_HEIGHT = 400;

/** Renderiza uma página do PDF e sugere um recorte automático do conteúdo visível. */
export async function renderPdfPage(file: File, pageNumber: number): Promise<RenderedPdfPage> {
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    throw new Error("Selecione um arquivo PDF.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("O PDF deve ter no máximo 15 MB.");
  }
  if (file.size === 0) {
    throw new Error("O arquivo PDF está vazio.");
  }

  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;

  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;

  try {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new Error("Não foi possível abrir essa página do PDF.");
    }

    const page = await pdf.getPage(pageNumber);
    const originalViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_RENDER_SIDE / Math.max(originalViewport.width, originalViewport.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Não foi possível abrir a página do PDF.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      background: "rgb(255, 255, 255)",
    }).promise;

    const detectedContent = findContentBounds(canvas, context);
    const autoCrop = detectedContent.crop ?? { x: 0, y: 0, width: 1, height: 1 };
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Não foi possível preparar a página do PDF."));
      }, "image/png");
    });

    const result: RenderedPdfPage = {
      imageUrl: URL.createObjectURL(blob),
      pageNumber,
      pageCount: pdf.numPages,
      width: canvas.width,
      height: canvas.height,
      hasVisibleContent: detectedContent.found,
      autoCrop,
    };
    canvas.width = 0;
    canvas.height = 0;
    return result;
  } finally {
    await pdf.destroy();
  }
}

/** Produz uma imagem PNG com proporção fixa para que o ajuste de tamanho seja preservado no termo. */
export async function createPdfSignatureImage(
  pageUrl: string,
  crop: NormalizedCrop,
  scalePercent: number,
): Promise<string> {
  const image = await loadImage(pageUrl);
  const sourceX = Math.round(clamp(crop.x, 0, 1) * image.naturalWidth);
  const sourceY = Math.round(clamp(crop.y, 0, 1) * image.naturalHeight);
  const sourceWidth = Math.max(1, Math.round(clamp(crop.width, 0, 1) * image.naturalWidth));
  const sourceHeight = Math.max(1, Math.round(clamp(crop.height, 0, 1) * image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = SIGNATURE_CANVAS_WIDTH;
  canvas.height = SIGNATURE_CANVAS_HEIGHT;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a imagem da assinatura.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  // Em 100%, o recorte já cabe no campo. A margem restante permite aumentar ou reduzir
  // o conteúdo sem cortar a assinatura nem alterar a proporção do arquivo final.
  const baseScale = Math.min(
    (canvas.width * 0.64) / sourceWidth,
    (canvas.height * 0.56) / sourceHeight,
  );
  const scale = clamp(scalePercent, 50, 150) / 100;
  const drawWidth = sourceWidth * baseScale * scale;
  const drawHeight = sourceHeight * baseScale * scale;
  const drawX = (canvas.width - drawWidth) / 2;
  const drawY = (canvas.height - drawHeight) / 2;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );

  const signature = canvas.toDataURL("image/png");
  canvas.width = 0;
  canvas.height = 0;
  return signature;
}

function findContentBounds(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
): { crop: NormalizedCrop | null; found: boolean } {
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const darkestChannel = Math.min(red, green, blue);
      const colorSpread = Math.max(red, green, blue) - darkestChannel;
      const hasVisibleContent = pixels[offset + 3] > 12 && (darkestChannel < 247 || colorSpread > 20);

      if (hasVisibleContent) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return { crop: null, found: false };

  const contentWidth = maxX - minX + 1;
  const contentHeight = maxY - minY + 1;
  const paddingX = Math.max(12, Math.round(contentWidth * 0.06));
  const paddingY = Math.max(12, Math.round(contentHeight * 0.08));
  const left = Math.max(0, minX - paddingX);
  const top = Math.max(0, minY - paddingY);
  const right = Math.min(width, maxX + 1 + paddingX);
  const bottom = Math.min(height, maxY + 1 + paddingY);

  return {
    found: true,
    crop: {
      x: left / width,
      y: top / height,
      width: (right - left) / width,
      height: (bottom - top) / height,
    },
  };
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível preparar a imagem da assinatura."));
    image.src = source;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
