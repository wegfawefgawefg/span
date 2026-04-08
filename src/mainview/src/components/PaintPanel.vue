<script setup lang="ts">
import {
  copyPixelSelection,
  currentSheet,
  cutPixelSelection,
  deletePixelSelection,
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
                class="paint-action-button"
                :disabled="!paintPixelSelection"
                @click="copyPixelSelection()"
              >
                Copy
              </button>
              <button
                type="button"
                class="paint-action-button"
                :disabled="!paintPixelSelection"
                @click="cutPixelSelection()"
              >
                Cut
              </button>
              <button
                type="button"
                class="paint-action-button"
                :disabled="!hasPaintClipboard"
                @click="pastePixelSelection()"
              >
                Paste
              </button>
              <button
                type="button"
                class="paint-action-button"
                :disabled="!paintPixelSelection"
                @click="deletePixelSelection()"
              >
                Delete
              </button>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label
              class="text-[11px] font-mono text-text-faint uppercase tracking-[0.12em]"
              >Palette</label
            >
            <button
              type="button"
              class="paint-action-button"
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
                class="paint-color-input"
              />
              <span class="font-mono text-xs text-text-dim">{{
                activePaintColor
              }}</span>
            </div>
            <div class="paint-swatch-grid">
              <button
                v-for="swatch in availablePaintSwatches"
                :key="swatch"
                type="button"
                class="paint-swatch"
                :class="{
                  active:
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
            />
            <div class="font-mono text-xs text-text-dim">
              {{ paintToolSize }} px
            </div>
          </div>

          <div class="flex gap-2 pt-1">
            <button
              type="button"
              class="paint-action-button flex-1"
              @click="undoPaintEdit()"
            >
              Undo
            </button>
            <button
              type="button"
              class="paint-action-button flex-1"
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

<style scoped>
.paint-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface-2);
  color: var(--color-text);
  font: inherit;
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background-color 0.15s,
    color 0.15s;
}

.paint-action-button:hover {
  border-color: var(--color-copper);
  color: var(--color-copper-bright);
  background: color-mix(
    in srgb,
    var(--color-surface-2) 82%,
    var(--color-copper-glow)
  );
}

.paint-action-button:disabled {
  cursor: default;
  opacity: 0.45;
  color: var(--color-text-faint);
  border-color: var(--color-border);
  background: var(--color-surface-2);
}

.paint-color-input {
  width: 40px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.paint-swatch-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 6px;
}

.paint-swatch {
  width: 100%;
  aspect-ratio: 1;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  cursor: pointer;
}

.paint-swatch.active {
  outline: 1px solid var(--color-copper);
  outline-offset: 1px;
}
</style>
