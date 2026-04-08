<script setup lang="ts">
import {
  canvasGridEnabled,
  canvasGridWidth,
  canvasGridHeight,
  canvasCheckerStrength,
} from '../state';
import { Minus, Plus, Maximize2, Grid3x3 } from 'lucide-vue-next';
import {
  controlIconButtonClass,
  controlIconButtonActiveClass,
  controlSliderClass,
} from '../controlStyles';

defineProps<{
  zoomLabel: string;
}>();

const emit = defineEmits<{
  zoomIn: [];
  zoomOut: [];
  fitView: [];
}>();

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
</script>

<template>
  <div
    class="flex h-9 shrink-0 select-none items-center gap-1.5 border-b border-border bg-surface-0 px-1.5"
  >
    <div class="flex items-center gap-0.5">
      <button
        type="button"
        :class="[controlIconButtonClass, 'h-7 w-7']"
        title="Zoom out"
        @click="emit('zoomOut')"
      >
        <Minus :size="16" />
      </button>
      <span
        class="min-w-10 select-none text-center font-mono text-[10px] text-text-faint"
      >
        {{ zoomLabel }}
      </span>
      <button
        type="button"
        :class="[controlIconButtonClass, 'h-7 w-7']"
        title="Zoom in"
        @click="emit('zoomIn')"
      >
        <Plus :size="16" />
      </button>
      <button
        type="button"
        :class="[controlIconButtonClass, 'h-7 w-7']"
        title="Fit view"
        @click="emit('fitView')"
      >
        <Maximize2 :size="16" />
      </button>
    </div>
    <div class="mx-0.5 h-4 w-px bg-border"></div>
    <label
      :class="[
        controlIconButtonClass,
        'h-7 w-9 cursor-pointer flex-col gap-px',
        canvasGridEnabled ? controlIconButtonActiveClass : 'text-text-faint',
      ]"
    >
      <input v-model="canvasGridEnabled" type="checkbox" class="sr-only" />
      <Grid3x3 :size="16" />
      <span
        class="max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[8px] leading-[1.2]"
      >
        Grid
      </span>
    </label>
    <div class="flex items-center gap-0.5">
      <label class="inline-flex items-center gap-1 text-text-faint">
        <span
          class="max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[8px] leading-[1.2]"
        >
          W
        </span>
        <input
          v-model.number="canvasGridWidth"
          type="number"
          min="1"
          step="1"
          class="w-10 rounded-[2px] border border-border bg-surface-1 px-1 py-0.5 font-mono text-[10px] leading-[1.2] text-text-dim focus:border-copper focus:outline-none"
          @change="normalizeGridSize('width')"
        />
      </label>
      <label class="inline-flex items-center gap-1 text-text-faint">
        <span
          class="max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[8px] leading-[1.2]"
        >
          H
        </span>
        <input
          v-model.number="canvasGridHeight"
          type="number"
          min="1"
          step="1"
          class="w-10 rounded-[2px] border border-border bg-surface-1 px-1 py-0.5 font-mono text-[10px] leading-[1.2] text-text-dim focus:border-copper focus:outline-none"
          @change="normalizeGridSize('height')"
        />
      </label>
    </div>
    <div class="mx-0.5 h-4 w-px bg-border"></div>
    <label class="inline-flex items-center gap-1 text-text-faint">
      <span
        class="max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[8px] leading-[1.2]"
      >
        Checker
      </span>
      <input
        v-model.number="canvasCheckerStrength"
        type="range"
        min="0"
        max="100"
        step="1"
        :class="[controlSliderClass, 'w-16 shadow-none focus:border-0 focus:shadow-none']"
        @change="normalizeCheckerStrength"
      />
      <span class="min-w-5 text-right font-mono text-[8px] text-text-faint">
        {{ canvasCheckerStrength }}
      </span>
    </label>
  </div>
</template>
