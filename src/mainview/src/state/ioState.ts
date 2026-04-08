// src/mainview/src/state/ioState.ts
// Import/export, save/open workspace operations extracted from state.ts

import {
  sheets,
  currentSheet,
  spanFilePath,
  effectiveRoot,
  addSheet,
  resetWorkspace,
} from '../workspace';
import {
  serializeWorkspace,
  deserializeWorkspace,
  debouncedSave,
} from '../persistence';
import { api, platform } from '../platform/adapter';
import { exportToString, type ExportEntry } from '../export';
import {
  ensureEditedSheetState,
  editedSheetState,
  savePendingImageEdits,
} from './paintHistory';
import {
  activeSpec,
  activeSpecRaw,
  specFilePath,
  resolveProjectSpecForWorkspace,
  debouncedSaveSpecFile,
  saveSpecFileNow,
  defaultProjectSpecPathForWorkspace,
  makeWorkspaceRelativePath,
  workspaceDir,
  resetToDefaultSpec,
} from './specState';
import {
  projectPalettes,
  activeProjectPaletteId,
  paintPalette,
  importPaletteFromPath as _importPaletteFromPath,
} from './paletteState';
import { setSelectTool } from './toolState';
import type { Ref } from 'vue';

// --- Bound refs (set by state.ts to avoid circular imports) ---

let _dirty: Ref<boolean>;
let _statusText: Ref<string>;
let _selectedId: Ref<string | null>;
let _exportFilePath: Ref<string | null>;
let _paintPixelSelection: Ref<{ x: number; y: number; w: number; h: number } | null>;
let _hasPaintClipboard: Ref<boolean>;
let _markDirty: (isDirty: boolean) => void;
let _performSave: () => void;
let _fulfillSheet: (sheet: any, imageUrl: string, width: number, height: number) => void;
let _getPersistedSelectedAnnotationId: () => string | null;

export function bindIoStateRefs(refs: {
  dirty: Ref<boolean>;
  statusText: Ref<string>;
  selectedId: Ref<string | null>;
  exportFilePath: Ref<string | null>;
  paintPixelSelection: Ref<{ x: number; y: number; w: number; h: number } | null>;
  hasPaintClipboard: Ref<boolean>;
  markDirty: (isDirty: boolean) => void;
  performSave: () => void;
  fulfillSheet: (sheet: any, imageUrl: string, width: number, height: number) => void;
  getPersistedSelectedAnnotationId: () => string | null;
}) {
  _dirty = refs.dirty;
  _statusText = refs.statusText;
  _selectedId = refs.selectedId;
  _exportFilePath = refs.exportFilePath;
  _paintPixelSelection = refs.paintPixelSelection;
  _hasPaintClipboard = refs.hasPaintClipboard;
  _markDirty = refs.markDirty;
  _performSave = refs.performSave;
  _fulfillSheet = refs.fulfillSheet;
  _getPersistedSelectedAnnotationId = refs.getPersistedSelectedAnnotationId;
}

// --- Path helpers ---

export function defaultProjectExportPath(): string | null {
  const root = effectiveRoot.value;
  const spec = activeSpecRaw.value;
  if (!root || !spec) return null;
  const ext = spec.format === 'json' ? 'json' : 'yaml';
  return `${root}/annotations.${ext}`;
}

// --- Persist / snapshot ---

export async function persistWorkspaceSnapshotNow() {
  const spec = activeSpec.value;
  if (!spec) return false;

  const data = serializeWorkspace(
    sheets.value,
    activeSpecRaw.value,
    projectPalettes.value,
    activeProjectPaletteId.value,
    makeWorkspaceRelativePath(specFilePath.value, spanFilePath.value),
    makeWorkspaceRelativePath(_exportFilePath.value, spanFilePath.value),
    currentSheet.value?.path ?? null,
    _getPersistedSelectedAnnotationId(),
  );

  if (platform.value === 'desktop' && spanFilePath.value) {
    await api.writeFile(spanFilePath.value, data);
    if (specFilePath.value) {
      debouncedSaveSpecFile();
    }
    _dirty.value = false;
    return true;
  }

  if (platform.value === 'web') {
    localStorage.setItem('span-workspace', data);
    _dirty.value = false;
    return true;
  }

  return false;
}

// --- Import ---

export async function importPaletteFromPath(path: string) {
  await _importPaletteFromPath(path, persistWorkspaceSnapshotNow, _markDirty, _statusText);
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
      _fulfillSheet(missing, dataUrl, dims.width, dims.height);
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
    _statusText.value = 'Failed to import image';
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
    _statusText.value = `Imported ${imported} image${imported === 1 ? '' : 's'}`;
  } else if (paths.length > 0) {
    _statusText.value = 'No new images imported';
  }
}

export async function openProjectDirectory(
  workspacePath: string,
  paths: string[]
) {
  resetWorkspace();
  _selectedId.value = null;
  editedSheetState.value = {};
  projectPalettes.value = [];
  activeProjectPaletteId.value = null;
  _exportFilePath.value = null;
  paintPalette.value = [];
  _paintPixelSelection.value = null;
  _hasPaintClipboard.value = false;
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
  _statusText.value = `Opened project ${parts[parts.length - 3] ?? parts[parts.length - 1]}`;
}

