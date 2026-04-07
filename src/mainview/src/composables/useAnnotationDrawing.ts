import { ref } from 'vue';
import type { Annotation } from '../annotation';
import { getEntityByLabel } from '../spec/types';
import { activeSpec, addAnnotationWithSize } from '../state';

export interface DrawingState {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  entityType: string;
  shapeType: 'rect' | 'point';
}

export const DRAW_MIN_THRESHOLD = 4; // image-space pixels

export function useAnnotationDrawing() {
  const drawing = ref<DrawingState | null>(null);

  function getPrimaryShapeKind(
    annotation: Annotation,
  ): 'rect' | 'point' | null {
    if (!activeSpec.value) return null;
    const entity = getEntityByLabel(activeSpec.value, annotation.entityType);
    if (!entity) return null;
    return entity.primaryShape.kind;
  }

  function getAnnotationLabel(annotation: Annotation): string {
    if (!activeSpec.value) return annotation.entityType;
    const entity = getEntityByLabel(activeSpec.value, annotation.entityType);
    if (!entity) return annotation.entityType;
    if (entity.nameField) {
      const val = annotation.properties.name;
      if (val && typeof val === 'string') return val;
    }
    // Fallback to first string property
    for (const field of entity.properties) {
      if (field.kind === 'scalar' && field.type === 'string') {
        const val = annotation.properties[field.name];
        if (val && typeof val === 'string') return val;
      }
    }
    return annotation.entityType;
  }

  function annotationAtPoint(
    point: { x: number; y: number },
    annotationsList: Annotation[],
  ): Annotation | null {
    for (let index = annotationsList.length - 1; index >= 0; index -= 1) {
      const annotation = annotationsList[index];
      if (!annotation.aabb) continue;
      const aabb = annotation.aabb;
      if (
        point.x >= aabb.x &&
        point.x < aabb.x + aabb.w &&
        point.y >= aabb.y &&
        point.y < aabb.y + aabb.h
      ) {
        return annotation;
      }
    }
    return null;
  }

  function commitDrawing() {
    const d = drawing.value;
    drawing.value = null;
    if (!d) return;

    if (d.shapeType === 'rect') {
      const w = Math.abs(d.currentX - d.originX);
      const h = Math.abs(d.currentY - d.originY);
      if (w < DRAW_MIN_THRESHOLD || h < DRAW_MIN_THRESHOLD) return;

      const x = Math.min(d.originX, d.currentX);
      const y = Math.min(d.originY, d.currentY);
      addAnnotationWithSize(d.entityType, x, y, w, h);
    }
  }

  return {
    drawing,
    getPrimaryShapeKind,
    getAnnotationLabel,
    annotationAtPoint,
    commitDrawing,
  };
}
