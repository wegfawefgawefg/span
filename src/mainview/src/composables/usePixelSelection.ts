import { ref, type Ref } from 'vue';
import {
  zoom,
  currentSheet,
  paintPixelSelection,
  hasPaintClipboard,
  statusText,
} from '../state';
import { recordPaintUndoSnapshot } from '../state/paintHistory';

export interface PixelSelectionDragState {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
}

export interface PixelClipboardState {
  width: number;
  height: number;
  sourceX: number;
  sourceY: number;
  imageData: ImageData;
}

export interface PixelSelectionMoveState {
  pointerOriginX: number;
  pointerOriginY: number;
  sourceRect: { x: number; y: number; w: number; h: number };
  dragStartRect: { x: number; y: number; w: number; h: number };
  currentRect: { x: number; y: number; w: number; h: number };
  imageData: ImageData;
  dragging: boolean;
  modified: boolean;
}

export interface PixelSelectionRotateState {
  awaitingPivot: boolean;
  dragging: boolean;
  pivot: { x: number; y: number };
  originalRect: { x: number; y: number; w: number; h: number };
  originalImageData: ImageData;
  originalModified: boolean;
  startPointerAngle: number;
  baseAngleDeg: number;
  angleDeg: number;
}

export function normalizePixelSelectionRect(
  sampleCanvas: HTMLCanvasElement,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): { x: number; y: number; w: number; h: number } | null {
  if (!sampleCanvas.width || !sampleCanvas.height) return null;

  const minX = Math.max(0, Math.min(x0, x1));
  const minY = Math.max(0, Math.min(y0, y1));
  const maxX = Math.min(sampleCanvas.width - 1, Math.max(x0, x1));
  const maxY = Math.min(sampleCanvas.height - 1, Math.max(y0, y1));

  if (maxX < minX || maxY < minY) return null;

  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
}

