<script setup lang="ts">
import { activeSpec } from '../state';
import {
  activeTool,
  activePaintTool,
  activeAtlasTool,
  setEntityTool,
  setPaintTool,
  setAtlasTool,
  setSelectTool,
} from '../state/toolState';
import {
  MousePointer2,
  VectorSquare,
  Crosshair,
  SquareDashed,
  Move,
  Pencil,
  Eraser,
  Pipette,
} from 'lucide-vue-next';

interface PaintToolDef {
  id: 'marquee' | 'pencil' | 'erase' | 'eyedropper';
  label: string;
}

const paintTools: PaintToolDef[] = [
  { id: 'marquee', label: 'Marquee' },
  { id: 'pencil', label: 'Pencil' },
  { id: 'erase', label: 'Erase' },
  { id: 'eyedropper', label: 'Pick' },
];
</script>

<template>
  <div class="tool-palette">
    <button
      type="button"
      class="tool-button"
      :class="{
        active:
          activeTool === '' && activePaintTool === '' && activeAtlasTool === '',
      }"
      title="Select"
      @click="setSelectTool()"
    >
      <MousePointer2 class="w-4 h-4" />
      <span class="tool-label">Select</span>
    </button>

    <template v-if="activeSpec">
      <button
        v-for="entity in activeSpec.entities"
        :key="entity.label"
        type="button"
        class="tool-button"
        :class="{ active: activeTool === entity.label }"
        :title="entity.label"
        @click="setEntityTool(entity.label)"
      >
        <VectorSquare
          v-if="entity.primaryShape.kind === 'rect'"
          class="w-4 h-4"
        />
        <Crosshair
          v-else-if="entity.primaryShape.kind === 'point'"
          class="w-4 h-4"
        />
        <span class="tool-label">{{ entity.label }}</span>
      </button>
    </template>

    <div class="tool-divider"></div>

    <button
      type="button"
      class="tool-button"
      :class="{ active: activeAtlasTool === 'sprite-move' }"
      title="Move Sprites"
      @click="setAtlasTool('sprite-move')"
    >
      <Move class="w-4 h-4" />
      <span class="tool-label">Move</span>
    </button>

    <div class="tool-divider"></div>

    <button
      v-for="tool in paintTools"
      :key="tool.id"
      type="button"
      class="tool-button"
      :class="{ active: activePaintTool === tool.id }"
      :title="tool.label"
      @click="setPaintTool(tool.id)"
    >
      <SquareDashed v-if="tool.id === 'marquee'" class="w-4 h-4" />
      <Pencil v-else-if="tool.id === 'pencil'" class="w-4 h-4" />
      <Eraser v-else-if="tool.id === 'erase'" class="w-4 h-4" />
      <Pipette v-else class="w-4 h-4" />
      <span class="tool-label">{{ tool.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.tool-palette {
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface-0);
  border-right: 1px solid var(--color-border);
  width: 44px;
  overflow-y: auto;
  overflow-x: hidden;
}

.tool-button {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  cursor: pointer;
  color: var(--color-text-faint);
  transition:
    color 0.15s,
    background-color 0.15s;
  border: none;
  background: transparent;
  padding: 0.25rem;
}

.tool-button:hover {
  color: var(--color-text-dim);
}

.tool-button.active {
  color: var(--color-copper-bright);
  background-color: var(--color-copper-glow);
}

.tool-label {
  font-size: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  line-height: 1.2;
}

.tool-divider {
  height: 1px;
  background: var(--color-border);
  margin: 2px 6px;
}
</style>
