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
  activeTool,
  activePaintTool,
  activePaintColor,
  paintToolSize,
  paintPixelSelection,
  hasPaintClipboard,
  currentSheetImageSrc,
  imageWidth,
  imageHeight,
  registerViewportCenterFn,
  registerFitZoomFn,
  persistCurrentCanvasViewport,
  addAnnotation,
  addAnnotationWithSize,
  duplicateSelected,
  deleteSelected,
  selectedAnnotation,
  activeEyedropper,
  canvasGridEnabled,
  canvasGridWidth,
  canvasGridHeight,
  canvasCheckerStrength,
  applyPaintedSheetImage,
  recordPaintUndoSnapshot,
  registerPaintClipboardHandlers,
  registerResizeCanvasHandler,
  registerSpriteClipboardHandlers,
  redoPaintEdit,
  setPaintTool,
  setPaintPalette,
  statusText,
  markDirty,
  activeAtlasTool,
} from '../state';
import { ZOOM_FACTOR } from '../state';
import { makeId } from '../types';
import { useCanvas } from '../composables/useCanvas';
import { api } from '../platform/adapter';
import ContextMenu from './ContextMenu.vue';
import type { MenuEntry } from './ContextMenu.vue';
import ToolPalette from './ToolPalette.vue';
import { Minus, Plus, Maximize2, Grid3x3 } from 'lucide-vue-next';

const scroller = ref<HTMLElement | null>(null);
const workspace = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const displayCanvas = ref<HTMLCanvasElement | null>(null);
const { zoomTo, normalizeZoom, startDrag, onPointerMove, endDrag } =
  useCanvas();

const PAN_MARGIN = 384;
const FIT_PADDING = 32;

interface DrawingState {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  entityType: string;
  shapeType: 'rect' | 'point';
}

interface PaintStrokeState {
  lastX: number;
  lastY: number;
}

interface PixelSelectionDragState {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
}

interface PixelClipboardState {
  width: number;
  height: number;
  sourceX: number;
  sourceY: number;
  imageData: ImageData;
}

interface PixelSelectionMoveState {
  pointerOriginX: number;
  pointerOriginY: number;
  sourceRect: { x: number; y: number; w: number; h: number };
  dragStartRect: { x: number; y: number; w: number; h: number };
  currentRect: { x: number; y: number; w: number; h: number };
  imageData: ImageData;
  dragging: boolean;
}

interface AtlasMoveSelectionDragState {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
}

interface SpriteMoveItem {
  annotationId: string;
  sourceRect: { x: number; y: number; w: number; h: number };
  dragStartRect: { x: number; y: number; w: number; h: number };
  currentRect: { x: number; y: number; w: number; h: number };
  imageData: ImageData;
  canvas: HTMLCanvasElement;
}

interface SpriteMoveState {
  pointerOriginX: number;
  pointerOriginY: number;
  items: SpriteMoveItem[];
  groupBounds: { x: number; y: number; w: number; h: number };
  dragging: boolean;
}

interface SpriteClipboardItem {
  annotation: Annotation;
  imageData: ImageData;
  relativeX: number;
  relativeY: number;
}

interface SpriteClipboardState {
  items: SpriteClipboardItem[];
  bounds: { x: number; y: number; w: number; h: number };
}

const drawing = ref<DrawingState | null>(null);
const paintStroke = ref<PaintStrokeState | null>(null);
const pixelSelectionDrag = ref<PixelSelectionDragState | null>(null);
const pixelSelectionMove = ref<PixelSelectionMoveState | null>(null);
const atlasMoveSelectionDrag = ref<AtlasMoveSelectionDragState | null>(null);
const atlasMoveSelectionIds = ref<string[]>([]);
const spriteMove = ref<SpriteMoveState | null>(null);
let pixelClipboard: PixelClipboardState | null = null;
let spriteClipboard: SpriteClipboardState | null = null;
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
let loadedSheetImage: HTMLImageElement | null = null;
let imageLoadVersion = 0;

