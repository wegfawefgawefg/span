import { computed, ref, triggerRef, type Ref } from 'vue';
import { api, platform } from '../platform/adapter';
import { saveImage } from '../platform/image-store';
import type { Annotation } from '../annotation';
import {
  sheets,
  currentSheet,
} from '../workspace';
import type { WorkspaceSheet } from '../workspace';

// --- Interfaces ---

export interface EditedSheetState {
  undo: EditSnapshot[];
  redo: EditSnapshot[];
  dirty: boolean;
  originalImageUrl: string;
}

export interface EditSnapshot {
  imageUrl: string;
  annotations: Annotation[];
}

// --- Late-bound refs from state.ts (avoids circular import) ---

let _currentSheetImageSrc: Ref<string>;
let _imageWidth: Ref<number>;
let _imageHeight: Ref<number>;
let _statusText: Ref<string>;
let _selectedId: Ref<string | null>;

/** Called once by state.ts to wire up refs that live there. */
export function bindPaintHistoryRefs(refs: {
  currentSheetImageSrc: Ref<string>;
  imageWidth: Ref<number>;
  imageHeight: Ref<number>;
  statusText: Ref<string>;
  selectedId: Ref<string | null>;
}) {
  _currentSheetImageSrc = refs.currentSheetImageSrc;
  _imageWidth = refs.imageWidth;
  _imageHeight = refs.imageHeight;
  _statusText = refs.statusText;
  _selectedId = refs.selectedId;
}

// --- State ---

export const editedSheetState = ref<Record<string, EditedSheetState>>({});

// --- Internal helpers ---

export function getSheetKey(sheet: WorkspaceSheet | null): string | null {
  if (!sheet) return null;
  return sheet.absolutePath || sheet.path || null;
}

export function ensureEditedSheetState(sheet: WorkspaceSheet): EditedSheetState {
  const key = getSheetKey(sheet);
  if (!key) {
    return {
      undo: [],
      redo: [],
      dirty: false,
      originalImageUrl: sheet.imageUrl,
    };
  }
  const existing = editedSheetState.value[key];
  if (existing) return existing;
  const created: EditedSheetState = {
    undo: [],
    redo: [],
    dirty: false,
    originalImageUrl: sheet.imageUrl,
  };
  editedSheetState.value = {
    ...editedSheetState.value,
    [key]: created,
  };
  return created;
}

function captureEditSnapshot(sheet: WorkspaceSheet): EditSnapshot {
  return {
    imageUrl: sheet.imageUrl,
    annotations: JSON.parse(JSON.stringify(sheet.annotations)),
  };
}

function applyEditSnapshot(sheet: WorkspaceSheet, snapshot: EditSnapshot) {
  sheet.annotations = JSON.parse(JSON.stringify(snapshot.annotations));
  if (currentSheet.value === sheet && _selectedId.value) {
    const hasSelected = sheet.annotations.some((annotation) => annotation.id === _selectedId.value);
    if (!hasSelected) {
      _selectedId.value = sheet.annotations[0]?.id ?? null;
    }
  }
  updateSheetImageState(sheet, snapshot.imageUrl, sheet.width, sheet.height);
  triggerRef(sheets);
}

function replaceEditedSheetState(sheet: WorkspaceSheet, next: EditedSheetState) {
  const key = getSheetKey(sheet);
  if (!key) return;
  editedSheetState.value = {
    ...editedSheetState.value,
    [key]: next,
  };
}

function updateSheetImageState(
  sheet: WorkspaceSheet,
  dataUrl: string,
  width: number,
  height: number
) {
  sheet.imageUrl = dataUrl;
  sheet.width = width;
  sheet.height = height;
  if (currentSheet.value === sheet) {
    _currentSheetImageSrc.value = dataUrl;
    _imageWidth.value = width;
    _imageHeight.value = height;
  }
  persistSheetImage(sheet);
  triggerRef(sheets);
}

export function isPaintableSheet(sheet: WorkspaceSheet | null): boolean {
  if (!sheet) return false;
  return /\.(png|jpe?g|webp)$/i.test(sheet.absolutePath || sheet.path);
}

// --- Persist sheet images to IndexedDB (web only) ---

export function persistSheetImage(sheet: WorkspaceSheet) {
  if (platform.value !== 'web') return;
  if (sheet.status !== 'loaded' || !sheet.imageUrl) return;
  saveImage(sheet.path, sheet.imageUrl).catch((e) => {
    console.error('Failed to persist sheet image:', e);
  });
}

// --- Computed ---

export const hasUnsavedImageEdits = computed(() =>
  Object.values(editedSheetState.value).some((entry) => entry.dirty)
);

// --- Public functions ---

export function recordPaintUndoSnapshot(sheet: WorkspaceSheet) {
  const state = ensureEditedSheetState(sheet);
  const undo = [...state.undo, captureEditSnapshot(sheet)].slice(-64);
  replaceEditedSheetState(sheet, {
    ...state,
    undo,
    redo: [],
  });
}

export function applyPaintedSheetImage(
  sheet: WorkspaceSheet,
  dataUrl: string,
  width: number,
  height: number
) {
  const state = ensureEditedSheetState(sheet);
  const dirty = dataUrl !== state.originalImageUrl;
  replaceEditedSheetState(sheet, {
    ...state,
    dirty,
  });
  updateSheetImageState(sheet, dataUrl, width, height);
  _statusText.value = `${sheet.path} \u2022 ${dirty ? 'Image edits pending save' : 'Image edit reverted'}`;
}

export function undoPaintEdit(): boolean {
  const sheet = currentSheet.value;
  if (!sheet || !isPaintableSheet(sheet)) return false;
  const state = ensureEditedSheetState(sheet);
  if (state.undo.length === 0) return false;
  const previous = state.undo[state.undo.length - 1];
  const nextUndo = state.undo.slice(0, -1);
  const redo = [...state.redo, captureEditSnapshot(sheet)].slice(-64);
  const dirty = previous.imageUrl !== state.originalImageUrl;
  replaceEditedSheetState(sheet, {
    ...state,
    undo: nextUndo,
    redo,
    dirty,
  });
  applyEditSnapshot(sheet, previous);
  _statusText.value = `${sheet.path} \u2022 Undid image edit`;
  return true;
}

export function redoPaintEdit(): boolean {
  const sheet = currentSheet.value;
  if (!sheet || !isPaintableSheet(sheet)) return false;
  const state = ensureEditedSheetState(sheet);
  if (state.redo.length === 0) return false;
  const next = state.redo[state.redo.length - 1];
  const undo = [...state.undo, captureEditSnapshot(sheet)].slice(-64);
  const nextRedo = state.redo.slice(0, -1);
  const dirty = next.imageUrl !== state.originalImageUrl;
  replaceEditedSheetState(sheet, {
    ...state,
    undo,
    redo: nextRedo,
    dirty,
  });
  applyEditSnapshot(sheet, next);
  _statusText.value = `${sheet.path} \u2022 Redid image edit`;
  return true;
}

export async function savePendingImageEdits() {
  if (platform.value !== 'desktop') return;

  for (const sheet of sheets.value) {
    const key = getSheetKey(sheet);
    if (!key) continue;
    const state = editedSheetState.value[key];
    if (!state?.dirty) continue;
    await api.writeImageDataUrl(sheet.absolutePath, sheet.imageUrl);
    replaceEditedSheetState(sheet, {
      ...state,
      dirty: false,
      originalImageUrl: sheet.imageUrl,
    });
  }
}
