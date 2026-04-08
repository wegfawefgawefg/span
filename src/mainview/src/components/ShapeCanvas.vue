<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { Annotation } from '../annotation';
import type { SpanSpec } from '../spec/types';
import { getEntityByLabel } from '../spec/types';
import { currentSheet, recordPaintUndoSnapshot, updateShapeData } from '../state';
import { activeEyedropper } from '../state/toolState';

const props = defineProps<{
  annotation: Annotation;
  spec: SpanSpec;
  shapeName: string;
  sheetImageSrc: string;
  shapeColor: string;
  // Property shape support
  propertyShapes?: {
    type: 'rect' | 'point';
    array: boolean;
    items: Array<{ x: number; y: number; w?: number; h?: number }>;
  };
}>();

const emit = defineEmits<{
  'update:propertyShape': [
    propName: string,
    index: number | null,
    patch: Record<string, number>,
    captureHistory?: boolean,
  ];
}>();

const PADDING = 8;
const MIN_CANVAS_HEIGHT = 48;

const container = ref<HTMLElement | null>(null);
const bgCanvas = ref<HTMLCanvasElement | null>(null);
const containerWidth = ref(200);

// --- Derived spec info ---

const entity = computed(() =>
  getEntityByLabel(props.spec, props.annotation.entityType)
);
const primaryShapeKind = computed(
  () => entity.value?.primaryShape.kind ?? null
);

// Whether this shape canvas is showing the primary shape
const isPrimaryShape = computed(() => {
  if (primaryShapeKind.value === 'rect') return props.shapeName === 'aabb';
  if (primaryShapeKind.value === 'point') return props.shapeName === 'point';
  return false;
});

// --- Preview rect (the "master" crop region) ---

const previewRect = computed(() => {
  const aabb = props.annotation.aabb;
  if (!aabb) return null;
  return { x: aabb.x, y: aabb.y, width: aabb.w, height: aabb.h };
});

// --- Viewport: what region of the spritesheet to show ---

const viewport = computed(() => {
  const pr = previewRect.value;
  if (!pr) return null;
  return {
    x: pr.x - PADDING,
    y: pr.y - PADDING,
    width: pr.width + PADDING * 2,
    height: pr.height + PADDING * 2,
  };
});

// --- Scale and canvas dimensions ---

const scale = computed(() => {
  const vp = viewport.value;
  if (!vp || vp.width === 0) return 1;
  return containerWidth.value / vp.width;
});

const canvasHeight = computed(() => {
  const vp = viewport.value;
  if (!vp) return MIN_CANVAS_HEIGHT;
  return Math.max(MIN_CANVAS_HEIGHT, Math.round(vp.height * scale.value));
});

// --- Shape position within the mini-canvas ---

const shapeStyle = computed(() => {
  const vp = viewport.value;
  if (!vp) return {};

  if (props.shapeName === 'aabb' && props.annotation.aabb) {
    const aabb = props.annotation.aabb;
    return {
      left: `${(aabb.x - vp.x) * scale.value}px`,
      top: `${(aabb.y - vp.y) * scale.value}px`,
      width: `${aabb.w * scale.value}px`,
      height: `${aabb.h * scale.value}px`,
    };
  }

  if (props.shapeName === 'point' && props.annotation.point) {
    const pt = props.annotation.point;
    return {
      left: `${(pt.x - vp.x) * scale.value}px`,
      top: `${(pt.y - vp.y) * scale.value}px`,
    };
  }

  return {};
});

// --- Background image rendering ---

let sheetImage: HTMLImageElement | null = null;

function loadSheetImage() {
  if (!props.sheetImageSrc) return;
  const img = new Image();
  img.onload = () => {
    sheetImage = img;
    drawBackground();
  };
  img.src = props.sheetImageSrc;
}

function drawCheckerboard(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const size = 4;
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      ctx.fillStyle =
        (Math.floor(x / size) + Math.floor(y / size)) % 2 === 0
          ? '#1a1a2e'
          : '#16162a';
      ctx.fillRect(x, y, size, size);
    }
  }
}

function drawBackground() {
  const canvas = bgCanvas.value;
  const vp = viewport.value;
  const pr = previewRect.value;
  if (!canvas || !vp || !pr || !sheetImage) return;

  const dpr = window.devicePixelRatio || 1;
  const w = containerWidth.value;
  const h = canvasHeight.value;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (isPrimaryShape.value) {
    // Preview shape: draw the full padded spritesheet region
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheetImage, vp.x, vp.y, vp.width, vp.height, 0, 0, w, h);
  } else {
    // Non-preview shape: checkerboard background, then only the preview rect cropped image centered
    drawCheckerboard(ctx, w, h);
    const s = scale.value;
    const destX = (pr.x - vp.x) * s;
    const destY = (pr.y - vp.y) * s;
    const destW = pr.width * s;
    const destH = pr.height * s;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sheetImage,
      pr.x,
      pr.y,
      pr.width,
      pr.height,
      destX,
      destY,
      destW,
      destH
    );
  }
}

