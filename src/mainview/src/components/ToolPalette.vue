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
  <div
    class="flex w-11 flex-col overflow-x-hidden overflow-y-auto border-r border-border bg-surface-0"
  >
    <button
      type="button"
      class="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent p-1 text-text-faint transition-[color,background-color] hover:text-text-dim"
      :class="{
        'bg-copper-glow text-copper-bright':
          activeTool === '' && activePaintTool === '' && activeAtlasTool === '',
      }"
      title="Select"
      @click="setSelectTool()"
    >
      <MousePointer2 class="w-4 h-4" />
      <span
        class="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[8px] leading-[1.2]"
      >
        Select
      </span>
    </button>

    <template v-if="activeSpec">
      <button
        v-for="entity in activeSpec.entities"
        :key="entity.label"
        type="button"
        class="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent p-1 text-text-faint transition-[color,background-color] hover:text-text-dim"
        :class="{
          'bg-copper-glow text-copper-bright': activeTool === entity.label,
        }"
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
        <span
          class="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[8px] leading-[1.2]"
        >
          {{ entity.label }}
        </span>
      </button>
    </template>

    <div class="mx-1.5 my-0.5 h-px bg-border"></div>

    <button
      type="button"
      class="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent p-1 text-text-faint transition-[color,background-color] hover:text-text-dim"
      :class="{
        'bg-copper-glow text-copper-bright':
          activeAtlasTool === 'sprite-move',
      }"
      title="Move Sprites"
      @click="setAtlasTool('sprite-move')"
    >
      <Move class="w-4 h-4" />
      <span
        class="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[8px] leading-[1.2]"
      >
        Move
      </span>
    </button>

    <div class="mx-1.5 my-0.5 h-px bg-border"></div>

    <button
      v-for="tool in paintTools"
      :key="tool.id"
      type="button"
      class="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent p-1 text-text-faint transition-[color,background-color] hover:text-text-dim"
      :class="{
        'bg-copper-glow text-copper-bright': activePaintTool === tool.id,
      }"
      :title="tool.label"
      @click="setPaintTool(tool.id)"
    >
      <SquareDashed v-if="tool.id === 'marquee'" class="w-4 h-4" />
      <Pencil v-else-if="tool.id === 'pencil'" class="w-4 h-4" />
      <Eraser v-else-if="tool.id === 'erase'" class="w-4 h-4" />
      <Pipette v-else class="w-4 h-4" />
      <span
        class="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[8px] leading-[1.2]"
      >
        {{ tool.label }}
      </span>
    </button>
  </div>
</template>
