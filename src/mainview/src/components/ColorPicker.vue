<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { Pipette, ChevronUp, ChevronDown } from 'lucide-vue-next';
import { activeEyedropper } from '../state/toolState';

const props = defineProps<{
  modelValue: string;
  imageSource: string;
  aabb: { x: number; y: number; w: number; h: number } | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const expanded = ref(false);
const pickerRef = ref<HTMLElement | null>(null);
const nativeInput = ref<HTMLInputElement | null>(null);
const palette = ref<string[]>([]);
const paletteCache = ref<{ key: string; colors: string[] } | null>(null);

// --- Hex normalization ---

const HEX_RE = /^#[0-9a-f]{6}$/i;

function normalizeHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (HEX_RE.test(v)) return v;
  if (/^[0-9a-f]{6}$/i.test(v)) return `#${v}`;
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

// --- Palette extraction ---

function cacheKey(): string {
  if (!props.aabb) return '';
  return `${props.imageSource}:${props.aabb.x},${props.aabb.y},${props.aabb.w},${props.aabb.h}`;
}

function extractPalette() {
  if (!props.aabb || !props.imageSource) {
    palette.value = [];
    return;
  }

  const key = cacheKey();
  if (paletteCache.value?.key === key) {
    palette.value = paletteCache.value.colors;
    return;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(img, 0, 0);

    const a = props.aabb!;
    const sx = Math.max(0, Math.min(a.x, img.naturalWidth));
    const sy = Math.max(0, Math.min(a.y, img.naturalHeight));
    const sw = Math.max(1, Math.min(a.w, img.naturalWidth - sx));
    const sh = Math.max(1, Math.min(a.h, img.naturalHeight - sy));

    const imageData = ctx.getImageData(sx, sy, sw, sh);
    const data = imageData.data;
    const freq = new Map<string, number>();

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 128) continue;

      const hex = rgbToHex(data[i], data[i + 1], data[i + 2]);
      freq.set(hex, (freq.get(hex) ?? 0) + 1);
    }

    const sorted = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 32)
      .map(([hex]) => hex);

    palette.value = sorted;
    paletteCache.value = { key, colors: sorted };
  };
  img.src = props.imageSource;
}

watch(
  () => cacheKey(),
  () => {
    if (paletteCache.value && paletteCache.value.key !== cacheKey()) {
      paletteCache.value = null;
    }
  }
);

// --- Toggle dropdown ---

function toggleExpanded() {
  expanded.value = !expanded.value;
  if (expanded.value) {
    extractPalette();
  }
}

// --- Swatch click ---

function selectColor(hex: string) {
  emit('update:modelValue', hex);
  expanded.value = false;
}

// --- Hex input ---

function onHexInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  const hex = normalizeHex(value);
  if (hex) {
    emit('update:modelValue', hex);
  }
}

// --- Native color picker ---

function openNativePicker() {
  nativeInput.value?.click();
}

function onNativeInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  emit('update:modelValue', value.toLowerCase());
  expanded.value = false;
}

// --- Eyedropper ---

function activateEyedropper() {
  expanded.value = false;
  activeEyedropper.value = {
    callback: (hex: string) => {
      emit('update:modelValue', hex);
    },
    originalValue: props.modelValue || '',
  };
}

// --- Click outside ---

function onClickOutside(event: MouseEvent) {
  if (
    expanded.value &&
    pickerRef.value &&
    !pickerRef.value.contains(event.target as Node)
  ) {
    expanded.value = false;
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onClickOutside, true);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onClickOutside, true);
});

const displayColor = computed(() => props.modelValue || '#000000');
const isSelected = (hex: string) =>
  hex.toLowerCase() === (props.modelValue || '').toLowerCase();
const isUnset = computed(() => !normalizeHex(props.modelValue ?? ''));
</script>

<template>
  <div ref="pickerRef" class="flex flex-col gap-1.5">
    <!-- Collapsed row: swatch + hex + eyedropper + chevron -->
    <div class="flex items-center gap-1.5">
      <span
        class="w-7 h-7 shrink-0 rounded-sm border border-border transition-colors"
        :style="
          isUnset
            ? {
                backgroundImage:
                  'repeating-conic-gradient(rgba(255,255,255,0.12) 0% 25%, rgba(255,255,255,0.04) 0% 50%)',
                backgroundSize: '8px 8px',
                backgroundColor: 'transparent',
              }
            : { backgroundColor: displayColor }
        "
      />
      <input
        type="text"
        :value="modelValue ?? ''"
        :placeholder="isUnset ? 'none' : '#000000'"
        class="flex-1 min-w-0"
        @change="onHexInput"
      />
      <button
        type="button"
        class="w-6 h-6 flex items-center justify-center text-text-dim hover:text-copper transition-colors cursor-pointer bg-transparent border-none p-0"
        title="Pick color from canvas"
        @click="activateEyedropper"
      >
        <Pipette :size="14" />
      </button>
      <button
        type="button"
        class="w-6 h-6 flex items-center justify-center text-text-dim hover:text-copper transition-colors cursor-pointer bg-transparent border-none p-0"
        title="Toggle palette"
        @click="toggleExpanded"
      >
        <ChevronUp v-if="expanded" :size="10" />
        <ChevronDown v-else :size="10" />
      </button>
    </div>

    <!-- Expanded dropdown -->
    <div
      v-if="expanded"
      class="bg-surface-2 border border-border rounded p-2 flex flex-col gap-2"
    >
      <!-- Palette grid -->
      <div
        v-if="palette.length > 0"
        class="grid gap-0.5"
        style="grid-template-columns: repeat(8, 1fr)"
      >
        <button
          v-for="hex in palette"
          :key="hex"
          type="button"
          class="aspect-square rounded-sm cursor-pointer p-0 transition-all"
          :class="
            isSelected(hex)
              ? 'ring-2 ring-copper ring-offset-1 ring-offset-surface-2 scale-110'
              : 'ring-1 ring-border hover:ring-border-strong hover:scale-105'
          "
          :style="{ backgroundColor: hex }"
          :title="hex"
          @click="selectColor(hex)"
        />
      </div>
      <div v-else class="text-text-faint text-[11px] text-center py-2">
        No palette available
      </div>

      <!-- Bottom row: eyedropper + custom -->
      <div class="flex items-center gap-2 pt-0.5 border-t border-border">
        <button
          type="button"
          class="flex items-center gap-1 text-[11px] text-text-dim hover:text-copper transition-colors cursor-pointer bg-transparent border-none p-0"
          @click="activateEyedropper"
        >
          <Pipette :size="12" />
          pick
        </button>
        <button
          type="button"
          class="flex items-center gap-1 text-[11px] text-text-dim hover:text-copper transition-colors cursor-pointer bg-transparent border-none p-0 ml-auto"
          @click="openNativePicker"
        >
          <div
            class="w-3.5 h-3.5 rounded-sm border border-border"
            style="
              background: conic-gradient(
                red,
                yellow,
                lime,
                aqua,
                blue,
                magenta,
                red
              );
            "
          />
          custom
        </button>
      </div>

      <!-- Hidden native color input -->
      <input
        ref="nativeInput"
        type="color"
        :value="displayColor"
        class="absolute w-0 h-0 opacity-0 pointer-events-none"
        @input="onNativeInput"
      />
    </div>
  </div>
</template>
