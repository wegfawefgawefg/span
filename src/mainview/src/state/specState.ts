import { ref, watch, triggerRef } from 'vue';
import type { Ref } from 'vue';
import type { SpanSpec, SpecError, SpecDiff } from '../spec/types';
import {
  getEntityByLabel,
  getAllEntityFields,
  defaultForScalar,
  defaultForEnum,
  defaultForColor,
  defaultForShape,
} from '../spec/types';
import { parseSpec } from '../spec/parse';
import { diffSpecs } from '../spec/diff';
import { DEFAULT_SPEC_RAW, DEFAULT_SPEC_FORMAT } from '../spec/default-spec';
import { api, platform } from '../platform/adapter';
import { sheets, spanFilePath } from '../workspace';
import { setSelectTool } from './toolState';
import type { SpanFileSpec } from '../persistence';

// --- Bound refs (injected by state.ts to avoid circular imports) ---

let _statusText: Ref<string>;
let _markDirty: (isDirty: boolean) => void;
let _debouncedSave: (fn: () => void, delay?: number) => void;
let _performSave: () => void;

export function bindSpecStateRefs(refs: {
  statusText: Ref<string>;
  markDirty: (isDirty: boolean) => void;
  debouncedSave: (fn: () => void, delay?: number) => void;
  performSave: () => void;
}) {
  _statusText = refs.statusText;
  _markDirty = refs.markDirty;
  _debouncedSave = refs.debouncedSave;
  _performSave = refs.performSave;
}

// --- Internal state ---

let specSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let specReloadInterval: ReturnType<typeof setInterval> | null = null;
let specReloadInFlight = false;

// --- Exported state ---

export const specFilePath = ref<string | null>(null);

// Initialize with built-in default spec
const _defaultParsed = parseSpec(DEFAULT_SPEC_RAW, DEFAULT_SPEC_FORMAT);
if (Array.isArray(_defaultParsed)) {
  throw new Error(
    'Built-in default spec is invalid: ' +
      _defaultParsed.map((e) => e.message).join('; ')
  );
}

export const activeSpec = ref<SpanSpec | null>(_defaultParsed);
export const activeSpecRaw = ref<SpanFileSpec | null>({
  raw: DEFAULT_SPEC_RAW,
  format: DEFAULT_SPEC_FORMAT,
});

// --- Helper functions ---

function isPointPropertyValue(
  value: unknown
): value is { x: number; y: number } {
  return !!value
    && typeof value === 'object'
    && typeof (value as { x?: unknown }).x === 'number'
    && typeof (value as { y?: unknown }).y === 'number';
}

export function normalizeAnnotationsForSpec(spec: SpanSpec): boolean {
  let changed = false;

  for (const sheet of sheets.value) {
    for (const annotation of sheet.annotations) {
      const entity = getEntityByLabel(spec, annotation.entityType);
      if (!entity) continue;

      const properties = annotation.properties as Record<string, unknown>;

      for (const field of getAllEntityFields(entity)) {
        if (field.name in properties) continue;

        switch (field.kind) {
          case 'scalar':
            properties[field.name] = defaultForScalar(field);
            break;
          case 'enum':
            properties[field.name] = defaultForEnum(field);
            break;
          case 'color':
            properties[field.name] = defaultForColor();
            break;
          case 'shape':
            properties[field.name] = defaultForShape(field);
            break;
        }

        changed = true;
      }

      const hasOffset = !!entity.offsetField;
      if (!hasOffset) continue;

      const hasOrigin = entity.properties.some((field) => field.name === 'origin');
      const offset = properties.offset;
      const origin = properties.origin;

      if (!isPointPropertyValue(offset)) {
        if (isPointPropertyValue(origin)) {
          properties.offset = { x: origin.x, y: origin.y };
        } else {
          properties.offset = { x: 0, y: 0 };
        }
        changed = true;
      }

      if (!hasOrigin && 'origin' in properties) {
        delete properties.origin;
        changed = true;
      }
    }
  }

  if (changed) {
    triggerRef(sheets);
  }

  return changed;
}

