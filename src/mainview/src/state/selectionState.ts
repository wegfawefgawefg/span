import { computed, ref } from 'vue';
import type { Annotation } from '../annotation';
import { currentSheet, sheets } from '../workspace';
import type { WorkspaceSheet } from '../workspace';

export const selectedId = ref<string | null>(null);
export const selectedIds = ref<string[]>([]);

function selectionScopeSheets(
  scope: 'current-sheet' | 'all' = 'all',
  sheet: WorkspaceSheet | null = currentSheet.value
) {
  if (scope === 'current-sheet') {
    return sheet ? [sheet] : [];
  }
  return sheets.value;
}

function normalizeSelectionIds(
  ids: string[],
  options?: {
    scope?: 'current-sheet' | 'all';
    sheet?: WorkspaceSheet | null;
  }
) {
  const availableIds = new Set(
    selectionScopeSheets(options?.scope, options?.sheet).flatMap((sheet) =>
      sheet.annotations.map((annotation) => annotation.id)
    )
  );
  const normalized: string[] = [];
  for (const id of ids) {
    if (!availableIds.has(id) || normalized.includes(id)) continue;
    normalized.push(id);
  }
  return normalized;
}

export function setSelectedAnnotationIds(
  ids: string[],
  options?: {
    primaryId?: string | null;
    scope?: 'current-sheet' | 'all';
    sheet?: WorkspaceSheet | null;
  }
) {
  const normalized = normalizeSelectionIds(ids, options);
  if (normalized.length === 0) {
    selectedIds.value = [];
    selectedId.value = null;
    return;
  }

  const requestedPrimary = options?.primaryId ?? selectedId.value;
  selectedIds.value = normalized;
  selectedId.value = requestedPrimary && normalized.includes(requestedPrimary)
    ? requestedPrimary
    : normalized[0];
}

export function selectSingleAnnotation(id: string | null) {
  if (!id) {
    selectedIds.value = [];
    selectedId.value = null;
    return;
  }
  setSelectedAnnotationIds([id], { primaryId: id });
}

export function toggleSelectedAnnotation(id: string) {
  if (selectedIds.value.includes(id)) {
    const remaining = selectedIds.value.filter((entry) => entry !== id);
    setSelectedAnnotationIds(remaining);
    return;
  }
  setSelectedAnnotationIds([...selectedIds.value, id], { primaryId: id });
}

export function setSelectedProjectAnnotationIds(
  ids: string[],
  options?: { primaryId?: string | null }
) {
  setSelectedAnnotationIds(ids, {
    primaryId: options?.primaryId,
    scope: 'all',
  });
}

export function retainSelectionForWorkspace() {
  setSelectedAnnotationIds(selectedIds.value, {
    primaryId: selectedId.value,
    scope: 'all',
  });
}

export const selectedAnnotations = computed<Annotation[]>(() => {
  if (selectedIds.value.length === 0) return [];
  const selectedIdMap = new Map<string, Annotation>();
  for (const sheet of sheets.value) {
    for (const annotation of sheet.annotations) {
      selectedIdMap.set(annotation.id, annotation);
    }
  }
  return selectedIds.value
    .map((id) => selectedIdMap.get(id) ?? null)
    .filter((annotation): annotation is Annotation => annotation !== null);
});

export const selectedAnnotation = computed<Annotation | null>(() => {
  const primaryId = selectedId.value;
  if (primaryId) {
    const primary = selectedAnnotations.value.find((annotation) => annotation.id === primaryId);
    if (primary) return primary;
  }
  return selectedAnnotations.value[0] ?? null;
});

export const selectedAnnotationsInCurrentSheet = computed<Annotation[]>(() => {
  const sheet = currentSheet.value;
  if (!sheet || selectedIds.value.length === 0) return [];
  const selectedIdSet = new Set(selectedIds.value);
  return sheet.annotations.filter((annotation) => selectedIdSet.has(annotation.id));
});
