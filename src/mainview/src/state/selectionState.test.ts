import { beforeEach, describe, expect, it } from 'bun:test';
import { currentSheet } from '../workspace';
import type { Annotation } from '../annotation';
import type { WorkspaceSheet } from '../workspace';
import {
  selectedId,
  selectedIds,
  selectedAnnotation,
  selectedAnnotations,
  selectSingleAnnotation,
  setSelectedAnnotationIds,
  toggleSelectedAnnotation,
  retainSelectionForCurrentSheet,
} from './selectionState';

function makeAnnotation(id: string): Annotation {
  return {
    id,
    entityType: 'Sprite',
    aabb: { x: 0, y: 0, w: 16, h: 16 },
    point: null,
    chromaKey: null,
    properties: { name: id },
  };
}

function makeSheet(path: string, annotations: Annotation[]): WorkspaceSheet {
  return {
    path,
    absolutePath: `/tmp/${path}`,
    annotations,
    status: 'loaded',
    imageUrl: 'data:image/png;base64,sheet',
    width: 16,
    height: 16,
  };
}

describe('selectionState', () => {
  beforeEach(() => {
    currentSheet.value = null;
    selectedId.value = null;
    selectedIds.value = [];
  });

  it('keeps a primary selection alongside multi-select ids', () => {
    const ann1 = makeAnnotation('ann-1');
    const ann2 = makeAnnotation('ann-2');
    currentSheet.value = makeSheet('sheet.png', [ann1, ann2]);

    selectSingleAnnotation(ann1.id);
    expect(selectedId.value).toBe(ann1.id);
    expect(selectedIds.value).toEqual([ann1.id]);

    toggleSelectedAnnotation(ann2.id);
    expect(selectedId.value).toBe(ann2.id);
    expect(selectedIds.value).toEqual([ann1.id, ann2.id]);
    expect(selectedAnnotations.value).toEqual([ann1, ann2]);
    expect(selectedAnnotation.value).toEqual(ann2);
  });

  it('drops invalid ids when the current sheet changes', () => {
    const ann1 = makeAnnotation('ann-1');
    const ann2 = makeAnnotation('ann-2');
    currentSheet.value = makeSheet('sheet-a.png', [ann1, ann2]);
    setSelectedAnnotationIds([ann1.id, ann2.id], { primaryId: ann2.id });

    currentSheet.value = makeSheet('sheet-b.png', [makeAnnotation('ann-3')]);
    retainSelectionForCurrentSheet();

    expect(selectedId.value).toBeNull();
    expect(selectedIds.value).toEqual([]);
    expect(selectedAnnotations.value).toEqual([]);
    expect(selectedAnnotation.value).toBeNull();
  });
});
