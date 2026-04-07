import { computed, ref } from 'vue';
import { activePaintColor } from './toolState';
import { api, platform } from '../platform/adapter';
import type { SpanFilePalette } from '../persistence';

// --- Palette refs ---

export const paintPalette = ref<string[]>([]);
export const projectPalettes = ref<SpanFilePalette[]>([]);
export const activeProjectPaletteId = ref<string | null>(null);

export const activeProjectPalette = computed<SpanFilePalette | null>(
  () => projectPalettes.value.find((palette) => palette.id === activeProjectPaletteId.value) ?? null
);

export const availablePaintSwatches = computed<string[]>(
  () => activeProjectPalette.value?.colors ?? paintPalette.value
);

// --- Palette functions ---

export function setPaintPalette(colors: string[]) {
  paintPalette.value = colors.slice(0, 16);
}

export function setActiveProjectPalette(
  id: string | null,
  markDirty: (isDirty: boolean) => void,
) {
  activeProjectPaletteId.value = id;
  markDirty(true);
}

export function normalizePaletteColorToken(token: string): string | null {
  const trimmed = token.trim();
  const match = trimmed.match(/^#?([0-9a-fA-F]{6})$/);
  if (!match) return null;
  return `#${match[1].toLowerCase()}`;
}

export function parsePaletteHex(raw: string): string[] {
  const colors: string[] = [];
  const seen = new Set<string>();

  for (const token of raw.split(/[\s,]+/)) {
    const color = normalizePaletteColorToken(token);
    if (!color || seen.has(color)) continue;
    seen.add(color);
    colors.push(color);
  }

  return colors;
}

export function slugifyPaletteName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "palette";
}

async function debugPaletteLog(message: string) {
  try {
    if (platform.value === 'desktop') {
      await api.debugLog(`[palette] ${message}`);
    } else {
      console.log('[palette]', message);
    }
  } catch {
    // Ignore debug log failures.
  }
}

export async function importPaletteFromPath(
  path: string,
  persistWorkspaceSnapshotNow: () => Promise<boolean>,
  markDirty: (isDirty: boolean) => void,
  statusText: { value: string },
) {
  try {
    await debugPaletteLog(`import request path=${path}`);

    if (!/\.(hex|txt)$/i.test(path)) {
      statusText.value = 'Select a .hex palette file';
      await debugPaletteLog(`rejected non-palette path=${path}`);
      return;
    }

    const raw = await api.readFile(path);
    await debugPaletteLog(`read ${raw.length} bytes from ${path}`);
    const colors = parsePaletteHex(raw);
    await debugPaletteLog(`parsed ${colors.length} colors from ${path}`);
    if (colors.length === 0) {
      statusText.value = 'No colors found in palette file';
      return;
    }

    const filename = path.split('/').pop() ?? 'palette.hex';
    const baseName = filename.replace(/\.[^.]+$/, '') || 'palette';
    const existing = projectPalettes.value.find((palette) => palette.name === baseName);
    const palette: SpanFilePalette = {
      id: existing?.id ?? `${slugifyPaletteName(baseName)}-${Date.now()}`,
      name: baseName,
      colors,
    };

    projectPalettes.value = existing
      ? projectPalettes.value.map((entry) => (entry.id === existing.id ? palette : entry))
      : [...projectPalettes.value, palette];
    activeProjectPaletteId.value = palette.id;
    activePaintColor.value = palette.colors[0] ?? activePaintColor.value;
    const persisted = await persistWorkspaceSnapshotNow();
    if (!persisted) {
      markDirty(true);
    }
    statusText.value = `Imported palette ${palette.name}`;
    await debugPaletteLog(
      `imported palette name=${palette.name} colors=${palette.colors.length} persisted=${persisted}`
    );
  } catch (e) {
    console.error('Failed to import palette:', e);
    statusText.value = 'Failed to import palette';
    await debugPaletteLog(`import failed path=${path} error=${String(e)}`);
  }
}