// --- Resize observer ---

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  loadSheetImage();
  if (container.value) {
    containerWidth.value = container.value.clientWidth;
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width;
      }
    });
    resizeObserver.observe(container.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

watch(() => props.sheetImageSrc, loadSheetImage);
watch([viewport, () => containerWidth.value], drawBackground);
watch(
  () => [props.annotation.aabb, props.annotation.point, previewRect.value],
  drawBackground,
  { deep: true }
);

// --- Property shape styles ---

const propertyShapeStyles = computed(() => {
  const vp = viewport.value;
  if (!vp || !props.propertyShapes) return [];
  const aabb = props.annotation.aabb;
  if (!aabb) return [];

  return props.propertyShapes.items.map((item) => {
    const absX = aabb.x + item.x;
    const absY = aabb.y + item.y;

    if (
      props.propertyShapes!.type === 'rect' &&
      item.w !== undefined &&
      item.h !== undefined
    ) {
      return {
        left: `${(absX - vp.x) * scale.value}px`,
        top: `${(absY - vp.y) * scale.value}px`,
        width: `${item.w * scale.value}px`,
        height: `${item.h * scale.value}px`,
      };
    }
    return {
      left: `${(absX - vp.x) * scale.value}px`,
      top: `${(absY - vp.y) * scale.value}px`,
    };
  });
});

// --- Drag handling ---

interface DragState {
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  startData: Record<string, number>;
  // For property shapes
  propertyIndex: number | null;
  isPropertyShape: boolean;
  historyRecorded: boolean;
}

const drag = ref<DragState | null>(null);

function onShapePointerDown(event: PointerEvent) {
  if (sampleColor(event)) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  event.stopPropagation();

  const target = event.target as HTMLElement;
  const isResize = target.dataset.resize === 'true';

  let startData: Record<string, number> = {};
  if (props.shapeName === 'aabb' && props.annotation.aabb) {
    startData = { ...props.annotation.aabb };
  } else if (props.shapeName === 'point' && props.annotation.point) {
    startData = { ...props.annotation.point };
  }

  drag.value = {
    mode: isResize ? 'resize' : 'move',
    startX: event.clientX,
    startY: event.clientY,
    startData,
    propertyIndex: null,
    isPropertyShape: false,
    historyRecorded: false,
  };

  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (activeEyedropper.value) {
    onEyedropperMove(event);
    return;
  }
  const d = drag.value;
  if (!d) return;

  const s = scale.value;
  const deltaX = (event.clientX - d.startX) / s;
  const deltaY = (event.clientY - d.startY) / s;

  const patch: Record<string, number> = {};

  if (d.mode === 'move') {
    patch.x = Math.round(d.startData.x + deltaX);
    patch.y = Math.round(d.startData.y + deltaY);
  } else if (d.mode === 'resize' && props.shapeName === 'aabb') {
    patch.w = Math.max(1, Math.round(d.startData.w + deltaX));
    patch.h = Math.max(1, Math.round(d.startData.h + deltaY));
  }

  if (Object.keys(patch).length > 0) {
    const changed =
      props.shapeName === 'aabb' && props.annotation.aabb
        ? Object.entries(patch).some(
            ([key, value]) =>
              (props.annotation.aabb as Record<string, number>)[key] !== value
          )
        : props.shapeName === 'point' && props.annotation.point
          ? Object.entries(patch).some(
              ([key, value]) =>
                (props.annotation.point as Record<string, number>)[key] !== value
            )
          : false;
    if (!changed) return;
    if (!d.historyRecorded && currentSheet.value) {
      recordPaintUndoSnapshot(currentSheet.value);
      d.historyRecorded = true;
    }
    updateShapeData(props.shapeName, patch, { captureHistory: false });
  }
}

function onPointerUp(event: PointerEvent) {
  if (!drag.value) return;
  (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  drag.value = null;
}

function onPropertyShapePointerDown(event: PointerEvent, idx: number) {
  if (sampleColor(event)) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  event.stopPropagation();

  const target = event.target as HTMLElement;
  const isResize = target.dataset.resize === 'true';
  const items = props.propertyShapes?.items ?? [];
  const item = items[idx];
  if (!item) return;

  const startData: Record<string, number> = { x: item.x, y: item.y };
  if (item.w !== undefined) startData.w = item.w;
  if (item.h !== undefined) startData.h = item.h;

  drag.value = {
    mode: isResize ? 'resize' : 'move',
    startX: event.clientX,
    startY: event.clientY,
    startData,
    propertyIndex: props.propertyShapes?.array ? idx : null,
    isPropertyShape: true,
    historyRecorded: false,
  };

  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onPropertyPointerMove(event: PointerEvent) {
  if (activeEyedropper.value) {
    onEyedropperMove(event);
    return;
  }
  const d = drag.value;
  if (!d || !d.isPropertyShape) return;

  const s = scale.value;
  const deltaX = (event.clientX - d.startX) / s;
  const deltaY = (event.clientY - d.startY) / s;

  const patch: Record<string, number> = {};

  if (d.mode === 'move') {
    patch.x = Math.round(d.startData.x + deltaX);
    patch.y = Math.round(d.startData.y + deltaY);
  } else if (d.mode === 'resize') {
    patch.w = Math.max(1, Math.round(d.startData.w + deltaX));
    patch.h = Math.max(1, Math.round(d.startData.h + deltaY));
  }

  if (Object.keys(patch).length > 0) {
    const items = props.propertyShapes?.items ?? [];
    const currentItem = items[d.propertyIndex ?? 0];
    const changed = currentItem
      ? Object.entries(patch).some(
          ([key, value]) =>
            (currentItem as Record<string, number | undefined>)[key] !== value
        )
      : false;
    if (!changed) return;
    if (!d.historyRecorded && currentSheet.value) {
      recordPaintUndoSnapshot(currentSheet.value);
      d.historyRecorded = true;
    }
    emit(
      'update:propertyShape',
      props.shapeName,
      d.propertyIndex,
      patch,
      false
    );
  }
}

function onPropertyPointerUp(event: PointerEvent) {
  if (!drag.value) return;
  (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  drag.value = null;
}

function samplePixelHex(event: PointerEvent): string | null {
  const canvas = bgCanvas.value;
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const px = Math.round((event.clientX - rect.left) * dpr);
  const py = Math.round((event.clientY - rect.top) * dpr);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const pixel = ctx.getImageData(px, py, 1, 1).data;
  return (
    '#' +
    [pixel[0], pixel[1], pixel[2]]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Preview color on hover */
function onEyedropperMove(event: PointerEvent) {
  if (!activeEyedropper.value) return;
  const hex = samplePixelHex(event);
  if (hex) activeEyedropper.value.callback(hex);
}

/** Finalize color on click — returns true if eyedropper was active */
function sampleColor(event: PointerEvent): boolean {
  if (!activeEyedropper.value) return false;
  const hex = samplePixelHex(event);
  if (hex) activeEyedropper.value.callback(hex);
  activeEyedropper.value = null;
  return true;
}

function onOverlayClick(event: PointerEvent) {
  // Eyedropper takes priority
  if (sampleColor(event)) return;
  // Only handle if we have property shapes and they're points
  if (!props.propertyShapes || props.propertyShapes.type !== 'point') return;
  // Don't place if clicking on an existing shape element
  const target = event.target as HTMLElement;
  if (
    target.classList.contains('annotation-point') ||
    target.classList.contains('annotation-box')
  )
    return;

  const vp = viewport.value;
  const aabb = props.annotation.aabb;
  if (!vp || !aabb) return;

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const canvasX = event.clientX - rect.left;
  const canvasY = event.clientY - rect.top;

  // Convert canvas coords to image coords, then to aabb-relative
  const imgX = canvasX / scale.value + vp.x;
  const imgY = canvasY / scale.value + vp.y;
  const relX = Math.round(imgX - aabb.x);
  const relY = Math.round(imgY - aabb.y);

  // For single point, update it; for array, this is handled by the parent's add button
  if (
    props.propertyShapes.items.length === 0 ||
    !Array.isArray(props.annotation.properties[props.shapeName])
  ) {
    // Single point — just update position
    emit(
      'update:propertyShape',
      props.shapeName,
      null,
      { x: relX, y: relY },
      true
    );
  }
}
</script>

<template>
  <div
    ref="container"
    class="relative w-full overflow-hidden rounded-[2px] border border-border bg-surface-0"
    :style="{ height: canvasHeight + 'px' }"
  >
    <canvas
      ref="bgCanvas"
      class="absolute left-0 top-0 [image-rendering:pixelated]"
    />
    <div
      class="pointer-events-none absolute left-0 top-0 [&>*]:pointer-events-auto"
      :style="{
        width: '100%',
        height: canvasHeight + 'px',
        pointerEvents:
          activeEyedropper || propertyShapes?.type === 'point'
            ? 'auto'
            : undefined,
        cursor: activeEyedropper ? 'crosshair' : undefined,
      }"
      @pointerdown.self="onOverlayClick"
      @pointermove.self="onEyedropperMove"
    >
      <!-- Rect shape -->
      <div
        v-if="props.shapeName === 'aabb' && annotation.aabb"
        class="annotation-box absolute w-auto cursor-grab rounded-none border-2 border-[var(--shape-color-bright,var(--color-copper-bright))] bg-[var(--shape-glow-strong,var(--color-copper-glow-strong))] p-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.4),0_0_16px_var(--shape-glow,var(--color-copper-glow)),0_0_4px_var(--shape-glow-strong,var(--color-copper-glow-strong))] transition-[border-color,background,box-shadow] duration-150 ease-linear touch-none [image-rendering:pixelated] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--shape-color-bright,var(--color-copper-bright))]"
        :style="shapeStyle"
        @pointerdown="onShapePointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <div
          class="absolute -bottom-1 -right-1 h-2 w-2 cursor-nwse-resize rounded-none border border-black/60 bg-copper-bright transition-[transform,background] duration-75 hover:scale-150 hover:bg-copper [image-rendering:pixelated]"
          data-resize="true"
        ></div>
      </div>

      <!-- Point shape -->
      <div
        v-else-if="props.shapeName === 'point' && annotation.point"
        class="annotation-point absolute -ml-2.5 -mt-2.5 h-5 w-5 cursor-grab touch-none before:absolute before:left-[9px] before:top-[2px] before:h-4 before:w-[2px] before:rounded-none before:bg-white before:content-[''] before:[image-rendering:pixelated] before:[mix-blend-mode:difference] after:absolute after:left-[2px] after:top-[9px] after:h-[2px] after:w-4 after:rounded-none after:bg-white after:content-[''] after:[image-rendering:pixelated] after:[mix-blend-mode:difference]"
        :style="shapeStyle"
        @pointerdown="onShapePointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      ></div>

      <!-- Property shapes (relative to aabb) — interactive -->
      <template v-if="propertyShapes">
        <template v-for="(style, idx) in propertyShapeStyles" :key="idx">
          <div
            v-if="propertyShapes.type === 'rect'"
            class="annotation-box absolute w-auto cursor-grab rounded-none border-2 border-[var(--shape-color,var(--color-copper))] bg-[var(--shape-glow-strong,var(--color-copper-glow-strong))] p-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.4),0_0_16px_var(--shape-glow,var(--color-copper-glow)),0_0_4px_var(--shape-glow-strong,var(--color-copper-glow-strong))] transition-[border-color,background,box-shadow] duration-150 ease-linear touch-none [image-rendering:pixelated] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--shape-color-bright,var(--color-copper-bright))]"
            :style="{ ...style, borderColor: shapeColor }"
            @pointerdown="onPropertyShapePointerDown($event, idx)"
            @pointermove="onPropertyPointerMove"
            @pointerup="onPropertyPointerUp"
            @pointercancel="onPropertyPointerUp"
          >
            <div
              class="absolute -bottom-1 -right-1 h-2 w-2 cursor-nwse-resize rounded-none border border-black/60 bg-copper-bright transition-[transform,background] duration-75 hover:scale-150 hover:bg-copper [image-rendering:pixelated]"
              data-resize="true"
            ></div>
          </div>
          <div
            v-else
            class="annotation-point absolute -ml-2.5 -mt-2.5 h-5 w-5 cursor-grab touch-none before:absolute before:left-[9px] before:top-[2px] before:h-4 before:w-[2px] before:rounded-none before:bg-white before:content-[''] before:[image-rendering:pixelated] before:[mix-blend-mode:difference] after:absolute after:left-[2px] after:top-[9px] after:h-[2px] after:w-4 after:rounded-none after:bg-white after:content-[''] after:[image-rendering:pixelated] after:[mix-blend-mode:difference]"
            :style="style"
            @pointerdown="onPropertyShapePointerDown($event, idx)"
            @pointermove="onPropertyPointerMove"
            @pointerup="onPropertyPointerUp"
            @pointercancel="onPropertyPointerUp"
          ></div>
        </template>
      </template>
    </div>
  </div>
</template>
