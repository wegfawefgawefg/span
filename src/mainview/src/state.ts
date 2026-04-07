import { computed, ref, watch } from 'vue';
import {
  bindPaintHistoryRefs,
  editedSheetState,
  ensureEditedSheetState,
  getSheetKey,
  hasUnsavedImageEdits,
  persistSheetImage,
  recordPaintUndoSnapshot,
  applyPaintedSheetImage,
  undoPaintEdit,
  redoPaintEdit,
  savePendingImageEdits,
} from './state/paintHistory';
import { setSelectTool, activeTool, activePaintColor } from './state/toolState';
import {
  paintPalette,
  projectPalettes,
  activeProjectPaletteId,
  activeProjectPalette,
  availablePaintSwatches,
  setPaintPalette,
  setActiveProjectPalette as _setActiveProjectPalette,
  importPaletteFromPath as _importPaletteFromPath,
} from './state/paletteState';
import {
  bindSpecStateRefs,
  activeSpec,
  activeSpecRaw,
  specFilePath,
  loadSpec,
  applySpecFromEditor,
  forceApplySpec,
  importSpecFromPath,
  resetToDefaultSpec,
  resolveProjectSpecForWorkspace,
  debouncedSaveSpecFile,
  saveSpecFileNow,
  defaultProjectSpecPathForWorkspace,
  makeWorkspaceRelativePath,
} from './state/specState';
import type { Annotation } from './annotation';
import {
  createAnnotation,
  duplicateAnnotation,
  clampToImage,
  createAnnotationWithSize,
} from './annotation';
import {
  getEntityByLabel,
} from './spec/types';
import { api, platform } from './platform/adapter';
// saveImage moved to state/paintHistory.ts
import {
  sheets,
  currentSheet,
  workspaceReady,
  effectiveRoot,
  spanFilePath,
  openSheetByPath,
  removeSheet,
  clearSheets,
  addSheet,
  resetWorkspace,
} from './workspace';
import type { WorkspaceSheet } from './workspace';
import {
  serializeWorkspace,
  deserializeWorkspace,
  debouncedSave,
} from './persistence';
import { exportToString, type ExportEntry } from './export';

// Re-export workspace state for consumers
export {
  sheets,
  currentSheet,
  workspaceReady,
  effectiveRoot,
  spanFilePath,
  openSheetByPath,
  removeSheet,
  clearSheets,
  addSheet,
  resetWorkspace,
};
export type { WorkspaceSheet };

// Re-export palette state for consumers
export {
  paintPalette,
  projectPalettes,
  activeProjectPaletteId,
  activeProjectPalette,
  availablePaintSwatches,
  setPaintPalette,
};

// Re-export spec state for consumers
export {
  activeSpec,
  activeSpecRaw,
  specFilePath,
  loadSpec,
  applySpecFromEditor,
  forceApplySpec,
  importSpecFromPath,
};

// Re-export paint history state for consumers
export {
  hasUnsavedImageEdits,
  recordPaintUndoSnapshot,
  applyPaintedSheetImage,
  undoPaintEdit,
  redoPaintEdit,
};

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 32;
export const ZOOM_FACTOR = 1.25;

// --- Core state ---

export const selectedId = ref<string | null>(null);
export const zoom = ref(2);
export const dirty = ref(false);
export const statusText = ref('Ready');
export const canvasGridEnabled = ref(false);
export const canvasGridWidth = ref(16);
export const canvasGridHeight = ref(16);
export const currentSheetImageSrc = ref<string>('');
export const imageWidth = ref(0);
export const imageHeight = ref(0);

// Wire up refs needed by paintHistory (avoids circular import)
bindPaintHistoryRefs({ currentSheetImageSrc, imageWidth, imageHeight, statusText });

const CANVAS_PREFS_STORAGE_KEY = 'span-canvas-sheet-prefs:v2';
const CHECKER_STRENGTH_STORAGE_KEY = 'span-canvas-checker-strength:v1';

interface CanvasSheetPrefs {
  gridEnabled: boolean;
  gridWidth: number;
  gridHeight: number;
  zoom: number;
  centerX: number | null;
  centerY: number | null;
}

