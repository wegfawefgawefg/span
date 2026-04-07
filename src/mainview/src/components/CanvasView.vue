<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import type { Annotation } from '../annotation';
import { getEntityByLabel } from '../spec/types';
import {
  zoom,
  annotations,
  currentSheet,
  selectedId,
  selectAnnotation,
  activeSpec,
  paintPixelSelection,
  currentSheetImageSrc,
  imageWidth,
  imageHeight,
  registerViewportCenterFn,
  registerFitZoomFn,
  persistCurrentCanvasViewport,
  addAnnotation,
  duplicateSelected,
  deleteSelected,
  selectedAnnotation,
  canvasGridEnabled,
  canvasGridWidth,
  canvasGridHeight,
  canvasCheckerStrength,
  registerPaintClipboardHandlers,
  registerResizeCanvasHandler,
  statusText,
  markDirty,
  ZOOM_FACTOR,
} from '../state';
import {
  activeTool,
  activePaintTool,
  activePaintColor,
  activeEyedropper,
  activeAtlasTool,
  setPaintTool,
} from '../state/toolState';
import {
  applyPaintedSheetImage,
  recordPaintUndoSnapshot,
  redoPaintEdit,
} from '../state/paintHistory';
import { useCanvas } from '../composables/useCanvas';
import { useCanvasPanning } from '../composables/useCanvasPanning';
import { useCanvasRendering } from '../composables/useCanvasRendering';
import { useCanvasPaint } from '../composables/useCanvasPaint';
import { usePixelSelection } from '../composables/usePixelSelection';
import { useSpriteMove } from '../composables/useSpriteMove';
import { useAnnotationDrawing } from '../composables/useAnnotationDrawing';
import { api } from '../platform/adapter';
import ContextMenu from './ContextMenu.vue';
import type { MenuEntry } from './ContextMenu.vue';
import ToolPalette from './ToolPalette.vue';
import CanvasToolbar from './CanvasToolbar.vue';

const scroller = ref<HTMLElement | null>(null);
const workspace = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const displayCanvas = ref<HTMLCanvasElement | null>(null);
const { zoomTo, normalizeZoom, startDrag, onPointerMove, endDrag } =
  useCanvas();

const PAN_MARGIN = 384;
const FIT_PADDING = 32;

const {
  drawing,
  getPrimaryShapeKind,
  getAnnotationLabel,
  annotationAtPoint,
  commitDrawing,
} = useAnnotationDrawing();
const displayCanvasKey = computed(() => currentSheet.value?.path ?? 'no-sheet');