export function usePixelSelection(deps: {
  sampleCanvas: HTMLCanvasElement;
  sampleCtx: CanvasRenderingContext2D;
  floatingSelectionCanvas: HTMLCanvasElement;
  isPaintableCurrentSheet: Ref<boolean>;
  renderDisplayCanvas: () => void;
  commitSampleCanvasEdit: (message: string) => void;
  readExternalClipboardImageDataUrl: () => Promise<string | null>;
  writeExternalClipboardImageDataUrl: (
    dataUrl: string
  ) => Promise<{ ok: boolean }>;
  getDefaultPasteOrigin: (
    width: number,
    height: number
  ) => { x: number; y: number };
}) {
  const {
    sampleCanvas,
    sampleCtx,
    floatingSelectionCanvas,
    isPaintableCurrentSheet,
    renderDisplayCanvas,
    commitSampleCanvasEdit,
    readExternalClipboardImageDataUrl,
    writeExternalClipboardImageDataUrl,
    getDefaultPasteOrigin,
  } = deps;

  const pixelSelectionDrag = ref<PixelSelectionDragState | null>(null);
  const pixelSelectionMove = ref<PixelSelectionMoveState | null>(null);
  const pixelSelectionRotate = ref<PixelSelectionRotateState | null>(null);
  let pixelClipboard: PixelClipboardState | null = null;
  let lastWrittenClipboardImageSignature: string | null = null;
  let preferInternalClipboard = false;

  function normalizeRect(
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): { x: number; y: number; w: number; h: number } | null {
    return normalizePixelSelectionRect(sampleCanvas, x0, y0, x1, y1);
  }

  function pointInRect(
    point: { x: number; y: number },
    rect: { x: number; y: number; w: number; h: number } | null
  ) {
    return (
      !!rect &&
      point.x >= rect.x &&
      point.y >= rect.y &&
      point.x < rect.x + rect.w &&
      point.y < rect.y + rect.h
    );
  }

  function clampSelectionTarget(
    rect: { x: number; y: number; w: number; h: number },
    x: number,
    y: number
  ) {
    return {
      x: Math.max(0, Math.min(x, Math.max(0, sampleCanvas.width - rect.w))),
      y: Math.max(0, Math.min(y, Math.max(0, sampleCanvas.height - rect.h))),
      w: rect.w,
      h: rect.h,
    };
  }

  function selectionStyle(
    rect: { x: number; y: number; w: number; h: number } | null
  ) {
    if (!rect) return {};
    return {
      left: `${rect.x * zoom.value}px`,
      top: `${rect.y * zoom.value}px`,
      width: `${rect.w * zoom.value}px`,
      height: `${rect.h * zoom.value}px`,
    };
  }

  function paintFloatingSelectionCanvas(imageData: ImageData) {
    floatingSelectionCanvas.width = imageData.width;
    floatingSelectionCanvas.height = imageData.height;
    const ctx = floatingSelectionCanvas.getContext('2d', {
      willReadFrequently: true,
    });
    if (!ctx) return;
    ctx.clearRect(0, 0, imageData.width, imageData.height);
    ctx.putImageData(imageData, 0, 0);
  }

  function cloneImageData(imageData: ImageData): ImageData {
    return new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );
  }

  function imageDataToPngDataUrl(imageData: ImageData): string {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create canvas for clipboard write');
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  function imageDataSignature(imageData: ImageData): string {
    let hash = 2166136261;
    const bytes = imageData.data;
    for (let i = 0; i < bytes.length; i += 1) {
      hash ^= bytes[i]!;
      hash = Math.imul(hash, 16777619);
    }
    return `${imageData.width}x${imageData.height}:${hash >>> 0}`;
  }

  function ensureFloatingSelection(): PixelSelectionMoveState | null {
    if (pixelSelectionMove.value) return pixelSelectionMove.value;
    const rect = paintPixelSelection.value;
    if (!rect) return null;
    const imageData = sampleCtx.getImageData(rect.x, rect.y, rect.w, rect.h);
    paintFloatingSelectionCanvas(imageData);
    pixelSelectionMove.value = {
      pointerOriginX: rect.x,
      pointerOriginY: rect.y,
      sourceRect: { ...rect },
      dragStartRect: { ...rect },
      currentRect: { ...rect },
      imageData,
      dragging: false,
      modified: false,
    };
    renderDisplayCanvas();
    return pixelSelectionMove.value;
  }

  function setFloatingSelection(
    imageData: ImageData,
    rect: { x: number; y: number; w: number; h: number },
    options?: { preserveSourceRect?: boolean; modified?: boolean }
  ) {
    const existing = ensureFloatingSelection();
    if (!existing) return false;
    const nextSourceRect = options?.preserveSourceRect
      ? existing.sourceRect
      : { ...rect };
    pixelSelectionMove.value = {
      ...existing,
      sourceRect: nextSourceRect,
      dragStartRect: { ...rect },
      currentRect: { ...rect },
      imageData,
      dragging: false,
      modified: options?.modified ?? existing.modified,
    };
    paintFloatingSelectionCanvas(imageData);
    paintPixelSelection.value = { ...rect };
    renderDisplayCanvas();
    return true;
  }

  function flipImageDataHorizontal(imageData: ImageData): ImageData {
    const result = new ImageData(imageData.width, imageData.height);
    const src = imageData.data;
    const dst = result.data;
    for (let y = 0; y < imageData.height; y += 1) {
      for (let x = 0; x < imageData.width; x += 1) {
        const srcOffset = (y * imageData.width + x) * 4;
        const dstOffset =
          (y * imageData.width + (imageData.width - 1 - x)) * 4;
        dst[dstOffset] = src[srcOffset]!;
        dst[dstOffset + 1] = src[srcOffset + 1]!;
        dst[dstOffset + 2] = src[srcOffset + 2]!;
        dst[dstOffset + 3] = src[srcOffset + 3]!;
      }
    }
    return result;
  }

  function flipImageDataVertical(imageData: ImageData): ImageData {
    const result = new ImageData(imageData.width, imageData.height);
    const src = imageData.data;
    const dst = result.data;
    for (let y = 0; y < imageData.height; y += 1) {
      for (let x = 0; x < imageData.width; x += 1) {
        const srcOffset = (y * imageData.width + x) * 4;
        const dstOffset =
          ((imageData.height - 1 - y) * imageData.width + x) * 4;
        dst[dstOffset] = src[srcOffset]!;
        dst[dstOffset + 1] = src[srcOffset + 1]!;
        dst[dstOffset + 2] = src[srcOffset + 2]!;
        dst[dstOffset + 3] = src[srcOffset + 3]!;
      }
    }
    return result;
  }

  function rotatedSelectionBounds(
    rect: { x: number; y: number; w: number; h: number },
    pivot: { x: number; y: number },
    angleRad: number
  ) {
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x, y: rect.y + rect.h },
      { x: rect.x + rect.w, y: rect.y + rect.h },
    ];
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const rotated = corners.map((corner) => {
      const dx = corner.x - pivot.x;
      const dy = corner.y - pivot.y;
      return {
        x: pivot.x + dx * cos - dy * sin,
        y: pivot.y + dx * sin + dy * cos,
      };
    });
    const minX = Math.min(...rotated.map((corner) => corner.x));
    const minY = Math.min(...rotated.map((corner) => corner.y));
    const maxX = Math.max(...rotated.map((corner) => corner.x));
    const maxY = Math.max(...rotated.map((corner) => corner.y));
    return {
      x: Math.floor(minX),
      y: Math.floor(minY),
      w: Math.max(1, Math.ceil(maxX) - Math.floor(minX)),
      h: Math.max(1, Math.ceil(maxY) - Math.floor(minY)),
    };
  }

  function rasterizeRotatedImageData(
    imageData: ImageData,
    rect: { x: number; y: number; w: number; h: number },
    pivot: { x: number; y: number },
    angleDeg: number
  ) {
    const angleRad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const bounds = rotatedSelectionBounds(rect, pivot, angleRad);
    const output = new ImageData(bounds.w, bounds.h);
    const src = imageData.data;
    const dst = output.data;

    for (let y = 0; y < bounds.h; y += 1) {
      for (let x = 0; x < bounds.w; x += 1) {
        const destCenterX = bounds.x + x + 0.5;
        const destCenterY = bounds.y + y + 0.5;
        const dx = destCenterX - pivot.x;
        const dy = destCenterY - pivot.y;
        const sourceCenterX = pivot.x + dx * cos + dy * sin;
        const sourceCenterY = pivot.y - dx * sin + dy * cos;
        const sourceX = Math.round(sourceCenterX - rect.x - 0.5);
        const sourceY = Math.round(sourceCenterY - rect.y - 0.5);
        if (
          sourceX < 0 ||
          sourceY < 0 ||
          sourceX >= imageData.width ||
          sourceY >= imageData.height
        ) {
          continue;
        }
        const srcOffset = (sourceY * imageData.width + sourceX) * 4;
        const dstOffset = (y * bounds.w + x) * 4;
        dst[dstOffset] = src[srcOffset]!;
        dst[dstOffset + 1] = src[srcOffset + 1]!;
        dst[dstOffset + 2] = src[srcOffset + 2]!;
        dst[dstOffset + 3] = src[srcOffset + 3]!;
      }
    }

    return { imageData: output, rect: bounds };
  }

  function applyRotatePreview(angleDeg: number) {
    const rotate = pixelSelectionRotate.value;
    const move = pixelSelectionMove.value;
    if (!rotate || !move) return false;
    const preview = rasterizeRotatedImageData(
      rotate.originalImageData,
      rotate.originalRect,
      rotate.pivot,
      angleDeg
    );
    pixelSelectionRotate.value = {
      ...rotate,
      angleDeg,
    };
    setFloatingSelection(preview.imageData, preview.rect, {
      preserveSourceRect: true,
      modified: true,
    });
    statusText.value = `Rotate ${Math.round(angleDeg * 10) / 10}°`;
    return true;
  }

  function copyPixelSelectionToClipboard(): boolean {
    const floating = pixelSelectionMove.value;
    const rect = floating?.currentRect ?? paintPixelSelection.value;
    if (!rect || !sampleCanvas.width) return false;
    const imageData =
      floating?.imageData ??
      sampleCtx.getImageData(rect.x, rect.y, rect.w, rect.h);
    pixelClipboard = {
      width: rect.w,
      height: rect.h,
      sourceX: rect.x,
      sourceY: rect.y,
      imageData,
    };
    hasPaintClipboard.value = true;
    const dataUrl = imageDataToPngDataUrl(imageData);
    lastWrittenClipboardImageSignature = imageDataSignature(imageData);
    preferInternalClipboard = true;
    void writeExternalClipboardImageDataUrl(dataUrl);
    statusText.value = `Copied ${rect.w}x${rect.h} pixels`;
    return true;
  }

  function deletePixelSelectionPixels(options?: {
    keepSelection?: boolean;
  }): boolean {
    const rect = paintPixelSelection.value;
    const sheet = currentSheet.value;
    if (!rect || !sheet || !isPaintableCurrentSheet.value) return false;
    recordPaintUndoSnapshot(sheet);
    sampleCtx.clearRect(rect.x, rect.y, rect.w, rect.h);
    if (!options?.keepSelection) {
      paintPixelSelection.value = null;
    }
    commitSampleCanvasEdit('Image edits pending save');
    return true;
  }

  function cutPixelSelectionToClipboard(): boolean {
    if (!copyPixelSelectionToClipboard()) return false;
    return deletePixelSelectionPixels({ keepSelection: true });
  }

  async function imageDataFromDataUrl(dataUrl: string): Promise<ImageData | null> {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to decode clipboard image'));
      img.src = dataUrl;
    });
    if (!img.naturalWidth || !img.naturalHeight) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  async function readExternalClipboard(): Promise<{
    source: 'external' | 'internal';
    clipboard: PixelClipboardState;
  } | null> {
    if (preferInternalClipboard && pixelClipboard) {
      const dataUrl = await readExternalClipboardImageDataUrl();
      if (!dataUrl) {
        return { source: 'internal', clipboard: pixelClipboard };
      }
      const imageData = await imageDataFromDataUrl(dataUrl);
      if (!imageData) {
        return { source: 'internal', clipboard: pixelClipboard };
      }
      const externalSignature = imageDataSignature(imageData);
      if (
        lastWrittenClipboardImageSignature &&
        externalSignature === lastWrittenClipboardImageSignature
      ) {
        return { source: 'internal', clipboard: pixelClipboard };
      }
      if (
        imageData.width === pixelClipboard.width &&
        imageData.height === pixelClipboard.height
      ) {
        const bytes = imageData.data;
        const internalBytes = pixelClipboard.imageData.data;
        let identical = true;
        for (let i = 0; i < bytes.length; i += 1) {
          if (bytes[i] !== internalBytes[i]) {
            identical = false;
            break;
          }
        }
        if (identical) {
          lastWrittenClipboardImageSignature = externalSignature;
          return { source: 'internal', clipboard: pixelClipboard };
        }
      }
      preferInternalClipboard = false;
      const origin = getDefaultPasteOrigin(imageData.width, imageData.height);
      statusText.value = `Loaded ${imageData.width}x${imageData.height} clipboard image`;
      return {
        source: 'external',
        clipboard: {
          width: imageData.width,
          height: imageData.height,
          sourceX: origin.x,
          sourceY: origin.y,
          imageData,
        },
      };
    }

    const dataUrl = await readExternalClipboardImageDataUrl();
    if (!dataUrl) {
      return pixelClipboard
        ? { source: 'internal', clipboard: pixelClipboard }
        : null;
    }
    const imageData = await imageDataFromDataUrl(dataUrl);
    if (!imageData) {
      return pixelClipboard
        ? { source: 'internal', clipboard: pixelClipboard }
        : null;
    }
    if (pixelClipboard && lastWrittenClipboardImageSignature) {
      const externalSignature = imageDataSignature(imageData);
      if (externalSignature === lastWrittenClipboardImageSignature) {
        preferInternalClipboard = true;
        return { source: 'internal', clipboard: pixelClipboard };
      }
    }
    if (
      pixelClipboard &&
      imageData.width === pixelClipboard.width &&
      imageData.height === pixelClipboard.height
    ) {
      const bytes = imageData.data;
      const internalBytes = pixelClipboard.imageData.data;
      let identical = true;
      for (let i = 0; i < bytes.length; i += 1) {
        if (bytes[i] !== internalBytes[i]) {
          identical = false;
          break;
        }
      }
      if (identical) {
        lastWrittenClipboardImageSignature = imageDataSignature(imageData);
        preferInternalClipboard = true;
        return { source: 'internal', clipboard: pixelClipboard };
      }
    }
    preferInternalClipboard = false;
    const origin = getDefaultPasteOrigin(imageData.width, imageData.height);
    statusText.value = `Loaded ${imageData.width}x${imageData.height} clipboard image`;
    return {
      source: 'external',
      clipboard: {
        width: imageData.width,
        height: imageData.height,
        sourceX: origin.x,
        sourceY: origin.y,
        imageData,
      },
    };
  }

  function pasteClipboard(
    clipboard: PixelClipboardState,
    source: 'external' | 'internal'
  ): boolean {
    const sheet = currentSheet.value;
    if (!sheet || !isPaintableCurrentSheet.value) {
      return false;
    }
    const maxX = Math.max(0, sampleCanvas.width - clipboard.width);
    const maxY = Math.max(0, sampleCanvas.height - clipboard.height);
    const defaultOrigin = getDefaultPasteOrigin(clipboard.width, clipboard.height);
    const selection = paintPixelSelection.value;
    const pastingCopiedSelectionBackInPlace =
      source === 'internal' &&
      !!selection &&
      selection.x === clipboard.sourceX &&
      selection.y === clipboard.sourceY &&
      selection.w === clipboard.width &&
      selection.h === clipboard.height;
    const targetX = Math.max(
      0,
      Math.min(
        pastingCopiedSelectionBackInPlace
          ? defaultOrigin.x
          : selection?.x ?? clipboard.sourceX,
        maxX
      )
    );
    const targetY = Math.max(
      0,
      Math.min(
        pastingCopiedSelectionBackInPlace
          ? defaultOrigin.y
          : selection?.y ?? clipboard.sourceY,
        maxY
      )
    );
    recordPaintUndoSnapshot(sheet);
    const pasteCanvas = document.createElement('canvas');
    pasteCanvas.width = clipboard.width;
    pasteCanvas.height = clipboard.height;
    const pasteCtx = pasteCanvas.getContext('2d', { willReadFrequently: true });
    if (!pasteCtx) {
      statusText.value = 'Paste failed';
      return false;
    }
    pasteCtx.putImageData(clipboard.imageData, 0, 0);
    sampleCtx.save();
    sampleCtx.imageSmoothingEnabled = false;
    sampleCtx.globalCompositeOperation = 'source-over';
    sampleCtx.drawImage(pasteCanvas, targetX, targetY);
    sampleCtx.restore();
    paintPixelSelection.value = {
      x: targetX,
      y: targetY,
      w: clipboard.width,
      h: clipboard.height,
    };
    commitSampleCanvasEdit('Image edits pending save');
    statusText.value = `${sheet.path} • Pasted ${clipboard.width}x${clipboard.height} pixels`;
    return true;
  }

  function pasteInternalPixelClipboard(): boolean {
    if (!pixelClipboard) {
      return false;
    }
    return pasteClipboard(pixelClipboard, 'internal');
  }

  async function pasteExternalPixelClipboard(): Promise<boolean> {
    const clipboardState = await readExternalClipboard();
    if (!clipboardState || clipboardState.source !== 'external') {
      return false;
    }
    return pasteClipboard(clipboardState.clipboard, 'external');
  }

  async function pastePixelClipboard(): Promise<boolean> {
    const clipboardState = await readExternalClipboard();
    if (!clipboardState) {
      return false;
    }
    return pasteClipboard(clipboardState.clipboard, clipboardState.source);
  }

  function clearPixelSelection() {
    pixelSelectionDrag.value = null;
    pixelSelectionMove.value = null;
    pixelSelectionRotate.value = null;
    paintPixelSelection.value = null;
  }

  function finalizeFloatingSelection(options?: {
    apply?: boolean;
    clearSelection?: boolean;
    sheet?: typeof currentSheet.value;
  }) {
    const move = pixelSelectionMove.value;
    const rotate = pixelSelectionRotate.value;
    const sheet = options?.sheet ?? currentSheet.value;
    const apply = options?.apply ?? false;
    const clearSelectionAfter = options?.clearSelection ?? false;

    if (!move) {
      if (clearSelectionAfter) {
        clearPixelSelection();
      }
      return false;
    }

    const sameSpot =
      move.currentRect.x === move.sourceRect.x &&
      move.currentRect.y === move.sourceRect.y &&
      move.currentRect.w === move.sourceRect.w &&
      move.currentRect.h === move.sourceRect.h;

    if (apply && sheet && (!sameSpot || move.modified)) {
      recordPaintUndoSnapshot(sheet);
      sampleCtx.clearRect(
        move.sourceRect.x,
        move.sourceRect.y,
        move.sourceRect.w,
        move.sourceRect.h
      );
      sampleCtx.putImageData(
        move.imageData,
        move.currentRect.x,
        move.currentRect.y
      );
      commitSampleCanvasEdit('Image edits pending save');
    }

    pixelSelectionRotate.value = null;
    pixelSelectionMove.value = null;
    if (clearSelectionAfter) {
      paintPixelSelection.value = null;
    } else {
      paintPixelSelection.value = { ...move.currentRect };
    }
    renderDisplayCanvas();
    return apply && !!sheet && (!sameSpot || move.modified || !!rotate);
  }

  function commitPixelSelectionMove(): boolean {
    const move = pixelSelectionMove.value;
    if (!move) {
      renderDisplayCanvas();
      return false;
    }
    paintPixelSelection.value = { ...move.currentRect };
    pixelSelectionMove.value = {
      ...move,
      dragging: false,
      dragStartRect: { ...move.currentRect },
    };
    renderDisplayCanvas();
    statusText.value = `Selection at ${move.currentRect.x},${move.currentRect.y}`;
    return false;
  }

  function commitPixelSelection() {
    const drag = pixelSelectionDrag.value;
    paintPixelSelection.value = drag
      ? normalizeRect(
          drag.originX,
          drag.originY,
          drag.currentX,
          drag.currentY
        )
      : null;
    pixelSelectionDrag.value = null;
    if (paintPixelSelection.value) {
      statusText.value = `Selected ${paintPixelSelection.value.w}x${paintPixelSelection.value.h} pixels`;
    }
  }

  function beginPixelSelectionMove(point: { x: number; y: number }) {
    if (pixelSelectionRotate.value) return false;
    const existing = pixelSelectionMove.value;
    if (existing) {
      pixelSelectionMove.value = {
        ...existing,
        pointerOriginX: point.x,
        pointerOriginY: point.y,
        dragStartRect: { ...existing.currentRect },
        dragging: true,
      };
      return true;
    }
    const rect = paintPixelSelection.value;
    if (!rect) return false;
    const imageData = sampleCtx.getImageData(rect.x, rect.y, rect.w, rect.h);
    paintFloatingSelectionCanvas(imageData);
    pixelSelectionMove.value = {
      pointerOriginX: point.x,
      pointerOriginY: point.y,
      sourceRect: { ...rect },
      dragStartRect: { ...rect },
      currentRect: { ...rect },
      imageData,
      dragging: true,
      modified: false,
    };
    renderDisplayCanvas();
    return true;
  }

  function updatePixelSelectionMove(point: { x: number; y: number }) {
    const move = pixelSelectionMove.value;
    if (!move) return;
    const dx = point.x - move.pointerOriginX;
    const dy = point.y - move.pointerOriginY;
    pixelSelectionMove.value = {
      ...move,
      currentRect: clampSelectionTarget(
        move.dragStartRect,
        move.dragStartRect.x + dx,
        move.dragStartRect.y + dy
      ),
    };
    renderDisplayCanvas();
  }

  function nudgePixelSelection(dx: number, dy: number) {
    if (pixelSelectionRotate.value) return false;
    const current =
      pixelSelectionMove.value?.currentRect ?? paintPixelSelection.value;
    if (!current || !isPaintableCurrentSheet.value) return false;
    if (!pixelSelectionMove.value) {
      const imageData = sampleCtx.getImageData(
        current.x,
        current.y,
        current.w,
        current.h
      );
      paintFloatingSelectionCanvas(imageData);
      pixelSelectionMove.value = {
        pointerOriginX: current.x,
        pointerOriginY: current.y,
        sourceRect: { ...current },
        dragStartRect: { ...current },
        currentRect: { ...current },
        imageData,
        dragging: false,
        modified: false,
      };
    }
    const move = pixelSelectionMove.value!;
    const target = clampSelectionTarget(
      move.currentRect,
      move.currentRect.x + dx,
      move.currentRect.y + dy
    );
    if (target.x === move.currentRect.x && target.y === move.currentRect.y)
      return false;
    pixelSelectionMove.value = {
      ...move,
      currentRect: target,
      dragStartRect: { ...target },
    };
    paintPixelSelection.value = target;
    renderDisplayCanvas();
    statusText.value = `Selection at ${target.x},${target.y}`;
    return true;
  }

  function flipSelectionHorizontal(): boolean {
    const move = ensureFloatingSelection();
    if (!move) return false;
    pixelSelectionRotate.value = null;
    const flipped = flipImageDataHorizontal(move.imageData);
    setFloatingSelection(flipped, move.currentRect, {
      preserveSourceRect: true,
      modified: true,
    });
    statusText.value = 'Flipped horizontally';
    return true;
  }

  function flipSelectionVertical(): boolean {
    const move = ensureFloatingSelection();
    if (!move) return false;
    pixelSelectionRotate.value = null;
    const flipped = flipImageDataVertical(move.imageData);
    setFloatingSelection(flipped, move.currentRect, {
      preserveSourceRect: true,
      modified: true,
    });
    statusText.value = 'Flipped vertically';
    return true;
  }

  function beginRotateSelection(): boolean {
    const move = ensureFloatingSelection();
    if (!move) return false;
    pixelSelectionRotate.value = {
      awaitingPivot: true,
      dragging: false,
      pivot: {
        x: move.currentRect.x + move.currentRect.w / 2,
        y: move.currentRect.y + move.currentRect.h / 2,
      },
      originalRect: { ...move.currentRect },
      originalImageData: cloneImageData(move.imageData),
      originalModified: move.modified,
      startPointerAngle: 0,
      baseAngleDeg: 0,
      angleDeg: 0,
    };
    paintPixelSelection.value = { ...move.currentRect };
    renderDisplayCanvas();
    statusText.value = 'Rotate mode: click to place pivot, then drag';
    return true;
  }

  function setRotatePivot(point: { x: number; y: number }) {
    if (!pixelSelectionRotate.value) return false;
    pixelSelectionRotate.value = {
      ...pixelSelectionRotate.value,
      pivot: { x: point.x, y: point.y },
      awaitingPivot: false,
    };
    renderDisplayCanvas();
    return true;
  }

  function startRotateDrag(point: { x: number; y: number }) {
    const rotate = pixelSelectionRotate.value;
    if (!rotate) return false;
    const pointerAngle = Math.atan2(point.y - rotate.pivot.y, point.x - rotate.pivot.x);
    pixelSelectionRotate.value = {
      ...rotate,
      dragging: true,
      startPointerAngle: pointerAngle,
      baseAngleDeg: rotate.angleDeg,
    };
    return true;
  }

  function updateRotateDrag(point: { x: number; y: number }, snap = false) {
    const rotate = pixelSelectionRotate.value;
    if (!rotate || !rotate.dragging) return false;
    const pointerAngle = Math.atan2(point.y - rotate.pivot.y, point.x - rotate.pivot.x);
    let delta = pointerAngle - rotate.startPointerAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    let angleDeg = rotate.baseAngleDeg + (delta * 180) / Math.PI;
    if (snap) {
      angleDeg = Math.round(angleDeg / 15) * 15;
    }
    return applyRotatePreview(angleDeg);
  }

  function endRotateDrag() {
    const rotate = pixelSelectionRotate.value;
    if (!rotate) return false;
    pixelSelectionRotate.value = {
      ...rotate,
      dragging: false,
      baseAngleDeg: rotate.angleDeg,
    };
    return true;
  }

  function commitRotateSelection(): boolean {
    if (!pixelSelectionRotate.value) return false;
    pixelSelectionRotate.value = null;
    return finalizeFloatingSelection({ apply: true, clearSelection: false });
  }

  function cancelRotateSelection(): boolean {
    const rotate = pixelSelectionRotate.value;
    const move = pixelSelectionMove.value;
    if (!rotate || !move) return false;
    pixelSelectionRotate.value = null;
    pixelSelectionMove.value = {
      ...move,
      currentRect: { ...rotate.originalRect },
      dragStartRect: { ...rotate.originalRect },
      imageData: cloneImageData(rotate.originalImageData),
      dragging: false,
      modified: rotate.originalModified,
    };
    paintFloatingSelectionCanvas(rotate.originalImageData);
    paintPixelSelection.value = { ...rotate.originalRect };
    renderDisplayCanvas();
    statusText.value = 'Rotate cancelled';
    return true;
  }

  function resetClipboard() {
    pixelClipboard = null;
    lastWrittenClipboardImageSignature = null;
    preferInternalClipboard = false;
    hasPaintClipboard.value = false;
  }

  return {
    pixelSelectionDrag,
    pixelSelectionMove,
    pixelSelectionRotate,
    normalizePixelSelectionRect: normalizeRect,
    pointInRect,
    selectionStyle,
    copyPixelSelectionToClipboard,
    cutPixelSelectionToClipboard,
    pasteInternalPixelClipboard,
    pasteExternalPixelClipboard,
    pastePixelClipboard,
    deletePixelSelectionPixels,
    clearPixelSelection,
    finalizeFloatingSelection,
    commitPixelSelectionMove,
    commitPixelSelection,
    beginPixelSelectionMove,
    updatePixelSelectionMove,
    nudgePixelSelection,
    flipSelectionHorizontal,
    flipSelectionVertical,
    beginRotateSelection,
    setRotatePivot,
    startRotateDrag,
    updateRotateDrag,
    endRotateDrag,
    commitRotateSelection,
    cancelRotateSelection,
    resetClipboard,
  };
}