function normalizeCanvasPrefs(raw: Partial<CanvasSheetPrefs> | null | undefined): CanvasSheetPrefs {
  const centerX = typeof raw?.centerX === 'number' && Number.isFinite(raw.centerX) ? raw.centerX : null;
  const centerY = typeof raw?.centerY === 'number' && Number.isFinite(raw.centerY) ? raw.centerY : null;
  return {
    gridEnabled: raw?.gridEnabled ?? false,
    gridWidth: Math.max(1, Math.round(raw?.gridWidth ?? 16)),
    gridHeight: Math.max(1, Math.round(raw?.gridHeight ?? 16)),
    zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(raw?.zoom ?? 2))),
    centerX,
    centerY,
  };
}

function loadCheckerStrength(): number {
  try {
    const raw = localStorage.getItem(CHECKER_STRENGTH_STORAGE_KEY);
    if (!raw) return 35;
    return Math.max(0, Math.min(100, Math.round(Number(raw))));
  } catch {
    return 35;
  }
}

export const canvasCheckerStrength = ref(loadCheckerStrength());
let getFitZoomForImage: (width: number, height: number) => number | null = () => null;

function getPersistedSelectedAnnotationId(): string | null {
  const sheet = currentSheet.value;
  if (!sheet || !selectedId.value) return null;
  return sheet.annotations.some((annotation) => annotation.id === selectedId.value)
    ? selectedId.value
    : null;
}

function scheduleWorkspaceUiStateSave() {
  if (spanFilePath.value || platform.value === 'web') {
    debouncedSave(performSave, 250);
  }
}


