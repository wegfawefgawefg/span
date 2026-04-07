import { ref, type Ref } from 'vue';
import {
  zoom,
  currentSheet,
  paintPixelSelection,
  hasPaintClipboard,
  recordPaintUndoSnapshot,
  statusText,
} from '../state';

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

export function usePixelSelection(deps: {
  sampleCanvas: HTMLCanvasElement;
  sampleCtx: CanvasRenderingContext2D;
  floatingSelectionCanvas: HTMLCanvasElement;
  isPaintableCurrentSheet: Ref<boolean>;
  renderDisplayCanvas: () => void;
  commitSampleCanvasEdit: (message: string) => void;
}) {
  const {
    sampleCanvas,
    sampleCtx,
    floatingSelectionCanvas,
    isPaintableCurrentSheet,
    renderDisplayCanvas,
    commitSampleCanvasEdit,
  } = deps;

  const pixelSelectionDrag = ref<PixelSelectionDragState | null>(null);
  const pixelSelectionMove = ref<PixelSelectionMoveState | null>(null);
  let pixelClipboard: PixelClipboardState | null = null;

  function normalizePixelSelectionRect(
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

  function pastePixelClipboard(): boolean {
    const sheet = currentSheet.value;
    if (!pixelClipboard || !sheet || !isPaintableCurrentSheet.value)
      return false;
    const maxX = Math.max(0, sampleCanvas.width - pixelClipboard.width);
    const maxY = Math.max(0, sampleCanvas.height - pixelClipboard.height);
    const targetX = Math.max(
      0,
      Math.min(paintPixelSelection.value?.x ?? pixelClipboard.sourceX, maxX)
    );
    const targetY = Math.max(
      0,
      Math.min(paintPixelSelection.value?.y ?? pixelClipboard.sourceY, maxY)
    );
    recordPaintUndoSnapshot(sheet);
    sampleCtx.putImageData(pixelClipboard.imageData, targetX, targetY);
    paintPixelSelection.value = {
      x: targetX,
      y: targetY,
      w: pixelClipboard.width,
      h: pixelClipboard.height,
    };
    commitSampleCanvasEdit('Image edits pending save');
    statusText.value = `${sheet.path} • Pasted ${pixelClipboard.width}x${pixelClipboard.height} pixels`;
    return true;
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
      ? normalizePixelSelectionRect(
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
    hasPaintClipboard.value = false;
  }

  return {
    pixelSelectionDrag,
    pixelSelectionMove,
    normalizePixelSelectionRect,
    pointInRect,
    selectionStyle,
    copyPixelSelectionToClipboard,
    cutPixelSelectionToClipboard,
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
