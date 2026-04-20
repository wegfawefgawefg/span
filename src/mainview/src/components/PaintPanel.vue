<script setup lang="ts">
import {
  beginRotatePixelSelection,
  copyPixelSelection,
  currentSheet,
  cutPixelSelection,
  deletePixelSelection,
  flipPixelSelectionHorizontal,
  flipPixelSelectionVertical,
  hasPaintClipboard,
  importPaletteFromPath,
  paintPixelSelection,
  pastePixelSelection,
  setActiveProjectPalette,
} from '../state';
import { undoPaintEdit, redoPaintEdit } from '../state/paintHistory';
import {
  activeProjectPalette,
  activeProjectPaletteId,
  availablePaintSwatches,
  paintPalette,
  projectPalettes,
} from '../state/paletteState';
import {
  activePaintColor,
  activePaintTool,
  paintToolSize,
} from '../state/toolState';
import { api } from '../platform/adapter';
import {
  controlButtonClass,
  controlSliderClass,
} from '../controlStyles';

const supportedSheet = () =>
  !!currentSheet.value &&
  /\.(png|jpe?g|webp)$/i.test(
    currentSheet.value.absolutePath || currentSheet.value.path
  );

async function handleImportPalette() {
  const path = await api.showOpenDialog([
    { name: 'Palette files', extensions: ['hex', 'txt'] },
  ]);
  if (!path) return;
  await importPaletteFromPath(path);
}

function handlePaletteSelection(event: Event) {
  const value = (event.target as HTMLSelectElement).value || null;
  setActiveProjectPalette(value);
}

</script>

<template>
  <div class="h-full flex flex-col bg-surface-1">
    <div class="instant-scroll flex-1 min-h-0 overflow-y-auto px-3 py-3">
      <div class="flex flex-col gap-3">
        <div
          class="text-[11px] font-mono text-text-faint uppercase tracking-[0.16em]"
        >
          Paint
        </div>

        <div v-if="!supportedSheet()" class="text-sm text-text-faint">
          Paint tools currently support PNG, JPG, and WEBP sheets.
        </div>

        <template v-else>
          <div v-if="!activePaintTool" class="text-sm text-text-faint">
            Choose a paint tool from the left rail to edit the current sheet.
          </div>

          <div class="flex flex-col gap-1">
            <label
              class="text-[11px] font-mono text-text-faint uppercase tracking-[0.12em]"
            >
              Tool
            </label>
            <div
              class="text-sm"
              :class="
                activePaintTool ? 'text-copper-bright' : 'text-text-faint'
              "
            >
              {{ activePaintTool || 'none' }}
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label
              class="text-[11px] font-mono text-text-faint uppercase tracking-[0.12em]"
            >
              Selection
            </label>
            <div class="font-mono text-[11px] text-text-faint">
              {{
                paintPixelSelection
                  ? `${paintPixelSelection.w}×${paintPixelSelection.h} @ ${paintPixelSelection.x},${paintPixelSelection.y}`
                  : 'none'
              }}
            </div>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                :class="controlButtonClass"
                :disabled="!paintPixelSelection"
                @click="copyPixelSelection()"
              >
                Copy
              </button>
              <button
                type="button"
                :class="controlButtonClass"
                :disabled="!paintPixelSelection"
                @click="cutPixelSelection()"
              >
                Cut
              </button>
              <button
                type="button"
                :class="controlButtonClass"
                :disabled="!hasPaintClipboard"
                @click="pastePixelSelection()"
              >
                Paste
              </button>
              <button
                type="button"
                :class="controlButtonClass"
                :disabled="!paintPixelSelection"
                @click="deletePixelSelection()"
              >
                Delete
              </button>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <button
                type="button"
                :class="controlButtonClass"
                :disabled="!paintPixelSelection"
                @click="flipPixelSelectionHorizontal()"
              >
                Flip H
              </button>
              <button
                type="button"
                :class="controlButtonClass"
                :disabled="!paintPixelSelection"
                @click="flipPixelSelectionVertical()"
              >
                Flip V
              </button>
              <button
                type="button"
                :class="controlButtonClass"
                :disabled="!paintPixelSelection"
                @click="beginRotatePixelSelection()"
              >
                Rotate
              </button>
            </div>
            <div class="font-mono text-[11px] text-text-faint">
              H/V flip, R rotate, Shift snaps, Enter commits, Esc cancels
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label
              class="text-[11px] font-mono text-text-faint uppercase tracking-[0.12em]"
              >Palette</label
            >
            <button
              type="button"
              :class="controlButtonClass"
              @click="handleImportPalette()"
            >
              Import .HEX…
            </button>
            <select
              :model-value="activeProjectPaletteId ?? ''"
              @change="handlePaletteSelection"
            >
              <option value="">Sheet Colors</option>
              <option
                v-for="palette in projectPalettes"
                :key="palette.id"
                :value="palette.id"
              >
                {{ palette.name }} ({{ palette.colors.length }})
              </option>
            </select>
            <div class="font-mono text-[11px] text-text-faint">
              {{
                activeProjectPalette
                  ? `${activeProjectPalette.colors.length} colors`
                  : `${paintPalette.length} sheet colors`
              }}
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label
              class="text-[11px] font-mono text-text-faint uppercase tracking-[0.12em]"
              >Color</label
            >
            <div class="flex items-center gap-2">
              <input
                v-model="activePaintColor"
                type="color"
                class="h-7 w-10 cursor-pointer rounded border border-border bg-transparent p-0"
              />
              <span class="font-mono text-xs text-text-dim">{{
                activePaintColor
              }}</span>
            </div>
            <div class="grid grid-cols-8 gap-1.5">
              <button
                v-for="swatch in availablePaintSwatches"
                :key="swatch"
                type="button"
                class="aspect-square w-full cursor-pointer rounded-sm border border-border p-0"
                :class="{
                  'outline outline-1 outline-offset-1 outline-copper':
                    swatch.toLowerCase() === activePaintColor.toLowerCase(),
                }"
                :style="{ backgroundColor: swatch }"
                :title="swatch"
                @click="activePaintColor = swatch"
              ></button>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label
              class="text-[11px] font-mono text-text-faint uppercase tracking-[0.12em]"
            >
              Brush Size
            </label>
            <input
              v-model.number="paintToolSize"
              type="range"
              min="1"
              max="8"
              step="1"
              :class="controlSliderClass"
            />
            <div class="font-mono text-xs text-text-dim">
              {{ paintToolSize }} px
            </div>
          </div>

          <div class="flex gap-2 pt-1">
            <button
              type="button"
              :class="[controlButtonClass, 'flex-1']"
              @click="undoPaintEdit()"
            >
              Undo
            </button>
            <button
              type="button"
              :class="[controlButtonClass, 'flex-1']"
              @click="redoPaintEdit()"
            >
              Redo
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
