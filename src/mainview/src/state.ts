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
} from './state/paintHistory';
import { setSelectTool, activeTool, activePaintTool, activeAtlasTool, activePaintColor } from './state/toolState';
import {
  paintPalette,
  projectPalettes,
  activeProjectPaletteId,
  activeProjectPalette,
  availablePaintSwatches,
  setPaintPalette,
  setActiveProjectPalette as _setActiveProjectPalette,
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
  debouncedSaveSpecFile,
  makeWorkspaceRelativePath,
} from './state/specState';
import {
  bindCanvasPrefsRefs,
  loadCheckerStrength,
  loadCanvasPrefsForSheet,
  saveCanvasPrefsForSheet,
} from './state/canvasPrefs';
import {
  selectedId,
  selectedIds,
  selectedAnnotation,
  selectedAnnotations,
  selectedAnnotationsInCurrentSheet,
  selectSingleAnnotation,
  setSelectedAnnotationIds as applySelectedAnnotationIds,
  setSelectedProjectAnnotationIds,
  toggleSelectedAnnotation,
  retainSelectionForWorkspace,
} from './state/selectionState';
export type { CanvasSheetPrefs } from './state/canvasPrefs';
export {
  applyingCanvasPrefs,
  normalizeCanvasPrefs,
  loadCheckerStrength,
  getCanvasPrefsMap,
  setCanvasPrefsMap,
  getCanvasPrefsId,
  getCurrentCanvasPrefs,
  applyCanvasPrefs,
  loadCanvasPrefsForSheet,
  saveCanvasPrefsForSheet,
  saveCanvasPrefsForSheetWithOptions,
} from './state/canvasPrefs';
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
  debouncedSave,
} from './persistence';
import {
  bindIoStateRefs,
  importSheetFromPath,
  importSheetsFromPaths,
  importPaletteFromPath,
  openProjectDirectory,
  exportWorkspace,
  exportSpec,
  doExportWrite,
  saveWorkspace,
  saveWorkspaceAs,
  openWorkspace,
  loadWorkspaceFromPath,
  restoreWorkspace,
  persistWorkspaceSnapshotNow,
} from './state/ioState';

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

