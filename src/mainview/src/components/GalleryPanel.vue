<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { Annotation } from '../annotation';
import {
  sheets,
  currentSheet,
  annotations as currentAnnotations,
  openSheetByPath,
  selectAnnotation,
  activeSpec,
  getPreviewShapeName,
} from '../state';
import { getEntityByLabel } from '../spec/types';
import ContextMenu from './ContextMenu.vue';
import type { MenuEntry } from './ContextMenu.vue';

interface GalleryFrame {
  annotation: Annotation;
  annotationId: string;
  sheetFile: string;
}

interface PreviewBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface SpriteGroup {
  key: string;
  name: string;
  frameCount: number;
  inCurrentSheet: boolean;
  frames: GalleryFrame[];
  previewBounds: PreviewBounds;
}

const previewScale = ref(3);
const GALLERY_DURATION_RATE_STORAGE_KEY = 'span-gallery-ms-per-duration:v1';
const galleryMsPerDuration = ref(loadGalleryMsPerDuration());
const imageCache = new Map<string, Promise<HTMLImageElement>>();

// Invalidate cached images only when sheets are added/removed or images change (not on annotation edits)
watch(
  () => sheets.value.map((s) => s.path + '\0' + s.imageUrl + '\0' + s.status),
  () => {
    imageCache.clear();
  }
);
const sourceCanvas = document.createElement('canvas');
const sourceCtx = sourceCanvas.getContext('2d', {
  willReadFrequently: true,
})!;

const galleryNow = ref(Date.now());
let galleryTimer: number | null = null;
const canvasRefs = ref<Map<string, HTMLCanvasElement>>(new Map());

function loadGalleryMsPerDuration(): number {
  try {
    const raw = localStorage.getItem(GALLERY_DURATION_RATE_STORAGE_KEY);
    if (!raw) return 60;
    return Math.max(16, Math.min(1000, Math.round(Number(raw) || 60)));
  } catch {
    return 60;
  }
}

const isRectEntity = (ann: Annotation): boolean => {
  return getPreviewShapeName(ann.entityType) !== null;
};

function isPointLike(value: unknown): value is { x: number; y: number } {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { x?: unknown }).x === 'number' &&
    typeof (value as { y?: unknown }).y === 'number'
  );
}

function getFrameOffset(annotation: Annotation): { x: number; y: number } {
  const offset = annotation.properties.offset;
  if (isPointLike(offset)) {
    return { x: offset.x, y: offset.y };
  }
  const legacyOrigin = annotation.properties.origin;
  if (isPointLike(legacyOrigin)) {
    return { x: legacyOrigin.x, y: legacyOrigin.y };
  }
  return { x: 0, y: 0 };
}

function computePreviewBounds(frames: GalleryFrame[]): PreviewBounds {
  let minX = 0;
  let minY = 0;
  let maxX = 16;
  let maxY = 16;
  let initialized = false;

  for (const frame of frames) {
    const aabb = frame.annotation.aabb;
    if (!aabb) continue;
    const offset = getFrameOffset(frame.annotation);
    const frameMinX = offset.x;
    const frameMinY = offset.y;
    const frameMaxX = offset.x + aabb.w;
    const frameMaxY = offset.y + aabb.h;

    if (!initialized) {
      minX = frameMinX;
      minY = frameMinY;
      maxX = frameMaxX;
      maxY = frameMaxY;
      initialized = true;
      continue;
    }

    minX = Math.min(minX, frameMinX);
    minY = Math.min(minY, frameMinY);
    maxX = Math.max(maxX, frameMaxX);
    maxY = Math.max(maxY, frameMaxY);
  }

  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function getAnnotationName(ann: Annotation): string {
  if (!activeSpec.value) return '';
  const entity = getEntityByLabel(activeSpec.value, ann.entityType);
  if (!entity) return '';
  if (entity.nameField) {
    return (ann.properties.name as string) ?? '';
  }
  const firstString = entity.properties.find(
    (f) => f.kind === 'scalar' && f.type === 'string'
  );
  return firstString
    ? ((ann.properties[firstString.name] as string) ?? '')
    : '';
}

function getFrameValue(ann: Annotation): number {
  if (!activeSpec.value) return 0;
  const entity = getEntityByLabel(activeSpec.value, ann.entityType);
  if (!entity) return 0;
  if (entity.frameField) {
    return (ann.properties.frame as number) ?? 0;
  }
  const scalars = entity.properties.filter((f) => f.kind === 'scalar');
  const numericTypes = new Set(['integer', 'number', 'ainteger']);
  const frameProp =
    scalars.find(
      (f) =>
        f.kind === 'scalar' && f.name === 'frame' && numericTypes.has(f.type)
    ) ?? scalars.find((f) => f.kind === 'scalar' && numericTypes.has(f.type));
  return frameProp ? ((ann.properties[frameProp.name] as number) ?? 0) : 0;
}

function getFrameDuration(ann: Annotation): number {
  if (activeSpec.value) {
    const entity = getEntityByLabel(activeSpec.value, ann.entityType);
    if (entity?.durationField) {
      const duration = ann.properties.duration;
      const value = typeof duration === 'number' ? duration : Number(duration);
      if (!Number.isFinite(value)) return 1;
      return Math.max(1, Math.round(value));
    }
  }
  const duration = ann.properties.duration;
  const value = typeof duration === 'number' ? duration : Number(duration);
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.round(value));
}

