import { ref, type Ref } from 'vue';
import {
  zoom,
  currentSheet,
  applyPaintedSheetImage,
  recordPaintUndoSnapshot,
  statusText,
} from '../state';
import { setPaintPalette } from '../state/paletteState';
import { activePaintColor, paintToolSize } from '../state/toolState';

interface PaintStrokeState {
  lastX: number;
  lastY: number;
}

export function useCanvasPaint(deps: {
  stage: Ref<HTMLElement | null>;
  sampleCanvas: HTMLCanvasElement;
  sampleCtx: CanvasRenderingContext2D;
  imageWidth: Ref<number>;
  imageHeight: Ref<number>;
  renderDisplayCanvas: () => void;
}) {
  const { stage, sampleCanvas, sampleCtx, imageWidth, imageHeight, renderDisplayCanvas } = deps;

  const paintStroke = ref<PaintStrokeState | null>(null);

  function samplePixelAt(clientX: number, clientY: number): string | null {
    const stageEl = stage.value;
    if (!stageEl || !sampleCanvas.width) return null;
    const rect = stageEl.getBoundingClientRect();
    const imgX = Math.floor((clientX - rect.left) / zoom.value);
    const imgY = Math.floor((clientY - rect.top) / zoom.value);
    if (
      imgX < 0 ||
      imgY < 0 ||
      imgX >= imageWidth.value ||
      imgY >= imageHeight.value
    )
      return null;
    const pixel = sampleCtx.getImageData(imgX, imgY, 1, 1).data;
    const hex =
      '#' +
      [pixel[0], pixel[1], pixel[2]]
        .map((c) => c.toString(16).padStart(2, '0'))
        .join('');
    return hex;
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const normalized = hex.trim().toLowerCase();
    const match = normalized.match(/^#?([0-9a-f]{6})$/i);
    if (!match) return null;
    const value = match[1];
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }

  function stampPaintPixel(x: number, y: number, erase: boolean) {
    if (!sampleCanvas.width || !sampleCanvas.height) return;
    const half = Math.floor(
      Math.max(1, Math.round(paintToolSize.value || 1)) / 2
    );
    const size = Math.max(1, Math.round(paintToolSize.value || 1));
    if (erase) {
      sampleCtx.clearRect(x - half, y - half, size, size);
      return;
    }
    const rgb = hexToRgb(activePaintColor.value);
    if (!rgb) return;
    sampleCtx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
    sampleCtx.fillRect(x - half, y - half, size, size);
  }

  function drawPaintLine(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    erase: boolean
  ) {
    let x0 = fromX;
    let y0 = fromY;
    const x1 = toX;
    const y1 = toY;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      stampPaintPixel(x0, y0, erase);
      if (x0 === x1 && y0 === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  function currentSheetMimeType(): string {
    const path = (
      currentSheet.value?.absolutePath ||
      currentSheet.value?.path ||
      ''
    ).toLowerCase();
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
    if (path.endsWith('.webp')) return 'image/webp';
    return 'image/png';
  }

  function rebuildPaintPalette() {
    if (!sampleCanvas.width || !sampleCanvas.height) {
      setPaintPalette([]);
      return;
    }

    const { data } = sampleCtx.getImageData(
      0,
      0,
      sampleCanvas.width,
      sampleCanvas.height
    );
    const counts = new Map<string, number>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 32) continue;
      const hex =
        '#' +
        [data[i], data[i + 1], data[i + 2]]
          .map((c) => c.toString(16).padStart(2, '0'))
          .join('');
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }

    const colors = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([hex]) => hex);

    setPaintPalette(colors);
  }

  function commitSampleCanvasEdit(message: string) {
    const sheet = currentSheet.value;
    if (!sheet) return;
    const dataUrl = sampleCanvas.toDataURL(currentSheetMimeType());
    applyPaintedSheetImage(
      sheet,
      dataUrl,
      sampleCanvas.width,
      sampleCanvas.height
    );
    rebuildPaintPalette();
    renderDisplayCanvas();
    statusText.value = `${sheet.path} • ${message}`;
  }

  function commitPaintStroke() {
    const stroke = paintStroke.value;
    paintStroke.value = null;
    if (!stroke || !currentSheet.value) return;
    commitSampleCanvasEdit('Image edits pending save');
  }

  return {
    paintStroke,
    samplePixelAt,
    stampPaintPixel,
    drawPaintLine,
    rebuildPaintPalette,
    commitSampleCanvasEdit,
    commitPaintStroke,
  };
}