// --- Export ---

export async function exportWorkspace(dialogPath?: string) {
  console.log('[exportWorkspace] called, dialogPath:', dialogPath);
  const spec = activeSpec.value;
  if (!spec) {
    console.log('[exportWorkspace] no spec loaded');
    _statusText.value = 'No spec loaded \u2014 cannot export';
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
    _statusText.value = 'No spec loaded \u2014 cannot export';
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
    _statusText.value = `Exported spec to ${savePath.split('/').pop()}`;
  } catch (e) {
    console.error('Spec export failed:', e);
    _statusText.value = 'Spec export failed';
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
  } else if (_exportFilePath.value) {
    savePath = _exportFilePath.value;
  } else if (defaultProjectExportPath()) {
    savePath = defaultProjectExportPath()!;
  } else {
    // Fallback: show dialog from webview (used if called directly)
    const path = await api.showSaveDialog(defaultName, []);
    if (!path) return;
    savePath = path;
  }

  try {
    await api.writeFile(savePath, output);
    _exportFilePath.value = savePath;
    _statusText.value = `Exported to ${savePath.split('/').pop()}`;
  } catch (e) {
    console.error('Export failed:', e);
    _statusText.value = 'Export failed';
  }
}

async function saveExportManifestIfConfigured() {
  const spec = activeSpec.value;
  if (!spec || platform.value !== 'desktop') return;

  const exportPath = _exportFilePath.value ?? defaultProjectExportPath();
  if (!exportPath) return;

  const entries: ExportEntry[] = sheets.value.flatMap((s) =>
    s.annotations.map((a) => ({
      annotation: a,
      sheetFile: s.path.split('/').pop() ?? s.path,
    }))
  );
  const output = exportToString(entries, spec);
  await api.writeFile(exportPath, output);
  _exportFilePath.value = exportPath;
}

// --- Save / Save As / Open ---

export async function saveWorkspace(): Promise<{ needsSaveAs: boolean }> {
  // On web, always save to localStorage (no file path needed)
  if (platform.value === 'web') {
    _performSave();
    return { needsSaveAs: false };
  }
  if (!spanFilePath.value) {
    return { needsSaveAs: true };
  }
  try {
    await savePendingImageEdits();
    await saveExportManifestIfConfigured();
    _performSave();
  } catch (e) {
    console.error('Save failed:', e);
    _statusText.value = 'Save failed';
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
    makeWorkspaceRelativePath(_exportFilePath.value ?? defaultProjectExportPath(), savePath),
    currentSheet.value?.path ?? null,
    _getPersistedSelectedAnnotationId(),
  );
  console.log('[saveWorkspaceAs] data length:', data.length);

  try {
    await savePendingImageEdits();
    await saveExportManifestIfConfigured();
    await api.writeFile(savePath, data);
    await saveSpecFileNow();
    console.log('[saveWorkspaceAs] write succeeded');
    _markDirty(false);
    _statusText.value = `Saved to ${savePath.split('/').pop()}`;
  } catch (e) {
    console.error('Save As failed:', e);
    _statusText.value = 'Save failed';
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
    _statusText.value = 'Failed to open .span file';
  }
}

export async function restoreWorkspace(raw: string, filePath?: string) {
  const data = deserializeWorkspace(raw);

  // Reset and load sheets
  resetWorkspace();
  _selectedId.value = null;
  editedSheetState.value = {};
  _paintPixelSelection.value = null;
  _hasPaintClipboard.value = false;
  projectPalettes.value = data.palettes ?? [];
  activeProjectPaletteId.value =
    data.activePaletteId && projectPalettes.value.some((palette) => palette.id === data.activePaletteId)
      ? data.activePaletteId
      : null;
  if (filePath) {
    spanFilePath.value = filePath;
  }
  const resolvedExportPath =
    data.exportPath
      ? (filePath && !data.exportPath.startsWith('/')
          ? `${workspaceDir(filePath)}/${data.exportPath}`
          : data.exportPath)
      : null;
  await resolveProjectSpecForWorkspace(filePath ?? null, data.specPath ?? null, data.spec);
  _exportFilePath.value = resolvedExportPath ?? defaultProjectExportPath();

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
  _selectedId.value =
    currentSheet.value && data.selectedAnnotationId
      && currentSheet.value.annotations.some((annotation) => annotation.id === data.selectedAnnotationId)
      ? data.selectedAnnotationId
      : null;
  _markDirty(false);
  _statusText.value = filePath
    ? `Opened ${filePath.split('/').pop()}${prunedMissingEmptySheets ? ' \u2022 pruned stale missing sheets' : ''}`
    : `Workspace restored${prunedMissingEmptySheets ? ' \u2022 pruned stale missing sheets' : ''}`;

  if (prunedMissingEmptySheets && (spanFilePath.value || platform.value === 'web')) {
    debouncedSave(_performSave, 50);
  }
}
