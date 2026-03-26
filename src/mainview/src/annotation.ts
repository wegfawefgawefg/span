// src/mainview/src/annotation.ts
import type {
	SpanSpec,
	EntityDef,
	ShapePropertyField,
} from "./spec/types";
import {
	getEntityByLabel,
	defaultForScalar,
	defaultForEnum,
	defaultForColor,
	defaultForShape,
} from "./spec/types";
import { makeId } from "./types";

export interface Annotation {
	id: string;
	entityType: string;
	aabb: { x: number; y: number; w: number; h: number } | null;
	point: { x: number; y: number } | null;
	properties: Record<string, unknown>;
	_stash?: Record<string, unknown>;
}

export function createAnnotation(
	spec: SpanSpec,
	entityType: string,
	position: { x: number; y: number },
): Annotation {
	const entity = getEntityByLabel(spec, entityType);
	if (!entity) throw new Error(`Unknown entity type: ${entityType}`);

	const aabb = entity.primaryShape.kind === "rect"
		? { x: position.x, y: position.y, w: 16, h: 16 }
		: null;
	const point = entity.primaryShape.kind === "point"
		? { x: position.x, y: position.y }
		: null;

	const properties: Record<string, unknown> = {};
	for (const field of entity.properties) {
		switch (field.kind) {
			case "scalar":
				properties[field.name] = defaultForScalar(field);
				break;
			case "enum":
				properties[field.name] = defaultForEnum(field);
				break;
			case "color":
				properties[field.name] = defaultForColor();
				break;
			case "shape":
				properties[field.name] = defaultForShape(field);
				break;
		}
	}

	return { id: makeId(), entityType, aabb, point, properties };
}

export function createAnnotationWithSize(
	spec: SpanSpec,
	entityType: string,
	position: { x: number; y: number },
	size: { width: number; height: number },
): Annotation {
	const annotation = createAnnotation(spec, entityType, position);
	if (annotation.aabb) {
		annotation.aabb.w = size.width;
		annotation.aabb.h = size.height;
	}
	return annotation;
}

export function duplicateAnnotation(annotation: Annotation): Annotation {
	const aabb = annotation.aabb
		? { ...annotation.aabb, x: annotation.aabb.x + 4, y: annotation.aabb.y + 4 }
		: null;
	const point = annotation.point
		? { ...annotation.point, x: annotation.point.x + 4, y: annotation.point.y + 4 }
		: null;

	return {
		id: makeId(),
		entityType: annotation.entityType,
		aabb,
		point,
		properties: JSON.parse(JSON.stringify(annotation.properties)),
		...(annotation._stash
			? { _stash: JSON.parse(JSON.stringify(annotation._stash)) }
			: {}),
	};
}

export function migrateEntityType(
	annotation: Annotation,
	spec: SpanSpec,
	newType: string,
): Annotation {
	const newEntity = getEntityByLabel(spec, newType);
	if (!newEntity) throw new Error(`Unknown entity type: ${newType}`);

	// Build new primary shape, keeping position if same kind
	let aabb: Annotation["aabb"] = null;
	let point: Annotation["point"] = null;

	if (newEntity.primaryShape.kind === "rect") {
		aabb = annotation.aabb
			? { ...annotation.aabb }
			: { x: annotation.point?.x ?? 0, y: annotation.point?.y ?? 0, w: 16, h: 16 };
	} else {
		point = annotation.point
			? { ...annotation.point }
			: { x: annotation.aabb?.x ?? 0, y: annotation.aabb?.y ?? 0 };
	}

	// Migrate properties
	const oldProps = { ...annotation.properties };
	const newProperties: Record<string, unknown> = {};
	const stash: Record<string, unknown> = { ...(annotation._stash ?? {}) };

	const newFieldNames = new Set(newEntity.properties.map((f) => f.name));

	// Stash old properties not in new type
	for (const [key, value] of Object.entries(oldProps)) {
		if (!newFieldNames.has(key)) {
			stash[key] = value;
		}
	}

	// Set new properties
	for (const field of newEntity.properties) {
		if (field.name in oldProps) {
			newProperties[field.name] = oldProps[field.name];
		} else if (field.name in stash) {
			newProperties[field.name] = stash[field.name];
			delete stash[field.name];
		} else {
			switch (field.kind) {
				case "scalar": newProperties[field.name] = defaultForScalar(field); break;
				case "enum": newProperties[field.name] = defaultForEnum(field); break;
				case "color": newProperties[field.name] = defaultForColor(); break;
				case "shape": newProperties[field.name] = defaultForShape(field); break;
			}
		}
	}

	return {
		id: annotation.id,
		entityType: newType,
		aabb,
		point,
		properties: newProperties,
		...(Object.keys(stash).length > 0 ? { _stash: stash } : {}),
	};
}

export function clampToImage(
	annotation: Annotation,
	imgW: number,
	imgH: number,
): void {
	if (annotation.aabb) {
		const a = annotation.aabb;
		a.w = Math.max(1, Math.min(Math.round(a.w), imgW));
		a.h = Math.max(1, Math.min(Math.round(a.h), imgH));
		a.x = Math.max(0, Math.min(Math.round(a.x), imgW - a.w));
		a.y = Math.max(0, Math.min(Math.round(a.y), imgH - a.h));
	}
	if (annotation.point) {
		const p = annotation.point;
		p.x = Math.max(0, Math.min(Math.round(p.x), imgW));
		p.y = Math.max(0, Math.min(Math.round(p.y), imgH));
	}
}

/** Resolve the absolute position of a shape property (relative to aabb). */
export function resolveShapePropertyPosition(
	annotation: Annotation,
	shapeValue: { x: number; y: number },
): { x: number; y: number } {
	const base = annotation.aabb ?? { x: 0, y: 0 };
	return {
		x: base.x + shapeValue.x,
		y: base.y + shapeValue.y,
	};
}
