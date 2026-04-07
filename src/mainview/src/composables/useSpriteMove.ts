import { ref, computed, type Ref } from 'vue';
import type { Annotation } from '../annotation';
import {
  selectedId,
  annotations,
  currentSheet,
  recordPaintUndoSnapshot,
  statusText,
  markDirty,
} from '../state';
import { normalizePixelSelectionRect } from './usePixelSelection';

export interface SpriteMoveItem {
  annotationId: string;
  sourceRect: { x: number; y: number; w: number; h: number };
  dragStartRect: { x: number; y: number; w: number; h: number };
  currentRect: { x: number; y: number; w: number; h: number };
  imageData: ImageData;
  canvas: HTMLCanvasElement;
}

export interface SpriteMoveState {
  pointerOriginX: number;
  pointerOriginY: number;
  items: SpriteMoveItem[];
  groupBounds: { x: number; y: number; w: number; h: number };
  dragging: boolean;
}

export interface AtlasMoveSelectionDragState {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
}

function createImageDataCanvas(imageData: ImageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas;
}

function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export function useSpriteMove(deps: {
  sampleCanvas: HTMLCanvasElement;
  sampleCtx: CanvasRenderingContext2D;
  isPaintableCurrentSheet: Ref<boolean>;
  renderDisplayCanvas: () => void;
  commitSampleCanvasEdit: (message: string) => void;
}) {
  const {
    sampleCanvas,
    sampleCtx,
    isPaintableCurrentSheet,
    renderDisplayCanvas,
    commitSampleCanvasEdit,
  } = deps;

  const spriteMove = ref<SpriteMoveState | null>(null);
  const atlasMoveSelectionDrag = ref<AtlasMoveSelectionDragState | null>(null);
  const atlasMoveSelectionIds = ref<string[]>([]);

  const atlasSelectionPreviewRect = computed(() =>
    atlasMoveSelectionDrag.value
      ? normalizePixelSelectionRect(
          sampleCanvas,
          atlasMoveSelectionDrag.value.originX,
          atlasMoveSelectionDrag.value.originY,
          atlasMoveSelectionDrag.value.currentX,
          atlasMoveSelectionDrag.value.currentY
        )
      : null
  );

  function clampSpriteMoveTarget(
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

  function setAtlasSelection(ids: string[]) {
    atlasMoveSelectionIds.value = [...new Set(ids)];
    selectedId.value = atlasMoveSelectionIds.value[0] ?? null;
  }

  function beginSpriteMove(
    annotation: Annotation,
    point: { x: number; y: number }
  ) {
    if (!annotation.aabb || !isPaintableCurrentSheet.value) return false;
    const selectionIds = atlasMoveSelectionIds.value.includes(annotation.id)
      ? atlasMoveSelectionIds.value
      : [annotation.id];
    const selectedAnnotations = annotations.value.filter(
      (entry) => selectionIds.includes(entry.id) && !!entry.aabb
    );
    if (selectedAnnotations.length === 0) return false;
    const items = selectedAnnotations.map((entry) => {
      const rect = { ...entry.aabb! };
      const imageData = sampleCtx.getImageData(rect.x, rect.y, rect.w, rect.h);
      return {
        annotationId: entry.id,
        sourceRect: rect,
        dragStartRect: rect,
        currentRect: rect,
        imageData,
        canvas: createImageDataCanvas(imageData),
      };
    });
    const minX = Math.min(...items.map((item) => item.sourceRect.x));
    const minY = Math.min(...items.map((item) => item.sourceRect.y));
    const maxX = Math.max(
      ...items.map((item) => item.sourceRect.x + item.sourceRect.w)
    );
    const maxY = Math.max(
      ...items.map((item) => item.sourceRect.y + item.sourceRect.h)
    );
    spriteMove.value = {
      pointerOriginX: point.x,
      pointerOriginY: point.y,
      items,
      groupBounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      dragging: true,
    };
    setAtlasSelection(items.map((item) => item.annotationId));
    renderDisplayCanvas();
    return true;
  }

  function updateSpriteMove(point: { x: number; y: number }) {
    const move = spriteMove.value;
    if (!move) return;
    const rawDx = point.x - move.pointerOriginX;
    const rawDy = point.y - move.pointerOriginY;
    const dx = Math.max(
      -move.groupBounds.x,
      Math.min(
        rawDx,
        sampleCanvas.width - (move.groupBounds.x + move.groupBounds.w)
      )
    );
    const dy = Math.max(
      -move.groupBounds.y,
      Math.min(
        rawDy,
        sampleCanvas.height - (move.groupBounds.y + move.groupBounds.h)
      )
    );
    spriteMove.value = {
      ...move,
      items: move.items.map((item) => ({
        ...item,
        currentRect: clampSpriteMoveTarget(
          item.dragStartRect,
          item.dragStartRect.x + dx,
          item.dragStartRect.y + dy
        ),
      })),
    };
    renderDisplayCanvas();
  }

  function finalizeSpriteMove(options?: {
    apply?: boolean;
    sheet?: typeof currentSheet.value;
  }) {
    const move = spriteMove.value;
    const sheet = options?.sheet ?? currentSheet.value;
    const apply = options?.apply ?? false;

    if (!move) return false;

    const sameSpot = move.items.every(
      (item) =>
        item.currentRect.x === item.sourceRect.x &&
        item.currentRect.y === item.sourceRect.y
    );

    if (apply && sheet && !sameSpot) {
      recordPaintUndoSnapshot(sheet);
    }

    for (const item of move.items) {
      const annotation =
        sheet?.annotations.find((entry) => entry.id === item.annotationId) ??
        null;
      if (!annotation?.aabb) continue;
      annotation.aabb.x = apply ? item.currentRect.x : item.sourceRect.x;
      annotation.aabb.y = apply ? item.currentRect.y : item.sourceRect.y;
    }

    if (apply && sheet && !sameSpot) {
      for (const item of move.items) {
        sampleCtx.clearRect(
          item.sourceRect.x,
          item.sourceRect.y,
          item.sourceRect.w,
          item.sourceRect.h
        );
      }
      for (const item of move.items) {
        sampleCtx.putImageData(
          item.imageData,
          item.currentRect.x,
          item.currentRect.y
        );
      }
      commitSampleCanvasEdit('Sprite moved');
      markDirty(true);
      statusText.value = `${sheet.path} • Sprite moved`;
    } else {
      renderDisplayCanvas();
    }

    spriteMove.value = null;
    return apply && !!sheet && !sameSpot;
  }

  function commitAtlasSelectionDrag() {
    const rect = atlasSelectionPreviewRect.value;
    atlasMoveSelectionDrag.value = null;
    if (!rect) {
      setAtlasSelection([]);
      return;
    }
    const ids = annotations.value
      .filter(
        (annotation) => annotation.aabb && rectsIntersect(annotation.aabb, rect)
      )
      .map((annotation) => annotation.id);
    setAtlasSelection(ids);
    statusText.value =
      ids.length > 0
        ? `Selected ${ids.length} sprite${ids.length === 1 ? '' : 's'}`
        : 'No sprites selected';
  }

  return {
    spriteMove,
    atlasMoveSelectionDrag,
    atlasMoveSelectionIds,
    atlasSelectionPreviewRect,
    setAtlasSelection,
    beginSpriteMove,
    updateSpriteMove,
    finalizeSpriteMove,
    commitAtlasSelectionDrag,
  };
}
