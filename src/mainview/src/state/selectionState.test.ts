import { beforeEach, describe, expect, it } from 'bun:test';
import { currentSheet, sheets } from '../workspace';
import type { Annotation } from '../annotation';
import type { WorkspaceSheet } from '../workspace';
import {
  selectedId,
  selectedIds,
  selectedAnnotation,
  selectedAnnotations,
  selectSingleAnnotation,
  setSelectedProjectAnnotationIds,
  toggleSelectedAnnotation,
  retainSelectionForWorkspace,
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
    sheets.value = [];
    selectedId.value = null;
    selectedIds.value = [];
  });

  it('keeps a primary selection alongside multi-select ids', () => {
    const ann1 = makeAnnotation('ann-1');
    const ann2 = makeAnnotation('ann-2');
    const sheet = makeSheet('sheet.png', [ann1, ann2]);
    sheets.value = [sheet];
    currentSheet.value = sheet;

    selectSingleAnnotation(ann1.id);
    expect(selectedId.value).toBe(ann1.id);
    expect(selectedIds.value).toEqual([ann1.id]);

    toggleSelectedAnnotation(ann2.id);
    expect(selectedId.value).toBe(ann2.id);
    expect(selectedIds.value).toEqual([ann1.id, ann2.id]);
    expect(selectedAnnotations.value).toEqual([ann1, ann2]);
    expect(selectedAnnotation.value).toEqual(ann2);
  });

  it('retains valid project-wide ids when the current sheet changes', () => {
    const ann1 = makeAnnotation('ann-1');
    const ann2 = makeAnnotation('ann-2');
    const ann3 = makeAnnotation('ann-3');
    const sheetA = makeSheet('sheet-a.png', [ann1, ann2]);
    const sheetB = makeSheet('sheet-b.png', [ann3]);
    sheets.value = [sheetA, sheetB];
    currentSheet.value = sheetA;
    setSelectedProjectAnnotationIds([ann1.id, ann3.id], { primaryId: ann3.id });

    currentSheet.value = sheetB;
    retainSelectionForWorkspace();

    expect(selectedId.value).toBe(ann3.id);
    expect(selectedIds.value).toEqual([ann1.id, ann3.id]);
    expect(selectedAnnotations.value).toEqual([ann1, ann3]);
    expect(selectedAnnotation.value).toEqual(ann3);
  });
});