function getCanvasPrefsMap(): Record<string, CanvasSheetPrefs> {
  try {
    const raw = localStorage.getItem(CANVAS_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function setCanvasPrefsMap(map: Record<string, CanvasSheetPrefs>) {
  try {
    localStorage.setItem(CANVAS_PREFS_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Failed to persist canvas sheet prefs:', e);
  }
}

function getCanvasPrefsId(sheet: WorkspaceSheet | null): string | null {
  if (!sheet) return null;
  return sheet.absolutePath || sheet.path || null;
}

function getCurrentCanvasPrefs(): CanvasSheetPrefs {
  const center = getViewportCenter();
  return normalizeCanvasPrefs({
    gridEnabled: canvasGridEnabled.value,
    gridWidth: canvasGridWidth.value,
    gridHeight: canvasGridHeight.value,
    zoom: zoom.value,
    centerX: center.x,
    centerY: center.y,
  });
}

function applyCanvasPrefs(normalized: CanvasSheetPrefs) {
  applyingCanvasPrefs.value = true;
  canvasGridEnabled.value = normalized.gridEnabled;
  canvasGridWidth.value = normalized.gridWidth;
  canvasGridHeight.value = normalized.gridHeight;
  zoom.value = normalized.zoom;
  applyingCanvasPrefs.value = false;
}

function loadCanvasPrefsForSheet(sheet: WorkspaceSheet | null): boolean {
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
          gridEnabled: canvasGridEnabled.value,
          gridWidth: canvasGridWidth.value,
          gridHeight: canvasGridHeight.value,
          centerX: null,
          centerY: null,
        }
      : null
  );
  if (sheet && sheet.width > 0 && sheet.height > 0) {
    const fitZoom = getFitZoomForImage(sheet.width, sheet.height);
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

function saveCanvasPrefsForSheet(sheet: WorkspaceSheet | null) {
  saveCanvasPrefsForSheetWithOptions(sheet);
}

function saveCanvasPrefsForSheetWithOptions(
  sheet: WorkspaceSheet | null,
  options?: { preserveCenter?: boolean }
) {
  if (applyingCanvasPrefs.value) return;
  const preserveCenter = options?.preserveCenter ?? false;
  const existing = sheet?.view ? normalizeCanvasPrefs(sheet.view) : null;
  const viewportCenter = getViewportCenter();
  const normalized = normalizeCanvasPrefs({
    gridEnabled: canvasGridEnabled.value,
    gridWidth: canvasGridWidth.value,
    gridHeight: canvasGridHeight.value,
    zoom: zoom.value,
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

const applyingCanvasPrefs = ref(false);

// Wire up refs needed by specState (avoids circular import)
bindSpecStateRefs({ statusText, markDirty, debouncedSave: debouncedSave, performSave });

export const paintPixelSelection = ref<{ x: number; y: number; w: number; h: number } | null>(null);
export const hasPaintClipboard = ref(false);

// Paint history interfaces, state, and functions are in ./state/paintHistory.ts


let copyPixelSelectionHandler: () => boolean = () => false;
let cutPixelSelectionHandler: () => boolean = () => false;
let pastePixelSelectionHandler: () => boolean = () => false;
let deletePixelSelectionHandler: () => boolean = () => false;
let resizeCanvasHandler: (width: number, height: number) => boolean = () => false;

export function registerPaintClipboardHandlers(handlers: {
  copy: () => boolean;
  cut: () => boolean;
  paste: () => boolean;
  deleteSelection: () => boolean;
}) {
  copyPixelSelectionHandler = handlers.copy;
  cutPixelSelectionHandler = handlers.cut;
  pastePixelSelectionHandler = handlers.paste;
  deletePixelSelectionHandler = handlers.deleteSelection;
}

export function copyPixelSelection() {
  return copyPixelSelectionHandler();
}

export function cutPixelSelection() {
  return cutPixelSelectionHandler();
}

export function pastePixelSelection() {
  return pastePixelSelectionHandler();
}

export function deletePixelSelection() {
  return deletePixelSelectionHandler();
}

export function registerResizeCanvasHandler(handler: (width: number, height: number) => boolean) {
  resizeCanvasHandler = handler;
}

export function getCurrentSheetCanvasSize() {
  return {
    width: currentSheet.value?.width ?? imageWidth.value,
    height: currentSheet.value?.height ?? imageHeight.value,
  };
}

export function resizeCurrentSheetCanvas(width: number, height: number) {
  return resizeCanvasHandler(width, height);
}

export function setActiveProjectPalette(id: string | null) {
  _setActiveProjectPalette(id, markDirty);
}

async function persistWorkspaceSnapshotNow() {
  const spec = activeSpec.value;
  if (!spec) return false;

  const data = serializeWorkspace(
    sheets.value,
    activeSpecRaw.value,
    projectPalettes.value,
    activeProjectPaletteId.value,
    makeWorkspaceRelativePath(specFilePath.value, spanFilePath.value),
    currentSheet.value?.path ?? null,
    getPersistedSelectedAnnotationId(),
  );

  if (platform.value === 'desktop' && spanFilePath.value) {
    await api.writeFile(spanFilePath.value, data);
    if (specFilePath.value) {
      debouncedSaveSpecFile();
    }
    dirty.value = false;
    return true;
  }

  if (platform.value === 'web') {
    localStorage.setItem('span-workspace', data);
    dirty.value = false;
    return true;
  }

  return false;
}

export async function importPaletteFromPath(path: string) {
  await _importPaletteFromPath(path, persistWorkspaceSnapshotNow, markDirty, statusText);
}

// recordPaintUndoSnapshot, applyPaintedSheetImage, undoPaintEdit,
// redoPaintEdit, savePendingImageEdits are now in ./state/paintHistory.ts

// Per-entity preview shape override (entityLabel → shapeName)
// Used by GalleryPanel to know which shape to clip for thumbnails
export const previewShapeOverride = ref<Record<string, string>>({});

/** Get the preview shape name for an entity. Returns override if set, else first rect shape. */
export function getPreviewShapeName(entityLabel: string): string | null {
  const spec = activeSpec.value;
  if (!spec) return null;
  const entity = getEntityByLabel(spec, entityLabel);
  if (!entity) return null;
  return entity.primaryShape.kind === 'rect' ? 'aabb' : null;
}

export function setPreviewShape(entityLabel: string, shapeName: string) {
  previewShapeOverride.value = {
    ...previewShapeOverride.value,
    [entityLabel]: shapeName,
  };
}

// --- Derived ---

/** Annotations for the current sheet (read-only computed). Mutate via currentSheet.value.annotations directly. */
export const annotations = computed<Annotation[]>(
  () => currentSheet.value?.annotations ?? []
);

export const selectedAnnotation = computed<Annotation | null>(
  () => annotations.value.find((a) => a.id === selectedId.value) ?? null
);

/** Fulfill a missing sheet with image data. Replaces the object to trigger Vue reactivity. */
export function fulfillSheet(
  sheet: WorkspaceSheet,
  imageUrl: string,
  width: number,
  height: number
) {
  const idx = sheets.value.indexOf(sheet);
  if (idx === -1) return;

  const fulfilled: WorkspaceSheet = {
    ...sheet,
    imageUrl,
    width,
    height,
    status: 'loaded',
  };
  sheets.value.splice(idx, 1, fulfilled);
  persistSheetImage(fulfilled);

  // If this was the active sheet, update canvas
  if (currentSheet.value === sheet) {
    currentSheet.value = fulfilled;
  }

  ensureEditedSheetState(fulfilled);
}

// Persist images when sheets are added
watch(sheets, (newSheets, oldSheets) => {
  const oldPaths = new Set((oldSheets ?? []).map((s) => s.path));
  for (const sheet of newSheets) {
    if (!oldPaths.has(sheet.path)) {
      ensureEditedSheetState(sheet);
      if (platform.value === 'web') {
        persistSheetImage(sheet);
      }
    }
  }
});

// --- Watch currentSheet to load image ---

watch(currentSheet, async (sheet, previousSheet) => {
  if (previousSheet) {
    saveCanvasPrefsForSheet(previousSheet);
  }

  if (!sheet) {
    currentSheetImageSrc.value = '';
    imageWidth.value = 0;
    imageHeight.value = 0;
    loadCanvasPrefsForSheet(null);
    return;
  }

  // Use the sheet's imageUrl (already a data URL or blob URL)
  currentSheetImageSrc.value = sheet.imageUrl;
  imageWidth.value = sheet.width;
  imageHeight.value = sheet.height;
  const seededView = loadCanvasPrefsForSheet(sheet);
  if (seededView && (spanFilePath.value || platform.value === 'web')) {
    debouncedSave(performSave, 250);
  }

  const key = getSheetKey(sheet);
  if (key && editedSheetState.value[key]?.dirty) {
    statusText.value = `${sheet.path} • Image edits pending save`;
    return;
  }

  markDirty(false);
  scheduleWorkspaceUiStateSave();
}, { flush: 'sync' });

watch(
  [
    canvasGridEnabled,
    canvasGridWidth,
    canvasGridHeight,
    zoom,
  ],
  () => {
    saveCanvasPrefsForSheetWithOptions(currentSheet.value, { preserveCenter: true });
    if (spanFilePath.value || platform.value === 'web') {
      debouncedSave(performSave, 250);
    }
  }
);

watch(canvasCheckerStrength, (value) => {
  try {
    localStorage.setItem(
      CHECKER_STRENGTH_STORAGE_KEY,
      String(Math.max(0, Math.min(100, Math.round(value))))
    );
  } catch (e) {
    console.error('Failed to persist checker strength:', e);
  }
});

// --- Viewport center callback (set by CanvasView on mount) ---

let getViewportCenter: () => { x: number; y: number } = () => ({
  x: 0,
  y: 0,
});

export function registerViewportCenterFn(fn: () => { x: number; y: number }) {
  getViewportCenter = fn;
}

export function persistCurrentCanvasViewport() {
  saveCanvasPrefsForSheet(currentSheet.value);
  if (spanFilePath.value || platform.value === 'web') {
    debouncedSave(performSave, 250);
  }
}

export function registerFitZoomFn(fn: (width: number, height: number) => number | null) {
  getFitZoomForImage = fn;
}

/** Called from desktop menu handler — passes current viewport center */
export function addAnnotationAtViewportCenter() {
  const center = getViewportCenter();
  addAnnotation(center.x, center.y);
}

// --- Autosave wiring ---

function performSave() {
  const spec = activeSpec.value;
  if (!spec) {
    console.log('[performSave] no spec, skipping');
    return;
  }

  const data = serializeWorkspace(
    sheets.value,
    activeSpecRaw.value,
    projectPalettes.value,
    activeProjectPaletteId.value,
    makeWorkspaceRelativePath(specFilePath.value, spanFilePath.value),
    currentSheet.value?.path ?? null,
    getPersistedSelectedAnnotationId(),
  );

  console.log(
    '[performSave] platform:',
    platform.value,
    'spanFilePath:',
    spanFilePath.value,
    'data length:',
    data.length
  );

  if (platform.value === 'desktop' && spanFilePath.value) {
    if (specFilePath.value) {
      debouncedSaveSpecFile();
    }
    api
      .writeFile(spanFilePath.value, data)
      .then(() => {
        markDirty(false);
        console.log('[performSave] saved to', spanFilePath.value);
      })
      .catch((e) => {
        console.error('[performSave] save failed:', e);
        statusText.value = 'Save failed';
      });
  } else if (platform.value === 'web') {
    try {
      localStorage.setItem('span-workspace', data);
      markDirty(false);
    } catch (e) {
      console.error('localStorage save failed:', e);
    }
  }
}

// --- Actions ---

export function selectAnnotation(id: string | null) {
  selectedId.value = id;
  scheduleWorkspaceUiStateSave();
}

export function reorderAnnotation(fromId: string, toId: string) {
  const sheet = currentSheet.value;
  if (!sheet) return;
  const arr = sheet.annotations;
  const fromIdx = arr.findIndex((a) => a.id === fromId);
  const toIdx = arr.findIndex((a) => a.id === toId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
  const [item] = arr.splice(fromIdx, 1);
  arr.splice(toIdx, 0, item);
  markDirty(true);
}

export function markDirty(isDirty: boolean) {
  dirty.value = isDirty;
  const sheet = currentSheet.value;
  if (!sheet) {
    statusText.value = isDirty ? 'Unsaved changes' : 'Ready';
    return;
  }
  statusText.value = `${sheet.path} \u2022 ${isDirty ? 'Unsaved changes' : 'Saved'}`;

  if (isDirty) {
    debouncedSave(performSave);
  }
}

export function closeProject() {
  resetWorkspace();
  editedSheetState.value = {};
  projectPalettes.value = [];
  activeProjectPaletteId.value = null;
  paintPalette.value = [];
  paintPixelSelection.value = null;
  hasPaintClipboard.value = false;
  setSelectTool();
  specFilePath.value = null;
  resetToDefaultSpec(null);
  selectedId.value = null;
  dirty.value = false;
  statusText.value = 'Closed project';
}

export function addAnnotation(x: number = 0, y: number = 0) {
  const spec = activeSpec.value;
  const tool = activeTool.value;
  const sheet = currentSheet.value;
  if (!spec || !tool || !getEntityByLabel(spec, tool) || !sheet) return;

  const annotation = createAnnotation(spec, tool, { x, y });
  sheet.annotations.push(annotation);
  selectedId.value = annotation.id;
  markDirty(true);
}

export function addAnnotationWithSize(
  entityType: string,
  x: number,
  y: number,
  ...sizeArgs: number[]
) {
  const spec = activeSpec.value;
  const sheet = currentSheet.value;
  if (!spec || !getEntityByLabel(spec, entityType) || !sheet) return;

  const entity = getEntityByLabel(spec, entityType)!;
  const isRect = entity.primaryShape.kind === 'rect';

  let annotation;
  if (isRect && sizeArgs.length >= 2) {
    annotation = createAnnotationWithSize(
      spec,
      entityType,
      { x, y },
      {
        width: sizeArgs[0],
        height: sizeArgs[1],
      }
    );
  } else {
    annotation = createAnnotation(spec, entityType, { x, y });
  }

  sheet.annotations.push(annotation);
  selectedId.value = annotation.id;
  markDirty(true);
}

export function duplicateSelected() {
  const ann = selectedAnnotation.value;
  const sheet = currentSheet.value;
  if (!ann || !sheet) return;
  const copy = duplicateAnnotation(ann, activeSpec.value ?? undefined);
  sheet.annotations.push(copy);
  selectedId.value = copy.id;
  markDirty(true);
}

export function deleteSelected() {
  const sheet = currentSheet.value;
  if (!selectedId.value || !sheet) return;
  sheet.annotations = sheet.annotations.filter(
    (a) => a.id !== selectedId.value
  );
  selectedId.value = sheet.annotations[0]?.id ?? null;
  markDirty(true);
}

export function updateShapeData(
  shapeName: string,
  patch: Record<string, number>
) {
  const ann = selectedAnnotation.value;
  if (!ann) return;
  if (shapeName === 'aabb' && ann.aabb) {
    Object.assign(ann.aabb, patch);
  } else if (shapeName === 'point' && ann.point) {
    Object.assign(ann.point, patch);
  }
  markDirty(true);
}

export function updatePropertyData(patch: Record<string, unknown>) {
  const ann = selectedAnnotation.value;
  if (!ann) return;
  Object.assign(ann.properties, patch);
  markDirty(true);
}

export function clampAnnotationToImage(
  annotation: Annotation,
  imgW: number = imageWidth.value,
  imgH: number = imageHeight.value
) {
  clampToImage(annotation, imgW, imgH);
}

export async function importSheetFromPath(path: string) {
  try {
    const dataUrl = await api.readImageAsDataUrl(path);
    const dims = await new Promise<{ width: number; height: number }>(
      (resolve) => {
        const img = new Image();
        img.onload = () =>
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = dataUrl;
      }
    );
    const name = path.split('/').pop() ?? path;

    // Fulfill a missing sheet if one matches
    const missing = sheets.value.find(
      (s) => s.status === 'missing' && s.path.split('/').pop() === name
    );
    if (missing) {
      fulfillSheet(missing, dataUrl, dims.width, dims.height);
    } else {
      addSheet({
        path: name,
        absolutePath: path,
        annotations: [],
        status: 'loaded',
        imageUrl: dataUrl,
        width: dims.width,
        height: dims.height,
      });
      ensureEditedSheetState(sheets.value[sheets.value.length - 1]);
    }
  } catch (e) {
    console.error('Failed to import sheet:', e);
    statusText.value = 'Failed to import image';
  }
}

export async function importSheetsFromPaths(paths: string[]) {
  let imported = 0;

  for (const path of paths) {
    const before = sheets.value.length;
    await importSheetFromPath(path);
    if (sheets.value.length > before) {
      imported += 1;
    }
  }

  if (imported > 0) {
    statusText.value = `Imported ${imported} image${imported === 1 ? '' : 's'}`;
  } else if (paths.length > 0) {
    statusText.value = 'No new images imported';
  }
}

export async function openProjectDirectory(
  workspacePath: string,
  paths: string[]
) {
  resetWorkspace();
  selectedId.value = null;
  editedSheetState.value = {};
  projectPalettes.value = [];
  activeProjectPaletteId.value = null;
  paintPalette.value = [];
  paintPixelSelection.value = null;
  hasPaintClipboard.value = false;
  spanFilePath.value = workspacePath.endsWith('.span')
    ? workspacePath
    : workspacePath + '.span';
  await resolveProjectSpecForWorkspace(spanFilePath.value, null, null);

  await importSheetsFromPaths(paths);

  if (sheets.value.length > 0) {
    currentSheet.value = sheets.value[0];
  }

  await saveWorkspaceAs(spanFilePath.value);
  const parts = workspacePath.split('/');
  statusText.value = `Opened project ${parts[parts.length - 3] ?? parts[parts.length - 1]}`;
}

// --- Export ---

export async function exportWorkspace(dialogPath?: string) {
  console.log('[exportWorkspace] called, dialogPath:', dialogPath);
  const spec = activeSpec.value;
  if (!spec) {
    console.log('[exportWorkspace] no spec loaded');
    statusText.value = 'No spec loaded — cannot export';
    return;
  }

  const entries: ExportEntry[] = sheets.value.flatMap((s) =>
    s.annotations.map((a) => ({
      annotation: a,
      sheetFile: s.path.split('/').pop() ?? s.path,
    }))
  );
  console.log(
    '[exportWorkspace] entries:',
    entries.length,
    'format:',
    spec.format
  );
  const output = exportToString(entries, spec);
  console.log('[exportWorkspace] output length:', output.length);

  const ext = spec.format === 'yaml' ? 'yaml' : 'json';
  const defaultName = `annotations.${ext}`;

  await doExportWrite(output, defaultName, dialogPath);
}

export async function exportSpec(dialogPath?: string) {
  const spec = activeSpecRaw.value;
  if (!spec) {
    statusText.value = 'No spec loaded — cannot export';
    return;
  }

  const defaultName =
    specFilePath.value?.split('/').pop() ??
    `spec.${spec.format === 'json' ? 'json' : 'yaml'}`;

  let savePath = dialogPath;
  if (!savePath) {
    savePath = await api.showSaveDialog(defaultName, [
      { name: 'YAML files', extensions: ['yaml', 'yml'] },
      { name: 'JSON files', extensions: ['json'] },
    ]);
  }
  if (!savePath) return;

  try {
    await api.writeFile(savePath, spec.raw);
    statusText.value = `Exported spec to ${savePath.split('/').pop()}`;
  } catch (e) {
    console.error('Spec export failed:', e);
    statusText.value = 'Spec export failed';
  }
}

/** Write export output — on desktop uses a dialog path passed from backend, on web triggers download. */
export async function doExportWrite(
  output: string,
  defaultName: string,
  dialogPath?: string
) {
  let savePath: string;
  if (platform.value === 'web') {
    savePath = defaultName;
  } else if (dialogPath) {
    savePath = dialogPath;
  } else {
    // Fallback: show dialog from webview (used if called directly)
    const path = await api.showSaveDialog(defaultName, []);
    if (!path) return;
    savePath = path;
  }

  try {
    await api.writeFile(savePath, output);
    statusText.value = `Exported to ${savePath.split('/').pop()}`;
  } catch (e) {
    console.error('Export failed:', e);
    statusText.value = 'Export failed';
  }
}

// --- Save / Save As / Open ---

export async function saveWorkspace(): Promise<{ needsSaveAs: boolean }> {
  // On web, always save to localStorage (no file path needed)
  if (platform.value === 'web') {
    performSave();
    return { needsSaveAs: false };
  }
  if (!spanFilePath.value) {
    return { needsSaveAs: true };
  }
  try {
    await savePendingImageEdits();
    performSave();
  } catch (e) {
    console.error('Save failed:', e);
    statusText.value = 'Save failed';
  }
  return { needsSaveAs: false };
}

export async function saveWorkspaceAs(dialogPath?: string) {
  console.log('[saveWorkspaceAs] called, dialogPath:', dialogPath);
  let savePath = dialogPath;
  if (!savePath) {
    if (platform.value === 'web') {
      // Web: trigger download with default name
      savePath = 'workspace.span';
    } else {
      const selected = await api.showSaveDialog('workspace.span', [
        { name: 'Span files', extensions: ['span'] },
      ]);
      if (!selected) return;
      savePath = selected;
    }
  }

  savePath = savePath.endsWith('.span') ? savePath : savePath + '.span';
  spanFilePath.value = savePath;
  if (!specFilePath.value) {
    specFilePath.value = defaultProjectSpecPathForWorkspace(savePath);
  }
  console.log('[saveWorkspaceAs] saving to:', savePath);

  const data = serializeWorkspace(
    sheets.value,
    activeSpecRaw.value,
    projectPalettes.value,
    activeProjectPaletteId.value,
    makeWorkspaceRelativePath(specFilePath.value, savePath),
    currentSheet.value?.path ?? null,
    getPersistedSelectedAnnotationId(),
  );
  console.log('[saveWorkspaceAs] data length:', data.length);

  try {
    await savePendingImageEdits();
    await api.writeFile(savePath, data);
    await saveSpecFileNow();
    console.log('[saveWorkspaceAs] write succeeded');
    markDirty(false);
    statusText.value = `Saved to ${savePath.split('/').pop()}`;
  } catch (e) {
    console.error('Save As failed:', e);
    statusText.value = 'Save failed';
  }
}

export async function openWorkspace(dialogPath?: string) {
  const path =
    dialogPath ??
    (await api.showOpenDialog([{ name: 'Span files', extensions: ['span'] }]));
  if (!path) return;
  await loadWorkspaceFromPath(path);
}

export async function loadWorkspaceFromPath(path: string) {
  try {
    const raw = await api.readFile(path);
    await restoreWorkspace(raw, path);
  } catch (e) {
    console.error('Failed to open .span file:', e);
    statusText.value = 'Failed to open .span file';
  }
}

export async function restoreWorkspace(raw: string, filePath?: string) {
  const data = deserializeWorkspace(raw);

  // Reset and load sheets
  resetWorkspace();
  selectedId.value = null;
  editedSheetState.value = {};
  paintPixelSelection.value = null;
  hasPaintClipboard.value = false;
  projectPalettes.value = data.palettes ?? [];
  activeProjectPaletteId.value =
    data.activePaletteId && projectPalettes.value.some((palette) => palette.id === data.activePaletteId)
      ? data.activePaletteId
      : null;
  if (filePath) {
    spanFilePath.value = filePath;
  }
  await resolveProjectSpecForWorkspace(filePath ?? null, data.specPath ?? null, data.spec);

  const fileDir = filePath ? filePath.replace(/\/[^/]+$/, '') : '';
  const dir = fileDir.endsWith('/.span')
    ? fileDir.slice(0, -'/.span'.length)
    : fileDir;
  let prunedMissingEmptySheets = false;

  for (const sheet of data.sheets) {
    // Resolve sheet path relative to .span file
    let imgPath = sheet.path;
    if (dir && !imgPath.startsWith('/')) {
      imgPath = dir + '/' + imgPath;
    }

    let loaded = false;
    // Try direct path, then filename search in .span file directory
    const candidates = [imgPath];
    if (dir) {
      const filename = sheet.path.split('/').pop() ?? sheet.path;
      const searchPath = dir + '/' + filename;
      if (searchPath !== imgPath) candidates.push(searchPath);
    }

    for (const candidate of candidates) {
      try {
        const dataUrl = await api.readImageAsDataUrl(candidate);
        const dims = await new Promise<{ width: number; height: number }>(
          (resolve) => {
            const img = new Image();
            img.onload = () =>
              resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => resolve({ width: 0, height: 0 });
            img.src = dataUrl;
          }
        );

        addSheet({
          path: sheet.path,
          absolutePath: candidate,
          annotations: sheet.annotations,
          ...(sheet.view ? { view: sheet.view } : {}),
          status: 'loaded',
          imageUrl: dataUrl,
          width: dims.width,
          height: dims.height,
        });
        ensureEditedSheetState(sheets.value[sheets.value.length - 1]);
        loaded = true;
        break;
      } catch {
        // Try next candidate
      }
    }

    if (!loaded) {
      if ((sheet.annotations?.length ?? 0) === 0) {
        prunedMissingEmptySheets = true;
        continue;
      }
      addSheet({
        path: sheet.path,
        absolutePath: imgPath,
        annotations: sheet.annotations,
        ...(sheet.view ? { view: sheet.view } : {}),
        status: 'missing',
        imageUrl: '',
        width: 0,
        height: 0,
      });
      ensureEditedSheetState(sheets.value[sheets.value.length - 1]);
    }
  }

  const selectedAnnotationSheet =
    data.selectedAnnotationId
      ? sheets.value.find((sheet) =>
          sheet.annotations.some((annotation) => annotation.id === data.selectedAnnotationId)
        ) ?? null
      : null;
  const lastOpenSheet =
    data.lastOpenSheetPath
      ? sheets.value.find((sheet) => sheet.path === data.lastOpenSheetPath) ?? null
      : null;

  currentSheet.value = selectedAnnotationSheet ?? lastOpenSheet ?? sheets.value[0] ?? null;
  selectedId.value =
    currentSheet.value && data.selectedAnnotationId
      && currentSheet.value.annotations.some((annotation) => annotation.id === data.selectedAnnotationId)
      ? data.selectedAnnotationId
      : null;
  markDirty(false);
  statusText.value = filePath
    ? `Opened ${filePath.split('/').pop()}${prunedMissingEmptySheets ? ' • pruned stale missing sheets' : ''}`
    : `Workspace restored${prunedMissingEmptySheets ? ' • pruned stale missing sheets' : ''}`;

  if (prunedMissingEmptySheets && (spanFilePath.value || platform.value === 'web')) {
    debouncedSave(performSave, 50);
  }
}
