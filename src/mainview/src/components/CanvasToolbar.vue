<script setup lang="ts">
import {
  canvasGridEnabled,
  canvasGridWidth,
  canvasGridHeight,
  canvasCheckerStrength,
} from '../state';
import { Minus, Plus, Maximize2, Grid3x3 } from 'lucide-vue-next';

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
  <div class="canvas-toolbar">
    <div class="canvas-toolbar-group">
      <button
        type="button"
        class="canvas-toolbar-icon-button"
        title="Zoom out"
        @click="emit('zoomOut')"
      >
        <Minus :size="16" />
      </button>
      <span class="canvas-toolbar-zoom">{{ zoomLabel }}</span>
      <button
        type="button"
        class="canvas-toolbar-icon-button"
        title="Zoom in"
        @click="emit('zoomIn')"
      >
        <Plus :size="16" />
      </button>
      <button
        type="button"
        class="canvas-toolbar-icon-button"
        title="Fit view"
        @click="emit('fitView')"
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
</template>