const stageWidth = computed(() => Math.round(imageWidth.value * zoom.value));
const stageHeight = computed(() => Math.round(imageHeight.value * zoom.value));
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`);
const scrollerViewportWidth = ref(0);
const scrollerViewportHeight = ref(0);
const workspaceWidth = computed(() =>
  Math.max(
    stageWidth.value + PAN_MARGIN * 2,
    scrollerViewportWidth.value + PAN_MARGIN * 2
  )
);
const workspaceHeight = computed(() =>
  Math.max(
    stageHeight.value + PAN_MARGIN * 2,
    scrollerViewportHeight.value + PAN_MARGIN * 2
  )
);
const stageOffsetX = computed(() =>
  Math.round((workspaceWidth.value - stageWidth.value) / 2)
);
const stageOffsetY = computed(() =>
  Math.round((workspaceHeight.value - stageHeight.value) / 2)
);

const {
  isPanning,
  spaceHeld,
  centerViewportOnStage,
  alignViewportToImageOrigin,
  centerViewportOnImagePoint,
  handleScrollerPointerDown,
  handleScrollerPointerMove,
  handleScrollerPointerUp,
  handleScrollerScroll,
  markCentered,
  resetCentered,
} = useCanvasPanning({
  scroller,
  stageOffsetX,
  stageOffsetY,
  stageWidth,
  stageHeight,
});

const layerCursorClass = computed(() => {
  if (activeEyedropper.value) return 'cursor-crosshair';
  if (spaceHeld.value && !isPanning.value) return '';
  if (isPanning.value) return '';
  if (activePaintTool.value)
    return activePaintTool.value === 'erase'
      ? 'cursor-cell'
      : 'cursor-crosshair';
  if (activeTool.value) return 'cursor-crosshair';
  return 'cursor-default';
});
const isPaintMode = computed(() => activePaintTool.value !== '');
const isPaintableCurrentSheet = computed(
  () =>
    !!currentSheet.value &&
    /\.(png|jpe?g|webp)$/i.test(
      currentSheet.value.absolutePath || currentSheet.value.path
    )
);

// Chroma sampling canvas
const sampleCanvas = document.createElement('canvas');
const sampleCtx = sampleCanvas.getContext('2d', {
  willReadFrequently: true,
})!;
const checkerCanvas = document.createElement('canvas');
const floatingSelectionCanvas = document.createElement('canvas');

const { rebuildCheckerboardSource, drawGridLines, renderDisplayCanvas } =
  useCanvasRendering({
    displayCanvas,
    sampleCanvas,
    checkerCanvas,
    floatingSelectionCanvas,
    stageWidth,
    stageHeight,
    pixelSelectionMove,
    spriteMove,
  });

const {
  paintStroke,
  samplePixelAt,
  stampPaintPixel,
  drawPaintLine,
  rebuildPaintPalette,
  commitSampleCanvasEdit,
  commitPaintStroke,
} = useCanvasPaint({
  stage,
  sampleCanvas,
  sampleCtx,
  imageWidth,
  imageHeight,
  renderDisplayCanvas,
});

const {
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
} = usePixelSelection({
  sampleCanvas,
  sampleCtx,
  floatingSelectionCanvas,
  isPaintableCurrentSheet,
  renderDisplayCanvas,
  commitSampleCanvasEdit,
});

const {
  spriteMove,
  atlasMoveSelectionDrag,
  atlasMoveSelectionIds,
  atlasSelectionPreviewRect,
  setAtlasSelection,
  beginSpriteMove,
  updateSpriteMove,
  finalizeSpriteMove,
  commitAtlasSelectionDrag,
} = useSpriteMove({
  sampleCanvas,
  sampleCtx,
  isPaintableCurrentSheet,
  renderDisplayCanvas,
  commitSampleCanvasEdit,
});

let loadedSheetImage: HTMLImageElement | null = null;
let imageLoadVersion = 0;

let scrollerResizeObserver: ResizeObserver | null = null;
let lastRenderMismatchKey = '';
let canvasDebugSeq = 0;

function shortImageId(value: string | null | undefined): string {
  if (!value) return 'null';
  return value.slice(0, 48);
}

function debugCanvas(message: string) {
  void api.debugLog(`[canvas ${++canvasDebugSeq}] ${message}`);
}

function updateScrollerViewportSize() {
  const el = scroller.value;
  if (!el) return;
  scrollerViewportWidth.value = el.clientWidth;
  scrollerViewportHeight.value = el.clientHeight;
}

function computeFitZoomForImage(width: number, height: number): number | null {
  const el = scroller.value;
  if (!el || width <= 0 || height <= 0) return null;
  const availableWidth = Math.max(1, el.clientWidth - FIT_PADDING * 2);
  const availableHeight = Math.max(1, el.clientHeight - FIT_PADDING * 2);
  return normalizeZoom(
    Math.min(availableWidth / width, availableHeight / height)
  );
}

async function waitForImageReady(img: HTMLImageElement): Promise<void> {
  if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
    try {
      await img.decode();
    } catch {
      // Some engines reject decode for already-loaded images; the load state is enough.
    }
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const onLoad = () => {
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
      reject(new Error('Failed to load image'));
    };
    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError, { once: true });
  });

  try {
    await img.decode();
  } catch {
    // If decode is flaky, the successful load event is still enough to draw.
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Escape' && activeEyedropper.value) {
    const original = activeEyedropper.value.originalValue;
    activeEyedropper.value.callback(original);
    activeEyedropper.value = null;
    return;
  }
  if (
    e.code === 'Escape' &&
    (pixelSelectionDrag.value ||
      pixelSelectionMove.value ||
      paintPixelSelection.value)
  ) {
    clearPixelSelection();
    renderDisplayCanvas();
    return;
  }
  if (
    activePaintTool.value === 'marquee' &&
    paintPixelSelection.value &&
    !pixelSelectionDrag.value &&
    !pixelSelectionMove.value?.dragging &&
    ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
  ) {
    e.preventDefault();
    const step = e.shiftKey ? 8 : 1;
    if (e.key === 'ArrowLeft') {
      nudgePixelSelection(-step, 0);
    } else if (e.key === 'ArrowRight') {
      nudgePixelSelection(step, 0);
    } else if (e.key === 'ArrowUp') {
      nudgePixelSelection(0, -step);
    } else if (e.key === 'ArrowDown') {
      nudgePixelSelection(0, step);
    }
    return;
  }
  if (e.code === 'Space') {
    const tag = (document.activeElement?.tagName ?? '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();
    spaceHeld.value = true;
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') {
    spaceHeld.value = false;
    if (isPanning.value) {
      isPanning.value = false;
    }
  }
}

onMounted(() => {
  registerViewportCenterFn(() => {
    const el = scroller.value;
    const stageEl = stage.value;
    if (!el || !stageEl) return { x: 0, y: 0 };
    const scrollerRect = el.getBoundingClientRect();
    const stageRect = stageEl.getBoundingClientRect();
    const x =
      (scrollerRect.left + el.clientWidth / 2 - stageRect.left) / zoom.value;
    const y =
      (scrollerRect.top + el.clientHeight / 2 - stageRect.top) / zoom.value;
    return { x, y };
  });
  registerFitZoomFn((width, height) => computeFitZoomForImage(width, height));

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  registerPaintClipboardHandlers({
    copy: copyPixelSelectionToClipboard,
    cut: cutPixelSelectionToClipboard,
    paste: pastePixelClipboard,
    deleteSelection: deletePixelSelectionPixels,
  });
  registerResizeCanvasHandler(resizeCurrentCanvas);
  updateScrollerViewportSize();
  scrollerResizeObserver = new ResizeObserver(() => {
    updateScrollerViewportSize();
  });
  if (scroller.value) {
    scrollerResizeObserver.observe(scroller.value);
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  registerPaintClipboardHandlers({
    copy: () => false,
    cut: () => false,
    paste: () => false,
    deleteSelection: () => false,
  });
  registerResizeCanvasHandler(() => false);
  scrollerResizeObserver?.disconnect();
  scrollerResizeObserver = null;
  registerFitZoomFn(() => null);
});

watch(
  currentSheet,
  (sheet, previousSheet) => {
    if (previousSheet && pixelSelectionMove.value) {
      finalizeFloatingSelection({
        apply: true,
        clearSelection: true,
        sheet: previousSheet,
      });
    }
    if (previousSheet && spriteMove.value) {
      finalizeSpriteMove({ apply: true, sheet: previousSheet });
    }
    debugCanvas(
      `sheet change -> ${currentSheet.value?.path ?? 'none'} size=${imageWidth.value}x${imageHeight.value}`
    );
    if (!currentSheet.value) {
      resetClipboard();
    }
    resetCentered();
    clearPixelSelection();
    atlasMoveSelectionIds.value = [];
    atlasMoveSelectionDrag.value = null;
    spriteMove.value = null;
    imageLoadVersion += 1;
    loadedSheetImage = null;
    renderDisplayCanvas();
  },
  { flush: 'sync' }
);

watch(activePaintTool, (tool, previousTool) => {
  if (
    previousTool === 'marquee' &&
    tool !== 'marquee' &&
    pixelSelectionMove.value
  ) {
    finalizeFloatingSelection({ apply: true, clearSelection: false });
  }
});

watch(activeAtlasTool, (tool, previousTool) => {
  if (previousTool === 'sprite-move' && tool !== 'sprite-move') {
    if (spriteMove.value) {
      finalizeSpriteMove({ apply: true });
    }
    atlasMoveSelectionIds.value = [];
    atlasMoveSelectionDrag.value = null;
  }
});

watch(
  displayCanvas,
  async () => {
    await nextTick();
    renderDisplayCanvas();
  },
  { flush: 'post' }
);

watch(currentSheetImageSrc, async (src) => {
  debugCanvas(
    `src watch start sheet=${currentSheet.value?.path ?? 'none'} target=${shortImageId(src)}`
  );
  await nextTick();
  updateScrollerViewportSize();

  imageLoadVersion += 1;
  const loadVersion = imageLoadVersion;

  if (!src) {
    loadedSheetImage = null;
    debugCanvas(`src cleared sheet=${currentSheet.value?.path ?? 'none'}`);
    renderDisplayCanvas();
    return;
  }

  const img = new Image();
  img.src = src;

  await waitForImageReady(img);

  if (loadVersion !== imageLoadVersion) return;

  loadedSheetImage = img;
  debugCanvas(
    `image ready sheet=${currentSheet.value?.path ?? 'none'} loaded=${shortImageId(img.src)} natural=${img.naturalWidth}x${img.naturalHeight}`
  );
  imageWidth.value = img.naturalWidth;
  imageHeight.value = img.naturalHeight;
  sampleCanvas.width = img.naturalWidth;
  sampleCanvas.height = img.naturalHeight;
  rebuildCheckerboardSource(img.naturalWidth, img.naturalHeight);
  sampleCtx.clearRect(0, 0, img.naturalWidth, img.naturalHeight);
  sampleCtx.drawImage(img, 0, 0);
  rebuildPaintPalette();

  await nextTick();
  renderDisplayCanvas();

  if (loadVersion !== imageLoadVersion) return;

  updateScrollerViewportSize();
  const savedCenterX = currentSheet.value?.view?.centerX;
  const savedCenterY = currentSheet.value?.view?.centerY;
  if (typeof savedCenterX === 'number' && typeof savedCenterY === 'number') {
    centerViewportOnImagePoint(savedCenterX, savedCenterY);
  } else {
    alignViewportToImageOrigin();
  }
  markCentered();
});

watch(
  () => [
    stageWidth.value,
    stageHeight.value,
    zoom.value,
    currentSheetImageSrc.value,
    canvasCheckerStrength.value,
    canvasGridEnabled.value,
    canvasGridWidth.value,
    canvasGridHeight.value,
  ],
  async () => {
    await nextTick();
    if (imageWidth.value > 0 && imageHeight.value > 0) {
      rebuildCheckerboardSource(imageWidth.value, imageHeight.value);
    }
    renderDisplayCanvas();
  }
);

function stagePixelFromClient(
  clientX: number,
  clientY: number
): { x: number; y: number } | null {
  const stageEl = stage.value;
  if (!stageEl || !sampleCanvas.width || !sampleCanvas.height) return null;
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
  return { x: imgX, y: imgY };
}

function resizeCurrentCanvas(width: number, height: number): boolean {
  const sheet = currentSheet.value;
  if (!sheet || !isPaintableCurrentSheet.value) return false;
  const nextWidth = Math.max(1, Math.round(width));
  const nextHeight = Math.max(1, Math.round(height));
  if (nextWidth === sampleCanvas.width && nextHeight === sampleCanvas.height)
    return false;

  recordPaintUndoSnapshot(sheet);

  const previousCanvas = document.createElement('canvas');
  previousCanvas.width = sampleCanvas.width;
  previousCanvas.height = sampleCanvas.height;
  const previousCtx = previousCanvas.getContext('2d', {
    willReadFrequently: true,
  });
  if (!previousCtx) return false;
  previousCtx.drawImage(sampleCanvas, 0, 0);

  sampleCanvas.width = nextWidth;
  sampleCanvas.height = nextHeight;
  sampleCtx.clearRect(0, 0, nextWidth, nextHeight);
  sampleCtx.drawImage(previousCanvas, 0, 0);

  for (const annotation of annotations.value) {
    if (!annotation.aabb) continue;
    annotation.aabb.x = Math.max(0, Math.min(annotation.aabb.x, nextWidth - 1));
    annotation.aabb.y = Math.max(
      0,
      Math.min(annotation.aabb.y, nextHeight - 1)
    );
    annotation.aabb.w = Math.max(
      1,
      Math.min(annotation.aabb.w, nextWidth - annotation.aabb.x)
    );
    annotation.aabb.h = Math.max(
      1,
      Math.min(annotation.aabb.h, nextHeight - annotation.aabb.y)
    );
  }

  rebuildCheckerboardSource(nextWidth, nextHeight);
  paintPixelSelection.value = null;
  pixelSelectionDrag.value = null;
  pixelSelectionMove.value = null;
  atlasMoveSelectionDrag.value = null;
  spriteMove.value = null;
  rebuildPaintPalette();
  markDirty(true);
  commitSampleCanvasEdit(`Canvas resized to ${nextWidth}x${nextHeight}`);
  return true;
}

function handleWheel(event: WheelEvent) {
  if (!imageWidth.value) return;
  event.preventDefault();
  const nextZoom =
    event.deltaY < 0 ? zoom.value * ZOOM_FACTOR : zoom.value / ZOOM_FACTOR;
  zoomTo(
    normalizeZoom(nextZoom),
    scroller.value!,
    stage.value!,
    event.clientX,
    event.clientY
  );
}

function handleZoomIn() {
  zoomTo(
    normalizeZoom(zoom.value * ZOOM_FACTOR),
    scroller.value!,
    stage.value!
  );
}

function handleZoomOut() {
  zoomTo(
    normalizeZoom(zoom.value / ZOOM_FACTOR),
    scroller.value!,
    stage.value!
  );
}

async function handleFitView() {
  if (
    !imageWidth.value ||
    !imageHeight.value ||
    !scroller.value ||
    !stage.value
  )
    return;
  const fitZoom = computeFitZoomForImage(imageWidth.value, imageHeight.value);
  if (typeof fitZoom !== 'number' || !Number.isFinite(fitZoom)) return;
  zoom.value = fitZoom;
  await nextTick();
  updateScrollerViewportSize();
  centerViewportOnStage();
  markCentered();
  persistCurrentCanvasViewport();
  renderDisplayCanvas();
}


// --- Shape geometry helpers ---

// --- Box (rect) handlers ---

function handleShapePointerDown(event: PointerEvent, annotation: Annotation) {
  if (isPanning.value || spaceHeld.value) return;
  event.preventDefault();
  event.stopPropagation();

  const target = event.target as HTMLElement;
  const isResize = target.dataset.resize === 'true';
  const shapeName = annotation.aabb ? 'aabb' : 'point';

  // Alt/Option+drag: duplicate first, then drag the copy
  if (event.altKey && !isResize) {
    selectAnnotation(annotation.id);
    duplicateSelected();
    const copy = selectedAnnotation.value;
    if (copy) {
      startDrag(event, copy, shapeName, 'move');
      const box = event.currentTarget as HTMLElement;
      box.setPointerCapture(event.pointerId);
    }
    return;
  }

  selectAnnotation(annotation.id);
  startDrag(event, annotation, shapeName, isResize ? 'resize' : 'move');

  const box = event.currentTarget as HTMLElement;
  box.setPointerCapture(event.pointerId);
}

function handleBoxPointerMove(event: PointerEvent) {
  if (spriteMove.value) {
    const point = stagePixelFromClient(event.clientX, event.clientY);
    if (!point) return;
    updateSpriteMove(point);
    return;
  }
  onPointerMove(event, imageWidth.value, imageHeight.value);
}

function handleBoxPointerUp(event: PointerEvent) {
  const box = event.currentTarget as HTMLElement;
  box.releasePointerCapture(event.pointerId);
  if (spriteMove.value) {
    finalizeSpriteMove({ apply: true });
    return;
  }
  endDrag();
}

function handleLayerPointerDown(event: PointerEvent) {
  // Eyedropper mode: click to confirm color
  if (activeEyedropper.value) {
    event.preventDefault();
    event.stopPropagation();
    const hex = samplePixelAt(event.clientX, event.clientY);
    if (hex) {
      activeEyedropper.value.callback(hex);
    }
    activeEyedropper.value = null;
    return;
  }
  if (isPanning.value || spaceHeld.value) return;

  if (activeAtlasTool.value === 'sprite-move') {
    event.preventDefault();
    event.stopPropagation();

    if (!isPaintableCurrentSheet.value || !currentSheet.value) {
      statusText.value =
        'Sprite move currently supports PNG, JPG, and WEBP sheets';
      return;
    }

    const point = stagePixelFromClient(event.clientX, event.clientY);
    if (!point) return;
    const hit = annotationAtPoint(point, annotations.value);
    if (hit?.aabb) {
      if (event.shiftKey) {
        if (atlasMoveSelectionIds.value.includes(hit.id)) {
          setAtlasSelection(
            atlasMoveSelectionIds.value.filter((id) => id !== hit.id)
          );
        } else {
          setAtlasSelection([...atlasMoveSelectionIds.value, hit.id]);
        }
        return;
      }
      if (!atlasMoveSelectionIds.value.includes(hit.id)) {
        setAtlasSelection([hit.id]);
      }
      if (beginSpriteMove(hit, point)) {
        const layerEl = event.currentTarget as HTMLElement;
        layerEl.setPointerCapture(event.pointerId);
      }
      return;
    }

    setAtlasSelection([]);
    atlasMoveSelectionDrag.value = {
      originX: point.x,
      originY: point.y,
      currentX: point.x,
      currentY: point.y,
    };
    const layerEl = event.currentTarget as HTMLElement;
    layerEl.setPointerCapture(event.pointerId);
    return;
  }

  if (activePaintTool.value) {
    event.preventDefault();
    event.stopPropagation();

    if (!isPaintableCurrentSheet.value || !currentSheet.value) {
      statusText.value =
        'Paint tools currently support PNG, JPG, and WEBP sheets';
      return;
    }

    const point = stagePixelFromClient(event.clientX, event.clientY);
    if (!point) return;

    if (activePaintTool.value === 'marquee') {
      if (pointInRect(point, paintPixelSelection.value)) {
        beginPixelSelectionMove(point);
        const layerEl = event.currentTarget as HTMLElement;
        layerEl.setPointerCapture(event.pointerId);
        return;
      }
      if (pixelSelectionMove.value) {
        finalizeFloatingSelection({ apply: true, clearSelection: false });
      }
      pixelSelectionDrag.value = {
        originX: point.x,
        originY: point.y,
        currentX: point.x,
        currentY: point.y,
      };
      const layerEl = event.currentTarget as HTMLElement;
      layerEl.setPointerCapture(event.pointerId);
      return;
    }

    if (activePaintTool.value === 'eyedropper') {
      const hex = samplePixelAt(event.clientX, event.clientY);
      if (hex) {
        activePaintColor.value = hex;
        statusText.value = `Picked ${hex}`;
        setPaintTool('pencil');
      }
      return;
    }

    recordPaintUndoSnapshot(currentSheet.value);
    const erase = activePaintTool.value === 'erase';
    drawPaintLine(point.x, point.y, point.x, point.y, erase);
    paintStroke.value = { lastX: point.x, lastY: point.y };
    renderDisplayCanvas();
    const layerEl = event.currentTarget as HTMLElement;
    layerEl.setPointerCapture(event.pointerId);
    return;
  }

  // Select mode: click empty canvas to deselect
  if (!activeTool.value) {
    selectAnnotation(null);
    return;
  }

  // Draw mode: guard behind activeSpec
  if (!activeSpec.value) return;

  const entity = getEntityByLabel(activeSpec.value, activeTool.value);
  if (!entity) return;

  const stageEl = stage.value;
  if (!stageEl) return;
  const rect = stageEl.getBoundingClientRect();
  const x = Math.round((event.clientX - rect.left) / zoom.value);
  const y = Math.round((event.clientY - rect.top) / zoom.value);

  const shapeKind = entity.primaryShape.kind;

  if (shapeKind === 'point') {
    event.preventDefault();
    event.stopPropagation();
    addAnnotation(x, y);
  } else if (shapeKind === 'rect') {
    event.preventDefault();
    event.stopPropagation();
    drawing.value = {
      originX: x,
      originY: y,
      currentX: x,
      currentY: y,
      entityType: activeTool.value,
      shapeType: 'rect',
    };
    const layerEl = event.currentTarget as HTMLElement;
    layerEl.setPointerCapture(event.pointerId);
  }
}

function handleLayerPointerMove(event: PointerEvent) {
  // Eyedropper mode: live preview on hover
  if (activeEyedropper.value) {
    const hex = samplePixelAt(event.clientX, event.clientY);
    if (hex) {
      activeEyedropper.value.callback(hex);
    }
    return;
  }
  if (paintStroke.value && activePaintTool.value) {
    const point = stagePixelFromClient(event.clientX, event.clientY);
    if (!point) return;
    const erase = activePaintTool.value === 'erase';
    drawPaintLine(
      paintStroke.value.lastX,
      paintStroke.value.lastY,
      point.x,
      point.y,
      erase
    );
    paintStroke.value = { lastX: point.x, lastY: point.y };
    renderDisplayCanvas();
    return;
  }
  if (pixelSelectionMove.value) {
    const point = stagePixelFromClient(event.clientX, event.clientY);
    if (!point) return;
    updatePixelSelectionMove(point);
    return;
  }
  if (spriteMove.value) {
    const point = stagePixelFromClient(event.clientX, event.clientY);
    if (!point) return;
    updateSpriteMove(point);
    return;
  }
  if (pixelSelectionDrag.value) {
    const point = stagePixelFromClient(event.clientX, event.clientY);
    if (!point) return;
    pixelSelectionDrag.value = {
      ...pixelSelectionDrag.value,
      currentX: point.x,
      currentY: point.y,
    };
    return;
  }
  if (atlasMoveSelectionDrag.value) {
    const point = stagePixelFromClient(event.clientX, event.clientY);
    if (!point) return;
    atlasMoveSelectionDrag.value = {
      ...atlasMoveSelectionDrag.value,
      currentX: point.x,
      currentY: point.y,
    };
    return;
  }
  // Drawing preview takes priority
  if (drawing.value) {
    const stageEl = stage.value;
    if (!stageEl) return;
    const rect = stageEl.getBoundingClientRect();
    const newX = Math.max(
      0,
      Math.min(
        Math.round((event.clientX - rect.left) / zoom.value),
        imageWidth.value
      )
    );
    const newY = Math.max(
      0,
      Math.min(
        Math.round((event.clientY - rect.top) / zoom.value),
        imageHeight.value
      )
    );
    drawing.value = { ...drawing.value, currentX: newX, currentY: newY };
    return;
  }
  onPointerMove(event, imageWidth.value, imageHeight.value);
}

function handleLayerPointerUp(event: PointerEvent) {
  const el = event.currentTarget as HTMLElement;
  el.releasePointerCapture(event.pointerId);

  if (paintStroke.value) {
    commitPaintStroke();
    return;
  }

  if (pixelSelectionMove.value) {
    commitPixelSelectionMove();
    return;
  }

  if (spriteMove.value) {
    finalizeSpriteMove({ apply: true });
    return;
  }

  if (atlasMoveSelectionDrag.value) {
    commitAtlasSelectionDrag();
    return;
  }

  if (pixelSelectionDrag.value) {
    commitPixelSelection();
    return;
  }

  if (drawing.value) {
    commitDrawing();
    return;
  }
  endDrag();
}

function handleLayerPointerCancel() {
  if (paintStroke.value) {
    commitPaintStroke();
  }
  if (pixelSelectionMove.value?.dragging) {
    pixelSelectionMove.value = {
      ...pixelSelectionMove.value,
      currentRect: { ...pixelSelectionMove.value.dragStartRect },
      dragging: false,
    };
  }
  if (spriteMove.value?.dragging) {
    finalizeSpriteMove({ apply: false });
  }
  atlasMoveSelectionDrag.value = null;
  pixelSelectionDrag.value = null;
  renderDisplayCanvas();
  drawing.value = null;
  endDrag();
}

// --- Style helpers ---

const drawPreviewStyle = computed(() => {
  const d = drawing.value;
  if (!d) return {};

  if (d.shapeType === 'rect') {
    const x = Math.min(d.originX, d.currentX);
    const y = Math.min(d.originY, d.currentY);
    const w = Math.abs(d.currentX - d.originX);
    const h = Math.abs(d.currentY - d.originY);
    return {
      left: `${x * zoom.value}px`,
      top: `${y * zoom.value}px`,
      width: `${w * zoom.value}px`,
      height: `${h * zoom.value}px`,
      borderRadius: '0px',
    };
  }

  return {};
});

const marqueePreviewRect = computed(() =>
  pixelSelectionDrag.value
    ? normalizePixelSelectionRect(
        pixelSelectionDrag.value.originX,
        pixelSelectionDrag.value.originY,
        pixelSelectionDrag.value.currentX,
        pixelSelectionDrag.value.currentY
      )
    : null
);

const marqueePreviewStyle = computed(() =>
  selectionStyle(marqueePreviewRect.value)
);
const marqueeSelectionStyle = computed(() =>
  pixelSelectionDrag.value
    ? {}
    : selectionStyle(
        pixelSelectionMove.value?.currentRect ?? paintPixelSelection.value
      )
);
const atlasSelectionPreviewStyle = computed(() =>
  selectionStyle(atlasSelectionPreviewRect.value)
);

function isAnnotationCanvasSelected(annotation: Annotation) {
  return (
    annotation.id === selectedId.value ||
    atlasMoveSelectionIds.value.includes(annotation.id)
  );
}

function boxStyle(annotation: Annotation, annIndex: number) {
  const isSelected = isAnnotationCanvasSelected(annotation);
  const moved = spriteMove.value?.items.find(
    (item) => item.annotationId === annotation.id
  );
  const aabb = moved?.currentRect ?? annotation.aabb;
  if (!aabb) return {};
  return {
    left: `${aabb.x * zoom.value}px`,
    top: `${aabb.y * zoom.value}px`,
    width: `${aabb.w * zoom.value}px`,
    height: `${aabb.h * zoom.value}px`,
    zIndex: isSelected ? annotations.value.length + 10 : annIndex + 1,
  };
}

function pointStyle(annotation: Annotation, annIndex: number) {
  const isSelected = isAnnotationCanvasSelected(annotation);
  const pt = annotation.point;
  if (!pt) return {};
  return {
    left: `${pt.x * zoom.value}px`,
    top: `${pt.y * zoom.value}px`,
    zIndex: isSelected ? annotations.value.length + 10 : annIndex + 1,
  };
}

// --- Context menus ---

const ctxMenu = ref<InstanceType<typeof ContextMenu> | null>(null);

function onBoxContextMenu(event: MouseEvent, annotation: Annotation) {
  selectAnnotation(annotation.id);
  const entries: MenuEntry[] = [
    { label: 'Duplicate', action: () => duplicateSelected() },
    { label: 'Delete', action: () => deleteSelected() },
  ];
  ctxMenu.value?.show(event, entries);
}

function onCanvasContextMenu(event: MouseEvent) {
  if (activeEyedropper.value) {
    event.preventDefault();
    const original = activeEyedropper.value.originalValue;
    activeEyedropper.value.callback(original);
    activeEyedropper.value = null;
    return;
  }
  const el = scroller.value;
  const stageEl = stage.value;
  if (!el || !stageEl) return;
  const scrollerRect = el.getBoundingClientRect();
  const stageRect = stageEl.getBoundingClientRect();
  const cx =
    (scrollerRect.left + el.clientWidth / 2 - stageRect.left) / zoom.value;
  const cy =
    (scrollerRect.top + el.clientHeight / 2 - stageRect.top) / zoom.value;
  const entries: MenuEntry[] = [
    {
      label: 'Add annotation here',
      action: () => addAnnotation(cx, cy),
      disabled: !activeSpec.value || !activeTool.value,
    },
  ];
  ctxMenu.value?.show(event, entries);
}
</script>

<template>
  <div class="canvas-shell" style="display: flex">
    <ToolPalette />
    <div
      style="
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        height: 100%;
      "
    >
      <CanvasToolbar
        :zoom-label="zoomLabel"
        @zoom-in="handleZoomIn"
        @zoom-out="handleZoomOut"
        @fit-view="handleFitView"
      />
      <div
        ref="scroller"
        class="canvas-scroller"
        :class="{
          'cursor-grab': spaceHeld && !isPanning,
          'cursor-grabbing': isPanning,
        }"
        @wheel.prevent="handleWheel"
        @scroll="handleScrollerScroll"
        @pointerdown="handleScrollerPointerDown"
        @pointermove="handleScrollerPointerMove"
        @pointerup="handleScrollerPointerUp"
        @pointercancel="handleScrollerPointerUp"
        @contextmenu="onCanvasContextMenu"
      >
        <div
          ref="workspace"
          class="canvas-workspace"
          :style="{
            width: workspaceWidth + 'px',
            height: workspaceHeight + 'px',
          }"
        >
          <div
            ref="stage"
            class="canvas-stage"
            :style="{
              width: stageWidth + 'px',
              height: stageHeight + 'px',
              left: stageOffsetX + 'px',
              top: stageOffsetY + 'px',
            }"
          >
            <canvas
              :key="displayCanvasKey"
              ref="displayCanvas"
              class="sheet-canvas"
              :style="{
                width: stageWidth + 'px',
                height: stageHeight + 'px',
              }"
            ></canvas>
            <div
              class="annotation-layer"
              :class="layerCursorClass"
              :style="{
                width: stageWidth + 'px',
                height: stageHeight + 'px',
              }"
              @pointerdown="handleLayerPointerDown"
              @pointermove="handleLayerPointerMove"
              @pointerup="handleLayerPointerUp"
              @pointercancel="handleLayerPointerCancel"
            >
              <template
                v-for="(annotation, annIndex) in annotations"
                :key="annotation.id"
              >
                <!-- Rect shape (aabb) -->
                <button
                  v-if="
                    getPrimaryShapeKind(annotation) === 'rect' &&
                    annotation.aabb
                  "
                  type="button"
                  class="annotation-box"
                  :class="{ selected: isAnnotationCanvasSelected(annotation) }"
                  :style="[
                    boxStyle(annotation, annIndex),
                    isPaintMode || activeAtlasTool === 'sprite-move'
                      ? { pointerEvents: 'none' }
                      : null,
                  ]"
                  @pointerdown="handleShapePointerDown($event, annotation)"
                  @pointermove="handleBoxPointerMove"
                  @pointerup="handleBoxPointerUp"
                  @pointercancel="handleBoxPointerUp"
                  @contextmenu.stop="onBoxContextMenu($event, annotation)"
                >
                  <div class="annotation-label">
                    {{ getAnnotationLabel(annotation) }}
                  </div>
                  <div class="resize-handle" data-resize="true"></div>
                </button>

                <!-- Point shape -->
                <button
                  v-else-if="
                    getPrimaryShapeKind(annotation) === 'point' &&
                    annotation.point
                  "
                  type="button"
                  class="annotation-point"
                  :class="{ selected: isAnnotationCanvasSelected(annotation) }"
                  :style="[
                    pointStyle(annotation, annIndex),
                    isPaintMode || activeAtlasTool === 'sprite-move'
                      ? { pointerEvents: 'none' }
                      : null,
                  ]"
                  @pointerdown="handleShapePointerDown($event, annotation)"
                  @pointermove="handleBoxPointerMove"
                  @pointerup="handleBoxPointerUp"
                  @pointercancel="handleBoxPointerUp"
                  @contextmenu.stop="onBoxContextMenu($event, annotation)"
                ></button>
              </template>
              <!-- Drawing preview -->
              <div
                v-if="drawing"
                class="draw-preview"
                :style="drawPreviewStyle"
              ></div>
              <div
                v-if="paintPixelSelection && !pixelSelectionDrag"
                class="pixel-selection-box"
                :style="marqueeSelectionStyle"
              ></div>
              <div
                v-if="pixelSelectionDrag && marqueePreviewRect"
                class="pixel-selection-box preview"
                :style="marqueePreviewStyle"
              ></div>
              <div
                v-if="
                  activeAtlasTool === 'sprite-move' &&
                  atlasMoveSelectionDrag &&
                  atlasSelectionPreviewRect
                "
                class="pixel-selection-box preview"
                :style="atlasSelectionPreviewStyle"
              ></div>
            </div>
          </div>
        </div>
      </div>
      <ContextMenu ref="ctxMenu" />
    </div>
  </div>
</template>
