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
    ctx.putImageData(imageData, 0, 0);
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
    sampleCtx.putImageData(clipboard.imageData, targetX, targetY);
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
    paintPixelSelection.value = null;
  }

  function finalizeFloatingSelection(options?: {
    apply?: boolean;
    clearSelection?: boolean;
    sheet?: typeof currentSheet.value;
  }) {
    const move = pixelSelectionMove.value;
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
      move.currentRect.y === move.sourceRect.y;

    if (apply && sheet && !sameSpot) {
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

    pixelSelectionMove.value = null;
    if (clearSelectionAfter) {
      paintPixelSelection.value = null;
    } else {
      paintPixelSelection.value = { ...move.currentRect };
    }
    renderDisplayCanvas();
    return apply && !!sheet && !sameSpot;
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

  function resetClipboard() {
    pixelClipboard = null;
    lastWrittenClipboardImageSignature = null;
    preferInternalClipboard = false;
    hasPaintClipboard.value = false;
  }

  return {
    pixelSelectionDrag,
    pixelSelectionMove,
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
    resetClipboard,
  };
}
