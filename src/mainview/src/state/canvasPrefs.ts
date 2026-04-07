import { ref, watch, type Ref } from 'vue';
import { platform } from '../platform/adapter';
import { spanFilePath, currentSheet } from '../workspace';
import type { WorkspaceSheet } from '../workspace';
import { debouncedSave } from '../persistence';

// --- Interfaces ---

export interface CanvasSheetPrefs {
  gridEnabled: boolean;
  gridWidth: number;
  gridHeight: number;
  zoom: number;
  centerX: number | null;
  centerY: number | null;
}

// --- Constants ---

const CANVAS_PREFS_STORAGE_KEY = 'span-canvas-sheet-prefs:v2';
const CHECKER_STRENGTH_STORAGE_KEY = 'span-canvas-checker-strength:v1';

// --- Late-bound refs from state.ts (avoids circular import) ---

let _canvasGridEnabled: Ref<boolean>;
let _canvasGridWidth: Ref<number>;
let _canvasGridHeight: Ref<number>;
let _canvasCheckerStrength: Ref<number>;
let _zoom: Ref<number>;
let _ZOOM_MIN: number;
let _ZOOM_MAX: number;
let _getViewportCenter: () => { x: number; y: number };
let _getFitZoomForImage: () => (width: number, height: number) => number | null;
let _performSave: () => void;

export function bindCanvasPrefsRefs(refs: {
  canvasGridEnabled: Ref<boolean>;
  canvasGridWidth: Ref<number>;
  canvasGridHeight: Ref<number>;
  canvasCheckerStrength: Ref<number>;
  zoom: Ref<number>;
  ZOOM_MIN: number;
  ZOOM_MAX: number;
  getViewportCenter: () => { x: number; y: number };
  getFitZoomForImage: () => (width: number, height: number) => number | null;
  performSave: () => void;
}) {
  _canvasGridEnabled = refs.canvasGridEnabled;
  _canvasGridWidth = refs.canvasGridWidth;
  _canvasGridHeight = refs.canvasGridHeight;
  _canvasCheckerStrength = refs.canvasCheckerStrength;
  _zoom = refs.zoom;
  _ZOOM_MIN = refs.ZOOM_MIN;
  _ZOOM_MAX = refs.ZOOM_MAX;
  _getViewportCenter = refs.getViewportCenter;
  _getFitZoomForImage = refs.getFitZoomForImage;
  _performSave = refs.performSave;

  // Set up watchers now that refs are bound
  watch(
    [_canvasGridEnabled, _canvasGridWidth, _canvasGridHeight, _zoom],
    () => {
      saveCanvasPrefsForSheetWithOptions(currentSheet.value, { preserveCenter: true });
      if (spanFilePath.value || platform.value === 'web') {
        debouncedSave(_performSave, 250);
      }
    }
  );

  watch(_canvasCheckerStrength, (value) => {
    try {
      localStorage.setItem(
        CHECKER_STRENGTH_STORAGE_KEY,
        String(Math.max(0, Math.min(100, Math.round(value))))
      );
    } catch (e) {
      console.error('Failed to persist checker strength:', e);
    }
  });
}

// --- State ---

export const applyingCanvasPrefs = ref(false);

// --- Functions ---

export function normalizeCanvasPrefs(raw: Partial<CanvasSheetPrefs> | null | undefined): CanvasSheetPrefs {
  const centerX = typeof raw?.centerX === 'number' && Number.isFinite(raw.centerX) ? raw.centerX : null;
  const centerY = typeof raw?.centerY === 'number' && Number.isFinite(raw.centerY) ? raw.centerY : null;
  return {
    gridEnabled: raw?.gridEnabled ?? false,
    gridWidth: Math.max(1, Math.round(raw?.gridWidth ?? 16)),
    gridHeight: Math.max(1, Math.round(raw?.gridHeight ?? 16)),
    zoom: Math.max(_ZOOM_MIN, Math.min(_ZOOM_MAX, Number(raw?.zoom ?? 2))),
    centerX,
    centerY,
  };
}

export function loadCheckerStrength(): number {
  try {
    const raw = localStorage.getItem(CHECKER_STRENGTH_STORAGE_KEY);
    if (!raw) return 35;
    return Math.max(0, Math.min(100, Math.round(Number(raw))));
  } catch {
    return 35;
  }
}