function groupKey(ann: Annotation): string {
  const name = getAnnotationName(ann).trim();
  // Build extra grouping fields: all string properties except the first (name)
  if (!activeSpec.value) return [ann.entityType, name].join('|');
  const entity = getEntityByLabel(activeSpec.value, ann.entityType);
  if (!entity) return [ann.entityType, name].join('|');
  if (entity.nameField) {
    const extraFields = entity.properties
      .filter((f) => f.kind === 'scalar' && f.type === 'string')
      .map((f) => ((ann.properties[f.name] as string) ?? '').trim());
    return [ann.entityType, name, ...extraFields].join('|');
  }
  const stringFields = entity.properties.filter(
    (f) => f.kind === 'scalar' && f.type === 'string'
  );
  const extraFields = stringFields
    .slice(1)
    .map((f) => ((ann.properties[f.name] as string) ?? '').trim());
  return [ann.entityType, name, ...extraFields].join('|');
}

const groups = computed<SpriteGroup[]>(() => {
  // Depend on currentAnnotations so we react to live edits (drag, inspector)
  const liveAnnotations = currentAnnotations.value;
  const currentFile = currentSheet.value?.path;

  const map = new Map<string, SpriteGroup>();
  for (const sheet of sheets.value) {
    // Skip missing sheets (no image data to render)
    if (sheet.status === 'missing') continue;
    // For the active sheet, use live annotations for real-time updates
    const anns =
      sheet.path === currentFile ? liveAnnotations : (sheet.annotations ?? []);
    for (const ann of anns) {
      // Only show rect-shape entities in the gallery
      if (!isRectEntity(ann)) continue;

      const name = getAnnotationName(ann).trim();
      if (!name) continue;
      const key = groupKey(ann);
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          name,
          frameCount: 0,
          inCurrentSheet: false,
          frames: [],
          previewBounds: { minX: 0, minY: 0, width: 16, height: 16 },
        };
        map.set(key, group);
      }
      group.inCurrentSheet ||= sheet.path === currentFile;
      group.frames.push({
        annotation: ann,
        annotationId: ann.id,
        sheetFile: sheet.path,
      });
    }
  }

  const result = Array.from(map.values());
  for (const g of result) {
    g.frames.sort((a, b) => {
      const fd = getFrameValue(a.annotation) - getFrameValue(b.annotation);
      if (fd !== 0) return fd;
      if (a.sheetFile !== b.sheetFile)
        return a.sheetFile.localeCompare(b.sheetFile);
      const ra = a.annotation.aabb;
      const rb = b.annotation.aabb;
      if (ra && rb) {
        if (ra.y !== rb.y) return ra.y - rb.y;
        return ra.x - rb.x;
      }
      return 0;
    });
    g.frameCount = g.frames.length;
    g.previewBounds = computePreviewBounds(g.frames);
  }

  result.sort((a, b) => {
    if (a.inCurrentSheet !== b.inCurrentSheet) return a.inCurrentSheet ? -1 : 1;
    return a.key.localeCompare(b.key);
  });

  return result;
});

