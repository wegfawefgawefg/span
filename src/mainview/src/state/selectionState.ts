import { computed, ref } from 'vue';
import type { Annotation } from '../annotation';
import { currentSheet } from '../workspace';
import type { WorkspaceSheet } from '../workspace';

export const selectedId = ref<string | null>(null);
export const selectedIds = ref<string[]>([]);

function normalizeSelectionIds(
  ids: string[],
  sheet: WorkspaceSheet | null = currentSheet.value
) {
  if (!sheet) return [];
  const availableIds = new Set(sheet.annotations.map((annotation) => annotation.id));
  const normalized: string[] = [];
  for (const id of ids) {
    if (!availableIds.has(id) || normalized.includes(id)) continue;
    normalized.push(id);
  }
  return normalized;
}

export function setSelectedAnnotationIds(
  ids: string[],
  options?: { primaryId?: string | null }
) {
  const normalized = normalizeSelectionIds(ids);
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

export function retainSelectionForCurrentSheet() {
  setSelectedAnnotationIds(selectedIds.value, { primaryId: selectedId.value });
}

export const selectedAnnotations = computed<Annotation[]>(() => {
  const sheet = currentSheet.value;
  if (!sheet || selectedIds.value.length === 0) return [];
  const selectedIdSet = new Set(selectedIds.value);
  return sheet.annotations.filter((annotation) => selectedIdSet.has(annotation.id));
});

export const selectedAnnotation = computed<Annotation | null>(() => {
  const primaryId = selectedId.value;
  if (primaryId) {
    const primary = selectedAnnotations.value.find((annotation) => annotation.id === primaryId);
    if (primary) return primary;
  }
  return selectedAnnotations.value[0] ?? null;
});