// --- Spec state management ---

export function setSpecState(
  raw: string,
  format: 'json' | 'yaml',
  options?: { filePath?: string | null; markDirty?: boolean; status?: string }
): boolean {
  const result = parseSpec(raw, format);
  if (Array.isArray(result)) {
    console.error('Spec parse errors:', result);
    _statusText.value = `Spec errors: ${result.map((e) => e.message).join('; ')}`;
    return false;
  }

  activeSpec.value = result;
  activeSpecRaw.value = { raw, format };
  const normalizedAnnotations = normalizeAnnotationsForSpec(result);
  setSelectTool();
  if (options && 'filePath' in options) {
    specFilePath.value = options.filePath ?? null;
  }
  if (normalizedAnnotations && (spanFilePath.value || platform.value === 'web')) {
    _debouncedSave(_performSave, 250);
  }
  if (options?.markDirty) {
    _statusText.value = options.status ?? 'Spec loaded';
    _markDirty(true);
    if (platform.value === 'desktop' && specFilePath.value) {
      debouncedSaveSpecFile();
    }
  } else if (options?.status) {
    _statusText.value = options.status;
  }
  return true;
}

export function resetToDefaultSpec(filePath?: string | null) {
  setSpecState(DEFAULT_SPEC_RAW, DEFAULT_SPEC_FORMAT, {
    filePath: filePath ?? null,
    markDirty: false,
  });
}

// --- Spec file I/O ---

export function inferSpecFormatFromPath(path: string): 'json' | 'yaml' {
  return path.toLowerCase().endsWith('.json') ? 'json' : 'yaml';
}

export function debouncedSaveSpecFile() {
  if (specSaveTimeout) clearTimeout(specSaveTimeout);
  specSaveTimeout = setTimeout(async () => {
    await saveSpecFileNow();
  }, 250);
}

export async function saveSpecFileNow() {
  if (platform.value !== 'desktop') return;
  if (!specFilePath.value || !activeSpecRaw.value) return;
  try {
    await api.writeFile(specFilePath.value, activeSpecRaw.value.raw);
  } catch (e) {
    console.error('Spec save failed:', e);
    _statusText.value = 'Spec save failed';
  }
}

// --- Spec reload watcher ---

export function stopSpecReloadWatcher() {
  if (specReloadInterval) {
    clearInterval(specReloadInterval);
    specReloadInterval = null;
  }
}

export function startSpecReloadWatcher(path: string | null) {
  stopSpecReloadWatcher();
  if (platform.value !== 'desktop' || !path) return;

  specReloadInterval = setInterval(async () => {
    if (specReloadInFlight) return;
    specReloadInFlight = true;
    try {
      const raw = await api.readFile(path);
      if (!activeSpecRaw.value || raw === activeSpecRaw.value.raw) return;
      const loaded = setSpecState(raw, inferSpecFormatFromPath(path), {
        filePath: path,
        markDirty: false,
        status: 'Spec reloaded from disk',
      });
      if (!loaded) {
        _statusText.value = 'Spec reload failed';
      }
    } catch {
      // Ignore transient read failures while editing or before the file exists.
    } finally {
      specReloadInFlight = false;
    }
  }, 1000);
}

// --- Spec loading from file paths ---

export async function loadSpecFromFilePath(
  path: string,
  options?: { filePath?: string | null; markDirty?: boolean; status?: string }
): Promise<boolean> {
  try {
    const raw = await api.readFile(path);
    return setSpecState(raw, inferSpecFormatFromPath(path), {
      filePath: options && 'filePath' in options ? options.filePath : path,
      markDirty: options?.markDirty,
      status: options?.status,
    });
  } catch {
    return false;
  }
}