function getPreviewRect(group: SpriteGroup): { width: number; height: number } {
  return {
    width: group.previewBounds.width,
    height: group.previewBounds.height,
  };
}

function loadImage(sheetFile: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(sheetFile);
  if (cached) return cached;
  const sheet = sheets.value.find((s) => s.path === sheetFile);
  if (!sheet || !sheet.imageUrl) {
    return Promise.reject(new Error(`Sheet not found: ${sheetFile}`));
  }
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = sheet.imageUrl;
  });
  // Only cache successful loads — failed loads should retry when sheet data changes
  const cachedP = p.catch((err) => {
    imageCache.delete(sheetFile);
    throw err;
  });
  imageCache.set(sheetFile, cachedP);
  return cachedP;
}

function drawFrame(
  canvas: HTMLCanvasElement,
  frame: GalleryFrame,
  bounds: PreviewBounds
) {
  const aabb = frame.annotation.aabb;
  if (!aabb) return;

  const w = Math.max(1, aabb.w);
  const h = Math.max(1, aabb.h);
  canvas.width = bounds.width * previewScale.value;
  canvas.height = bounds.height * previewScale.value;

  loadImage(frame.sheetFile)
    .then((img) => {
      sourceCanvas.width = w;
      sourceCanvas.height = h;
      sourceCtx.clearRect(0, 0, w, h);
      sourceCtx.drawImage(img, aabb.x, aabb.y, w, h, 0, 0, w, h);

      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      const offset = getFrameOffset(frame.annotation);
      const destX = (offset.x - bounds.minX) * previewScale.value;
      const destY = (offset.y - bounds.minY) * previewScale.value;
      ctx.drawImage(
        sourceCanvas,
        0,
        0,
        w,
        h,
        destX,
        destY,
        w * previewScale.value,
        h * previewScale.value
      );
    })
    .catch(() => {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#9da3ad';
      ctx.font = '11px sans-serif';
      ctx.fillText('Load failed', 8, 16);
    });
}

function getAnimatedFrame(group: SpriteGroup): GalleryFrame | null {
  if (group.frames.length === 0) return null;
  if (group.frames.length === 1) return group.frames[0];

  const msPerDuration = Math.max(16, galleryMsPerDuration.value);
  const durations = group.frames.map((frame) =>
    getFrameDuration(frame.annotation)
  );
  const totalDuration = durations.reduce((sum, value) => sum + value, 0);
  if (totalDuration <= 0) return group.frames[0];

  const elapsedUnits =
    Math.floor(galleryNow.value / msPerDuration) % totalDuration;
  let cursor = 0;
  for (let i = 0; i < group.frames.length; i += 1) {
    cursor += durations[i];
    if (elapsedUnits < cursor) {
      return group.frames[i];
    }
  }

  return group.frames[group.frames.length - 1];
}

function renderPreviews() {
  for (const group of groups.value) {
    const canvas = canvasRefs.value.get(group.key);
    if (!canvas) continue;
    const frame = getAnimatedFrame(group);
    if (!frame) continue;
    drawFrame(canvas, frame, group.previewBounds);
  }
}

function setCanvasRef(key: string, el: unknown) {
  if (el instanceof HTMLCanvasElement) {
    canvasRefs.value.set(key, el);
  } else {
    canvasRefs.value.delete(key);
  }
}

watch(groups, () => {
  requestAnimationFrame(renderPreviews);
});

watch(previewScale, () => {
  requestAnimationFrame(renderPreviews);
});

watch(galleryMsPerDuration, (value) => {
  const normalized = Math.max(16, Math.min(1000, Math.round(value || 60)));
  if (normalized !== value) {
    galleryMsPerDuration.value = normalized;
    return;
  }
  try {
    localStorage.setItem(GALLERY_DURATION_RATE_STORAGE_KEY, String(normalized));
  } catch {
    // ignore persistence failures
  }
  requestAnimationFrame(renderPreviews);
});