export function getCanvasPrefsMap(): Record<string, CanvasSheetPrefs> {
  try {
    const raw = localStorage.getItem(CANVAS_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function setCanvasPrefsMap(map: Record<string, CanvasSheetPrefs>) {
  try {
    localStorage.setItem(CANVAS_PREFS_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Failed to persist canvas sheet prefs:', e);
  }
}

export function getCanvasPrefsId(sheet: WorkspaceSheet | null): string | null {
  if (!sheet) return null;
  return sheet.absolutePath || sheet.path || null;
}

export function getCurrentCanvasPrefs(): CanvasSheetPrefs {
  const center = _getViewportCenter();
  return normalizeCanvasPrefs({
    gridEnabled: _canvasGridEnabled.value,
    gridWidth: _canvasGridWidth.value,
    gridHeight: _canvasGridHeight.value,
    zoom: _zoom.value,
    centerX: center.x,
    centerY: center.y,
  });
}

export function applyCanvasPrefs(normalized: CanvasSheetPrefs) {
  applyingCanvasPrefs.value = true;
  _canvasGridEnabled.value = normalized.gridEnabled;
  _canvasGridWidth.value = normalized.gridWidth;
  _canvasGridHeight.value = normalized.gridHeight;
  _zoom.value = normalized.zoom;
  applyingCanvasPrefs.value = false;
}

export function loadCanvasPrefsForSheet(sheet: WorkspaceSheet | null): boolean {
  if (sheet?.view) {
    const normalized = normalizeCanvasPrefs(sheet.view);
    sheet.view = normalized;
    applyCanvasPrefs(normalized);
    return false;
  }
  const prefsId = getCanvasPrefsId(sheet);
  const prefs = prefsId ? getCanvasPrefsMap()[prefsId] : null;
  if (prefs) {
    const normalized = normalizeCanvasPrefs(prefs);
    if (sheet) {
      sheet.view = normalized;
    }
    applyCanvasPrefs(normalized);
    return false;
  }

  const inherited = normalizeCanvasPrefs(
    sheet
      ? {
          gridEnabled: _canvasGridEnabled.value,
          gridWidth: _canvasGridWidth.value,
          gridHeight: _canvasGridHeight.value,
          centerX: null,
          centerY: null,
        }
      : null
  );
  if (sheet && sheet.width > 0 && sheet.height > 0) {
    const getFitZoom = _getFitZoomForImage();
    const fitZoom = getFitZoom(sheet.width, sheet.height);
    if (typeof fitZoom === 'number' && Number.isFinite(fitZoom)) {
      inherited.zoom = normalizeCanvasPrefs({ zoom: fitZoom }).zoom;
    }
  }
  if (sheet) {
    sheet.view = inherited;
  }
  applyCanvasPrefs(inherited);
  return !!sheet;
}

export function saveCanvasPrefsForSheet(sheet: WorkspaceSheet | null) {
  saveCanvasPrefsForSheetWithOptions(sheet);
}

export function saveCanvasPrefsForSheetWithOptions(
  sheet: WorkspaceSheet | null,
  options?: { preserveCenter?: boolean }
) {
  if (applyingCanvasPrefs.value) return;
  const preserveCenter = options?.preserveCenter ?? false;
  const existing = sheet?.view ? normalizeCanvasPrefs(sheet.view) : null;
  const viewportCenter = _getViewportCenter();
  const normalized = normalizeCanvasPrefs({
    gridEnabled: _canvasGridEnabled.value,
    gridWidth: _canvasGridWidth.value,
    gridHeight: _canvasGridHeight.value,
    zoom: _zoom.value,
    centerX: preserveCenter ? existing?.centerX ?? null : viewportCenter.x,
    centerY: preserveCenter ? existing?.centerY ?? null : viewportCenter.y,
  });
  if (sheet) {
    sheet.view = normalized;
  }
  const prefsId = getCanvasPrefsId(sheet);
  if (!prefsId) return;
  const map = getCanvasPrefsMap();
  map[prefsId] = normalized;
  setCanvasPrefsMap(map);
}