export async function resolveProjectSpecForWorkspace(
  filePath: string | null,
  specPath: string | null,
  embeddedSpec?: SpanFileSpec | null
) {
  const workspaceSpecPath = defaultProjectSpecPathForWorkspace(filePath);
  const resolvedSpecPath = resolveWorkspacePath(specPath, filePath);
  const candidates = [resolvedSpecPath, workspaceSpecPath].filter(
    (candidate, index, all): candidate is string =>
      !!candidate && all.indexOf(candidate) === index
  );

  for (const candidate of candidates) {
    const loaded = await loadSpecFromFilePath(candidate, {
      filePath: candidate,
      markDirty: false,
    });
    if (loaded) return;
  }

  if (embeddedSpec) {
    setSpecState(embeddedSpec.raw, embeddedSpec.format, {
      filePath: workspaceSpecPath,
      markDirty: false,
    });
    return;
  }

  resetToDefaultSpec(workspaceSpecPath);
}

// --- Exported spec actions ---

export function loadSpec(raw: string, format: 'json' | 'yaml') {
  const fallbackSpecPath =
    specFilePath.value ?? defaultProjectSpecPathForWorkspace(spanFilePath.value);
  setSpecState(raw, format, {
    filePath: fallbackSpecPath,
    markDirty: true,
    status: 'Spec loaded',
  });
}

/**
 * Apply a spec edit from the in-app editor.
 * Returns { applied: true } on success, { applied: false, errors } on parse failure,
 * or { applied: false, destructive: true, diff } when confirmation is needed.
 */
export function applySpecFromEditor(
  raw: string,
  format: 'json' | 'yaml'
):
  | { applied: true }
  | { applied: false; errors: SpecError[] }
  | { applied: false; destructive: true; diff: SpecDiff } {
  const result = parseSpec(raw, format);
  if (Array.isArray(result)) {
    return { applied: false, errors: result };
  }

  const currentSpec = activeSpec.value;
  if (currentSpec) {
    const diff = diffSpecs(currentSpec, result);
    if (!diff.safe) {
      return { applied: false, destructive: true, diff };
    }
  }

  setSpecState(raw, format, { markDirty: true });
  return { applied: true };
}

/** Force-apply a spec even if it has destructive changes. Called after user confirms. */
export function forceApplySpec(raw: string, format: 'json' | 'yaml') {
  setSpecState(raw, format, { markDirty: true });
}

export async function importSpecFromPath(path: string) {
  try {
    const raw = await api.readFile(path);
    const format = inferSpecFormatFromPath(path);
    const projectSpecPath = defaultProjectSpecPathForWorkspace(spanFilePath.value);
    const targetPath = projectSpecPath ?? path;
    setSpecState(raw, format, {
      filePath: targetPath,
      markDirty: true,
      status: 'Spec loaded',
    });
  } catch (e) {
    console.error('Failed to import spec:', e);
    _statusText.value = 'Failed to import spec file';
  }
}

// --- Path helpers (used internally) ---

function workspaceDir(path: string | null): string {
  return path ? path.replace(/\/[^/]+$/, '') : '';
}

export function defaultProjectSpecPathForWorkspace(path: string | null): string | null {
  const dir = workspaceDir(path);
  if (!dir.endsWith('/.span')) return null;
  return `${dir}/spec.yaml`;
}

export function makeWorkspaceRelativePath(targetPath: string | null, basePath: string | null): string | null {
  if (!targetPath || !basePath) return targetPath;
  const baseDir = workspaceDir(basePath);
  const prefix = baseDir ? `${baseDir}/` : '';
  if (prefix && targetPath.startsWith(prefix)) {
    return targetPath.slice(prefix.length);
  }
  return targetPath;
}

function resolveWorkspacePath(path: string | null, basePath: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('/')) return path;
  const baseDir = workspaceDir(basePath);
  return baseDir ? `${baseDir}/${path}` : path;
}

// --- Watcher ---

watch(
  [specFilePath, platform],
  ([path, currentPlatform]) => {
    if (currentPlatform !== 'desktop') {
      stopSpecReloadWatcher();
      return;
    }
    startSpecReloadWatcher(path);
  },
  { immediate: true }
);