onMounted(() => {
  galleryTimer = window.setInterval(() => {
    galleryNow.value = Date.now();
    renderPreviews();
  }, 33);
  renderPreviews();
});

onUnmounted(() => {
  if (galleryTimer !== null) {
    clearInterval(galleryTimer);
    galleryTimer = null;
  }
});

const ctxMenu = ref<InstanceType<typeof ContextMenu> | null>(null);

async function handleClick(group: SpriteGroup) {
  const target =
    group.frames.find((f) => f.sheetFile === currentSheet.value?.path) ??
    group.frames[0];
  if (!target) return;
  if (currentSheet.value?.path !== target.sheetFile) {
    await openSheetByPath(target.sheetFile);
  } else {
    selectAnnotation(target.annotationId);
  }
}

function onGroupContextMenu(event: MouseEvent, group: SpriteGroup) {
  const target =
    group.frames.find((f) => f.sheetFile === currentSheet.value?.path) ??
    group.frames[0];
  const entries: MenuEntry[] = [
    {
      label: 'Select sprite',
      action: () => {
        if (target) handleClick(group);
      },
    },
  ];
  if (target && target.sheetFile !== currentSheet.value?.path) {
    entries.unshift({
      label: `Open ${target.sheetFile}`,
      action: () => openSheetByPath(target.sheetFile),
    });
  }
  ctxMenu.value?.show(event, entries);
}
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden bg-surface-1">
    <div class="flex items-center gap-2 px-2 pt-1.5 pb-0.5">
      <span class="text-[10px] font-mono text-text-faint"
        >{{ previewScale }}x</span
      >
      <input
        type="range"
        min="1"
        max="8"
        step="1"
        :value="previewScale"
        class="gallery-zoom-slider flex-1"
        @input="
          previewScale = Number(($event.target as HTMLInputElement).value)
        "
      />
      <label
        class="flex items-center gap-1 text-[10px] font-mono text-text-faint shrink-0"
      >
        <span>ms/dur</span>
        <input
          v-model.number="galleryMsPerDuration"
          type="number"
          min="16"
          max="1000"
          step="1"
          class="w-16 text-right"
        />
      </label>
      <span
        class="text-[10px] font-mono text-text-faint border border-border rounded-sm px-1"
        >{{ groups.length }}</span
      >
    </div>
    <div
      class="instant-scroll flex-1 overflow-y-auto min-h-0 px-2 py-2 flex flex-wrap gap-2 content-start items-start"
    >
      <button
        v-for="group in groups"
        :key="group.key"
        type="button"
        class="inline-flex flex-col border rounded-sm text-left transition-all cursor-pointer active:translate-y-px overflow-hidden"
        :class="[
          previewScale >= 3 ? 'gap-1 p-2' : 'gap-0 p-1',
          group.inCurrentSheet
            ? 'bg-copper-glow border-copper/30'
            : 'bg-surface-2 border-border hover:border-border-strong hover:-translate-y-px',
        ]"
        :style="
          previewScale >= 3
            ? {
                maxWidth:
                  getPreviewRect(group).width * previewScale + 16 + 'px',
              }
            : undefined
        "
        @click="handleClick(group)"
        @contextmenu.stop="onGroupContextMenu($event, group)"
      >
        <canvas
          :ref="(el: any) => setCanvasRef(group.key, el)"
          class="gallery-preview"
          :title="`${group.name} — ${group.frameCount}f`"
        ></canvas>
        <template v-if="previewScale >= 3">
          <div
            class="text-xs font-medium truncate max-w-full"
            :class="group.inCurrentSheet ? 'text-copper-bright' : 'text-text'"
          >
            {{ group.name }}
          </div>
          <div
            class="font-mono text-[10px] text-text-faint truncate max-w-full"
          >
            {{ group.frameCount }}f
          </div>
        </template>
      </button>
    </div>
    <ContextMenu ref="ctxMenu" />
  </div>
</template>