// --- Panning state ---
const isPanning = ref(false);
const spaceHeld = ref(false);
let panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };
let scrollerResizeObserver: ResizeObserver | null = null;
let hasCenteredCurrentSheet = false;
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

function centerViewportOnStage() {
  const el = scroller.value;
  if (!el) return;
  el.scrollLeft = Math.max(
    0,
    stageOffsetX.value - (el.clientWidth - stageWidth.value) / 2
  );
  el.scrollTop = Math.max(
    0,
    stageOffsetY.value - (el.clientHeight - stageHeight.value) / 2
  );
}

function alignViewportToImageOrigin() {
  const el = scroller.value;
  if (!el) return;
  el.scrollLeft = Math.max(0, stageOffsetX.value);
  el.scrollTop = Math.max(0, stageOffsetY.value);
}

function centerViewportOnImagePoint(centerX: number, centerY: number) {
  const el = scroller.value;
  if (!el) return;
  el.scrollLeft = Math.max(
    0,
    stageOffsetX.value + centerX * zoom.value - el.clientWidth / 2
  );
  el.scrollTop = Math.max(
    0,
    stageOffsetY.value + centerY * zoom.value - el.clientHeight / 2
  );
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

function rebuildCheckerboardSource(width: number, height: number) {
  checkerCanvas.width = width;
  checkerCanvas.height = height;

  const checkerCtx = checkerCanvas.getContext('2d');
  if (!checkerCtx) return;

  const imageData = checkerCtx.createImageData(width, height);
  const data = imageData.data;
  const strength =
    Math.max(0, Math.min(100, canvasCheckerStrength.value)) / 100;
  const darkSquare = [
    Math.round(17 + strength * 16),
    Math.round(20 + strength * 18),
    Math.round(25 + strength * 21),
  ];
  const lightSquare = [
    Math.round(17 + strength * 70),
    Math.round(20 + strength * 76),
    Math.round(25 + strength * 82),
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isLight = (x + y) % 2 === 0;
      const offset = (y * width + x) * 4;
      if (isLight) {
        data[offset] = lightSquare[0];
        data[offset + 1] = lightSquare[1];
        data[offset + 2] = lightSquare[2];
        data[offset + 3] = 255;
      } else {
        data[offset] = darkSquare[0];
        data[offset + 1] = darkSquare[1];
        data[offset + 2] = darkSquare[2];
        data[offset + 3] = 255;
      }
    }
  }

  checkerCtx.putImageData(imageData, 0, 0);
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

function renderDisplayCanvas() {
  const canvas = displayCanvas.value;
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const displayWidth = Math.max(1, stageWidth.value);
  const displayHeight = Math.max(1, stageHeight.value);
  const backingWidth = Math.max(1, Math.round(displayWidth * dpr));
  const backingHeight = Math.max(1, Math.round(displayHeight * dpr));

  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, backingWidth, backingHeight);

  if (!sampleCanvas.width || !sampleCanvas.height) return;

  const loadedId = shortImageId(loadedSheetImage?.src);
  const targetId = shortImageId(currentSheetImageSrc.value);
  if (loadedSheetImage && loadedSheetImage.src !== currentSheetImageSrc.value) {
    const mismatchKey = `${currentSheet.value?.path ?? 'none'}|${loadedId}|${targetId}|${backingWidth}x${backingHeight}`;
    if (mismatchKey !== lastRenderMismatchKey) {
      lastRenderMismatchKey = mismatchKey;
      debugCanvas(
        `render mismatch sheet=${currentSheet.value?.path ?? 'none'} loaded=${loadedId} target=${targetId} backing=${backingWidth}x${backingHeight}`
      );
    }
  } else {
    lastRenderMismatchKey = '';
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(checkerCanvas, 0, 0, backingWidth, backingHeight);
  ctx.drawImage(sampleCanvas, 0, 0, backingWidth, backingHeight);

  const movingSprite = spriteMove.value;
  if (movingSprite) {
    const scaleX = backingWidth / sampleCanvas.width;
    const scaleY = backingHeight / sampleCanvas.height;
    for (const item of movingSprite.items) {
      ctx.drawImage(
        checkerCanvas,
        item.sourceRect.x,
        item.sourceRect.y,
        item.sourceRect.w,
        item.sourceRect.h,
        item.sourceRect.x * scaleX,
        item.sourceRect.y * scaleY,
        item.sourceRect.w * scaleX,
        item.sourceRect.h * scaleY
      );
    }
  }
  drawGridLines(ctx, backingWidth, backingHeight);

  const moving = pixelSelectionMove.value;
  if (
    moving &&
    floatingSelectionCanvas.width &&
    floatingSelectionCanvas.height
  ) {
    const scaleX = backingWidth / sampleCanvas.width;
    const scaleY = backingHeight / sampleCanvas.height;
    ctx.drawImage(
      floatingSelectionCanvas,
      0,
      0,
      floatingSelectionCanvas.width,
      floatingSelectionCanvas.height,
      moving.currentRect.x * scaleX,
      moving.currentRect.y * scaleY,
      moving.currentRect.w * scaleX,
      moving.currentRect.h * scaleY
    );
  }

  if (movingSprite) {
    const scaleX = backingWidth / sampleCanvas.width;
    const scaleY = backingHeight / sampleCanvas.height;
    for (const item of movingSprite.items) {
      ctx.drawImage(
        item.canvas,
        0,
        0,
        item.canvas.width,
        item.canvas.height,
        item.currentRect.x * scaleX,
        item.currentRect.y * scaleY,
        item.currentRect.w * scaleX,
        item.currentRect.h * scaleY
      );
    }
  }
}

function drawGridLines(
  ctx: CanvasRenderingContext2D,
  backingWidth: number,
  backingHeight: number
) {
  if (!canvasGridEnabled.value || !sampleCanvas.width || !sampleCanvas.height)
    return;

  const cellWidth = Math.max(1, Math.round(canvasGridWidth.value || 1));
  const cellHeight = Math.max(1, Math.round(canvasGridHeight.value || 1));
  const scaleX = backingWidth / sampleCanvas.width;
  const scaleY = backingHeight / sampleCanvas.height;

  ctx.fillStyle = 'rgba(232, 226, 212, 0.18)';

  let lastX = -1;
  for (let x = cellWidth; x < sampleCanvas.width; x += cellWidth) {
    const px = Math.round(x * scaleX);
    if (px <= 0 || px >= backingWidth || px === lastX) continue;
    ctx.fillRect(px, 0, 1, backingHeight);
    lastX = px;
  }

  let lastY = -1;
  for (let y = cellHeight; y < sampleCanvas.height; y += cellHeight) {
    const py = Math.round(y * scaleY);
    if (py <= 0 || py >= backingHeight || py === lastY) continue;
    ctx.fillRect(0, py, backingWidth, 1);
    lastY = py;
  }
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

function handleScrollerPointerDown(event: PointerEvent) {
  // MMB (button 1) always pans
  // Space+LMB pans
  const isMMB = event.button === 1;
  const isSpaceLMB = spaceHeld.value && event.button === 0;

  if (!isMMB && !isSpaceLMB) return;

  event.preventDefault();
  event.stopPropagation();
  isPanning.value = true;

  const el = scroller.value!;
  panStart = {
    x: event.clientX,
    y: event.clientY,
    scrollLeft: el.scrollLeft,
    scrollTop: el.scrollTop,
  };

  el.setPointerCapture(event.pointerId);
}

function handleScrollerPointerMove(event: PointerEvent) {
  if (!isPanning.value) return;
  const el = scroller.value!;
  el.scrollLeft = panStart.scrollLeft - (event.clientX - panStart.x);
  el.scrollTop = panStart.scrollTop - (event.clientY - panStart.y);
}

function handleScrollerPointerUp(event: PointerEvent) {
  if (!isPanning.value) return;
  isPanning.value = false;
  scroller.value?.releasePointerCapture(event.pointerId);
}

function handleScrollerScroll() {
  if (!hasCenteredCurrentSheet) return;
  persistCurrentCanvasViewport();
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
  registerSpriteClipboardHandlers({
    copy: copySpriteSelectionToClipboard,
    cut: cutSpriteSelectionToClipboard,
    paste: pasteSpriteClipboard,
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
  registerSpriteClipboardHandlers({
    copy: () => false,
    cut: () => false,
    paste: () => false,
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
      pixelClipboard = null;
      hasPaintClipboard.value = false;
    }
    hasCenteredCurrentSheet = false;
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
  hasCenteredCurrentSheet = true;
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

function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
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

function annotationAtPoint(point: { x: number; y: number }): Annotation | null {
  for (let index = annotations.value.length - 1; index >= 0; index -= 1) {
    const annotation = annotations.value[index];
    if (!annotation.aabb) continue;
    if (pointInRect(point, annotation.aabb)) {
      return annotation;
    }
  }
  return null;
}

function setAtlasSelection(ids: string[]) {
  atlasMoveSelectionIds.value = [...new Set(ids)];
  selectedId.value = atlasMoveSelectionIds.value[0] ?? null;
}

function cloneAnnotationDeep(annotation: Annotation): Annotation {
  return JSON.parse(JSON.stringify(annotation)) as Annotation;
}

function getCanvasViewportCenterPoint() {
  const el = scroller.value;
  if (!el) return { x: 0, y: 0 };
  return {
    x: Math.round((el.scrollLeft + el.clientWidth / 2 - stageOffsetX.value) / zoom.value),
    y: Math.round((el.scrollTop + el.clientHeight / 2 - stageOffsetY.value) / zoom.value),
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
  if (!pixelClipboard || !sheet || !isPaintableCurrentSheet.value) return false;
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

function getSelectedSpriteAnnotations(): Annotation[] {
  const selectionIds =
    atlasMoveSelectionIds.value.length > 0
      ? atlasMoveSelectionIds.value
      : selectedId.value
        ? [selectedId.value]
        : [];
  if (selectionIds.length === 0) return [];
  return annotations.value.filter(
    (entry) => selectionIds.includes(entry.id) && !!entry.aabb
  );
}

function copySpriteSelectionToClipboard(): boolean {
  if (activeAtlasTool.value !== 'sprite-move' || !isPaintableCurrentSheet.value)
    return false;
  const selectedAnnotations = getSelectedSpriteAnnotations();
  if (selectedAnnotations.length === 0) return false;

  const bounds = {
    x: Math.min(...selectedAnnotations.map((annotation) => annotation.aabb!.x)),
    y: Math.min(...selectedAnnotations.map((annotation) => annotation.aabb!.y)),
    w:
      Math.max(...selectedAnnotations.map((annotation) => annotation.aabb!.x + annotation.aabb!.w)) -
      Math.min(...selectedAnnotations.map((annotation) => annotation.aabb!.x)),
    h:
      Math.max(...selectedAnnotations.map((annotation) => annotation.aabb!.y + annotation.aabb!.h)) -
      Math.min(...selectedAnnotations.map((annotation) => annotation.aabb!.y)),
  };

  spriteClipboard = {
    bounds,
    items: selectedAnnotations.map((annotation) => ({
      annotation: cloneAnnotationDeep(annotation),
      imageData: sampleCtx.getImageData(
        annotation.aabb!.x,
        annotation.aabb!.y,
        annotation.aabb!.w,
        annotation.aabb!.h
      ),
      relativeX: annotation.aabb!.x - bounds.x,
      relativeY: annotation.aabb!.y - bounds.y,
    })),
  };

  statusText.value = `Copied ${selectedAnnotations.length} sprite${selectedAnnotations.length === 1 ? '' : 's'}`;
  return true;
}

function cutSpriteSelectionToClipboard(): boolean {
  const sheet = currentSheet.value;
  if (!sheet || !copySpriteSelectionToClipboard()) return false;

  const selectedIds = new Set(
    getSelectedSpriteAnnotations().map((annotation) => annotation.id)
  );
  if (selectedIds.size === 0) return false;

  recordPaintUndoSnapshot(sheet);
  for (const annotation of sheet.annotations) {
    if (!annotation.aabb || !selectedIds.has(annotation.id)) continue;
    sampleCtx.clearRect(
      annotation.aabb.x,
      annotation.aabb.y,
      annotation.aabb.w,
      annotation.aabb.h
    );
  }
  sheet.annotations = sheet.annotations.filter(
    (annotation) => !selectedIds.has(annotation.id)
  );
  setAtlasSelection([]);
  spriteMove.value = null;
  commitSampleCanvasEdit('Sprites cut to clipboard');
  markDirty(true);
  return true;
}

function pasteSpriteClipboard(): boolean {
  const sheet = currentSheet.value;
  if (
    !sheet ||
    !spriteClipboard ||
    activeAtlasTool.value !== 'sprite-move' ||
    !isPaintableCurrentSheet.value
  ) {
    return false;
  }

  if (
    spriteClipboard.bounds.w > sampleCanvas.width ||
    spriteClipboard.bounds.h > sampleCanvas.height
  ) {
    statusText.value = 'Sprite group does not fit in this sheet';
    return false;
  }

  recordPaintUndoSnapshot(sheet);
  const viewportCenter = getCanvasViewportCenterPoint();
  const originX = Math.max(
    0,
    Math.min(
      Math.round(viewportCenter.x - spriteClipboard.bounds.w / 2),
      sampleCanvas.width - spriteClipboard.bounds.w
    )
  );
  const originY = Math.max(
    0,
    Math.min(
      Math.round(viewportCenter.y - spriteClipboard.bounds.h / 2),
      sampleCanvas.height - spriteClipboard.bounds.h
    )
  );

  const pastedIds: string[] = [];
  for (const item of spriteClipboard.items) {
    const nextAnnotation = cloneAnnotationDeep(item.annotation);
    nextAnnotation.id = makeId();
    if (nextAnnotation.aabb) {
      nextAnnotation.aabb.x = originX + item.relativeX;
      nextAnnotation.aabb.y = originY + item.relativeY;
    }
    sampleCtx.putImageData(
      item.imageData,
      originX + item.relativeX,
      originY + item.relativeY
    );
    sheet.annotations.push(nextAnnotation);
    pastedIds.push(nextAnnotation.id);
  }

  setAtlasSelection(pastedIds);
  commitSampleCanvasEdit(
    `Pasted ${pastedIds.length} sprite${pastedIds.length === 1 ? '' : 's'}`
  );
  markDirty(true);
  return true;
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

function commitPixelSelection() {
  paintPixelSelection.value = marqueePreviewRect.value;
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
  hasCenteredCurrentSheet = true;
  persistCurrentCanvasViewport();
  renderDisplayCanvas();
}

function normalizeGridSize(axis: 'width' | 'height') {
  if (axis === 'width') {
    canvasGridWidth.value = Math.max(1, Math.round(canvasGridWidth.value || 1));
    return;
  }
  canvasGridHeight.value = Math.max(1, Math.round(canvasGridHeight.value || 1));
}

function normalizeCheckerStrength() {
  canvasCheckerStrength.value = Math.max(
    0,
    Math.min(100, Math.round(canvasCheckerStrength.value || 0))
  );
}

// --- Primary shape helper ---

function getPrimaryShapeKind(annotation: Annotation): 'rect' | 'point' | null {
  if (!activeSpec.value) return null;
  const entity = getEntityByLabel(activeSpec.value, annotation.entityType);
  if (!entity) return null;
  return entity.primaryShape.kind;
}

// --- Annotation display helpers ---

function getAnnotationLabel(annotation: Annotation): string {
  if (!activeSpec.value) return annotation.entityType;
  const entity = getEntityByLabel(activeSpec.value, annotation.entityType);
  if (!entity) return annotation.entityType;
  if (entity.nameField) {
    const val = annotation.properties.name;
    if (val && typeof val === 'string') return val;
  }
  // Fallback to first string property
  for (const field of entity.properties) {
    if (field.kind === 'scalar' && field.type === 'string') {
      const val = annotation.properties[field.name];
      if (val && typeof val === 'string') return val;
    }
  }
  return annotation.entityType;
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
    const hit = annotationAtPoint(point);
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
  if (pixelSelectionMove.value?.dragging) {
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

const DRAW_MIN_THRESHOLD = 4; // image-space pixels

function commitDrawing() {
  const d = drawing.value;
  drawing.value = null;
  if (!d) return;

  if (d.shapeType === 'rect') {
    const w = Math.abs(d.currentX - d.originX);
    const h = Math.abs(d.currentY - d.originY);
    if (w < DRAW_MIN_THRESHOLD || h < DRAW_MIN_THRESHOLD) return;

    const x = Math.min(d.originX, d.currentX);
    const y = Math.min(d.originY, d.currentY);
    addAnnotationWithSize(d.entityType, x, y, w, h);
  }
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
const atlasSelectionPreviewRect = computed(() =>
  atlasMoveSelectionDrag.value
    ? normalizePixelSelectionRect(
        atlasMoveSelectionDrag.value.originX,
        atlasMoveSelectionDrag.value.originY,
        atlasMoveSelectionDrag.value.currentX,
        atlasMoveSelectionDrag.value.currentY
      )
    : null
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
      <div class="canvas-toolbar">
        <div class="canvas-toolbar-group">
          <button
            type="button"
            class="canvas-toolbar-icon-button"
            title="Zoom out"
            @click="handleZoomOut"
          >
            <Minus :size="16" />
          </button>
          <span class="canvas-toolbar-zoom">{{ zoomLabel }}</span>
          <button
            type="button"
            class="canvas-toolbar-icon-button"
            title="Zoom in"
            @click="handleZoomIn"
          >
            <Plus :size="16" />
          </button>
          <button
            type="button"
            class="canvas-toolbar-icon-button"
            title="Fit view"
            @click="handleFitView"
          >
            <Maximize2 :size="16" />
          </button>
        </div>
        <div class="canvas-toolbar-divider"></div>
        <label
          class="canvas-toolbar-toggle"
          :class="{ active: canvasGridEnabled }"
        >
          <input v-model="canvasGridEnabled" type="checkbox" class="sr-only" />
          <Grid3x3 :size="16" />
          <span class="canvas-toolbar-label">Grid</span>
        </label>
        <div class="canvas-toolbar-group">
          <label class="canvas-toolbar-field">
            <span class="canvas-toolbar-label">W</span>
            <input
              v-model.number="canvasGridWidth"
              type="number"
              min="1"
              step="1"
              class="canvas-toolbar-number"
              @change="normalizeGridSize('width')"
            />
          </label>
          <label class="canvas-toolbar-field">
            <span class="canvas-toolbar-label">H</span>
            <input
              v-model.number="canvasGridHeight"
              type="number"
              min="1"
              step="1"
              class="canvas-toolbar-number"
              @change="normalizeGridSize('height')"
            />
          </label>
        </div>
        <div class="canvas-toolbar-divider"></div>
        <label class="canvas-toolbar-field canvas-toolbar-range-field">
          <span class="canvas-toolbar-label">Checker</span>
          <input
            v-model.number="canvasCheckerStrength"
            type="range"
            min="0"
            max="100"
            step="1"
            class="canvas-toolbar-range"
            @change="normalizeCheckerStrength"
          />
          <span class="canvas-toolbar-range-value">{{
            canvasCheckerStrength
          }}</span>
        </label>
      </div>
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