// Re-export ioState for consumers
export {
  importSheetFromPath,
  importSheetsFromPaths,
  importPaletteFromPath,
  openProjectDirectory,
  exportWorkspace,
  exportSpec,
  doExportWrite,
  saveWorkspace,
  saveWorkspaceAs,
  openWorkspace,
  loadWorkspaceFromPath,
  restoreWorkspace,
  persistWorkspaceSnapshotNow,
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

// Re-export tool state for consumers
export {
  activeTool,
  activePaintTool,
  activeAtlasTool,
  activePaintColor,
  setSelectTool,
};

// Re-export selection state for consumers
export {
  selectedId,
  selectedIds,
  selectedAnnotation,
  selectedAnnotations,
  selectedAnnotationsInCurrentSheet,
};

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 32;
export const ZOOM_FACTOR = 1.25;

// --- Core state ---

export const zoom = ref(2);
export const dirty = ref(false);
export const statusText = ref('Ready');
export const canvasGridEnabled = ref(false);
export const canvasGridWidth = ref(16);
export const canvasGridHeight = ref(16);
export const currentSheetImageSrc = ref<string>('');
export const imageWidth = ref(0);
export const imageHeight = ref(0);
export const exportFilePath = ref<string | null>(null);

bindPaintHistoryRefs({
  currentSheetImageSrc,
  imageWidth,
  imageHeight,
  statusText,
  selectedId,
  selectedIds,
  markDirty,
});
export const canvasCheckerStrength = ref(loadCheckerStrength());
let _getFitZoomForImage: (width: number, height: number) => number | null = () => null;

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



// Wire up refs needed by specState (avoids circular import)
bindSpecStateRefs({ statusText, markDirty, debouncedSave: debouncedSave, performSave });

// Wire up refs needed by canvasPrefs (avoids circular import)
bindCanvasPrefsRefs({
  canvasGridEnabled,
  canvasGridWidth,
  canvasGridHeight,
  canvasCheckerStrength,
  zoom,
  ZOOM_MIN,
  ZOOM_MAX,
  getViewportCenter: () => getViewportCenter(),
  getFitZoomForImage: () => _getFitZoomForImage,
  performSave,
});

export const paintPixelSelection = ref<{ x: number; y: number; w: number; h: number } | null>(null);
export const hasPaintClipboard = ref(false);

// Paint history interfaces, state, and functions are in ./state/paintHistory.ts


let copyPixelSelectionHandler: () => boolean = () => false;
let cutPixelSelectionHandler: () => boolean = () => false;
let pastePixelSelectionHandler: () => boolean = () => false;
let deletePixelSelectionHandler: () => boolean = () => false;
let copySpriteSelectionHandler: () => boolean = () => false;
let cutSpriteSelectionHandler: () => boolean = () => false;
let pasteSpriteSelectionHandler: () => boolean = () => false;
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

export function registerSpriteClipboardHandlers(handlers: {
  copy: () => boolean;
  cut: () => boolean;
  paste: () => boolean;
}) {
  copySpriteSelectionHandler = handlers.copy;
  cutSpriteSelectionHandler = handlers.cut;
  pasteSpriteSelectionHandler = handlers.paste;
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

export function copySpriteSelection() {
  return copySpriteSelectionHandler();
}

export function cutSpriteSelection() {
  return cutSpriteSelectionHandler();
}

export function pasteSpriteSelection() {
  return pasteSpriteSelectionHandler();
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

  retainSelectionForWorkspace();

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
  _getFitZoomForImage = fn;
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
    makeWorkspaceRelativePath(exportFilePath.value, spanFilePath.value),
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

// Wire up refs needed by ioState (avoids circular import)
bindIoStateRefs({
  dirty,
  statusText,
  selectedId,
  selectedIds,
  exportFilePath,
  paintPixelSelection,
  hasPaintClipboard,
  markDirty,
  performSave,
  fulfillSheet,
  getPersistedSelectedAnnotationId,
});

// --- Actions ---

interface EditMutationOptions {
  captureHistory?: boolean;
}

function shouldCaptureHistory(options?: EditMutationOptions) {
  return options?.captureHistory !== false;
}

function recordCurrentSheetUndoSnapshot() {
  const sheet = currentSheet.value;
  if (sheet) {
    recordPaintUndoSnapshot(sheet);
  }
}

function selectedAnnotationEntries() {
  if (selectedIds.value.length === 0) return [];
  const selectedIdSet = new Set(selectedIds.value);
  const entryMap = new Map<string, { sheet: WorkspaceSheet; annotation: Annotation }>();
  for (const sheet of sheets.value) {
    for (const annotation of sheet.annotations) {
      if (!selectedIdSet.has(annotation.id)) continue;
      entryMap.set(annotation.id, { sheet, annotation });
    }
  }
  return selectedIds.value
    .map((id) => entryMap.get(id) ?? null)
    .filter(
      (
        entry
      ): entry is { sheet: WorkspaceSheet; annotation: Annotation } => entry !== null
    );
}

function recordUndoForSelectionEntries(
  entries: Array<{ sheet: WorkspaceSheet; annotation: Annotation }>
) {
  const touchedSheetKeys = new Set<string>();
  for (const entry of entries) {
    const key = getSheetKey(entry.sheet);
    if (!key || touchedSheetKeys.has(key)) continue;
    touchedSheetKeys.add(key);
    recordPaintUndoSnapshot(entry.sheet);
  }
}

function valuesMatch(left: unknown, right: unknown) {
  if (Object.is(left, right)) return true;
  if (
    left === null
    || right === null
    || typeof left !== 'object'
    || typeof right !== 'object'
  ) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

export function selectAnnotation(id: string | null) {
  selectSingleAnnotation(id);
  scheduleWorkspaceUiStateSave();
}

export function setSelectedAnnotationIds(ids: string[]) {
  applySelectedAnnotationIds(ids);
  scheduleWorkspaceUiStateSave();
}

export function setSelectedProjectAnnotationIdSet(
  ids: string[],
  options?: { primaryId?: string | null }
) {
  setSelectedProjectAnnotationIds(ids, options);
  scheduleWorkspaceUiStateSave();
}

export function toggleAnnotationSelection(id: string) {
  toggleSelectedAnnotation(id);
  scheduleWorkspaceUiStateSave();
}

export function reorderAnnotation(fromId: string, toId: string) {
  const sheet = currentSheet.value;
  if (!sheet) return;
  const arr = sheet.annotations;
  const fromIdx = arr.findIndex((a) => a.id === fromId);
  const toIdx = arr.findIndex((a) => a.id === toId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
  recordCurrentSheetUndoSnapshot();
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
  exportFilePath.value = null;
  paintPalette.value = [];
  paintPixelSelection.value = null;
  hasPaintClipboard.value = false;
  setSelectTool();
  specFilePath.value = null;
  resetToDefaultSpec(null);
  selectSingleAnnotation(null);
  dirty.value = false;
  statusText.value = 'Closed project';
}

export function addAnnotation(x: number = 0, y: number = 0) {
  const spec = activeSpec.value;
  const tool = activeTool.value;
  const sheet = currentSheet.value;
  if (!spec || !tool || !getEntityByLabel(spec, tool) || !sheet) return;

  recordCurrentSheetUndoSnapshot();
  const annotation = createAnnotation(spec, tool, { x, y });
  sheet.annotations.push(annotation);
  selectSingleAnnotation(annotation.id);
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

  recordCurrentSheetUndoSnapshot();
  sheet.annotations.push(annotation);
  selectSingleAnnotation(annotation.id);
  markDirty(true);
}

export function duplicateSelected() {
  const entries = selectedAnnotationEntries();
  if (entries.length === 0) return;
  recordUndoForSelectionEntries(entries);

  const copies = entries.map(({ sheet, annotation }) => {
    const copy = duplicateAnnotation(annotation, activeSpec.value ?? undefined);
    sheet.annotations.push(copy);
    return copy;
  });

  setSelectedProjectAnnotationIds(
    copies.map((annotation) => annotation.id),
    { primaryId: copies[0]?.id ?? null }
  );
  markDirty(true);
}

export function deleteSelected() {
  const entries = selectedAnnotationEntries();
  const idsToDelete = new Set(entries.map(({ annotation }) => annotation.id));
  if (idsToDelete.size === 0) return;
  recordUndoForSelectionEntries(entries);

  const touchedSheets = new Set(entries.map(({ sheet }) => sheet));
  for (const sheet of touchedSheets) {
    sheet.annotations = sheet.annotations.filter(
      (annotation) => !idsToDelete.has(annotation.id)
    );
  }
  selectSingleAnnotation(currentSheet.value?.annotations[0]?.id ?? null);
  markDirty(true);
}

export function updateShapeData(
  shapeName: string,
  patch: Record<string, number>,
  options?: EditMutationOptions
) {
  const entries = selectedAnnotationEntries().filter(({ annotation }) => {
    const shape =
      shapeName === 'aabb'
        ? annotation.aabb
        : shapeName === 'point'
          ? annotation.point
          : null;
    if (!shape) return false;
    return Object.entries(patch).some(
      ([key, value]) => (shape as Record<string, number>)[key] !== value
    );
  });
  if (entries.length === 0) return;
  const captureHistory = shouldCaptureHistory(options);
  if (captureHistory) {
    recordUndoForSelectionEntries(entries);
  }
  for (const { annotation } of entries) {
    const shape =
      shapeName === 'aabb'
        ? annotation.aabb
        : shapeName === 'point'
          ? annotation.point
          : null;
    if (!shape) continue;
    Object.assign(shape, patch);
  }
  markDirty(true);
}

export function updatePropertyData(
  patch: Record<string, unknown>,
  options?: EditMutationOptions
) {
  const changedTargets = selectedAnnotationEntries().filter(({ annotation }) =>
    Object.entries(patch).some(
      ([key, value]) => !valuesMatch(annotation.properties[key], value)
    )
  );
  if (changedTargets.length === 0) return;
  if (shouldCaptureHistory(options)) {
    recordUndoForSelectionEntries(changedTargets);
  }
  for (const { annotation } of changedTargets) {
    for (const [key, value] of Object.entries(patch)) {
      annotation.properties[key] =
        value !== null && typeof value === 'object'
          ? JSON.parse(JSON.stringify(value))
          : value;
    }
  }
  markDirty(true);
}

export function clampAnnotationToImage(
  annotation: Annotation,
  imgW: number = imageWidth.value,
  imgH: number = imageHeight.value
) {
  clampToImage(annotation, imgW, imgH);
}
