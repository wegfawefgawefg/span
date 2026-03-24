// src/mainview/src/annotation.ts
import type { SpanSpec, ShapeMapping } from "./spec/types";
import { defaultForProperty, defaultForShapeField } from "./spec/types";
import { makeId } from "./types";

export type PolygonVertices = Array<Record<string, number>>;

export interface Annotation {
	id: string;
	entityType: string;
	shapeData: Record<string, number | PolygonVertices>;
	propertyData: Record<string, unknown>;
	_stash?: Record<string, unknown>;
}

function getMapping(spec: SpanSpec, entityType: string): ShapeMapping | null {
	return spec.entities[entityType]?.shape.mapping ?? null;
}

export function createAnnotation(
	spec: SpanSpec,
	entityType: string,
	position: { x: number; y: number },
): Annotation {
	const entity = spec.entities[entityType];
	if (!entity) throw new Error(`Unknown entity type: ${entityType}`);

	const mapping = entity.shape.mapping;
	const shapeData: Record<string, number> = {};

	// Set defaults for all shape fields
	for (const field of entity.shape.fields) {
		shapeData[field.name] = defaultForShapeField();
	}

	// Apply position and sensible defaults based on shape type
	if (mapping) {
		switch (mapping.type) {
			case "rect":
				shapeData[mapping.x] = position.x;
				shapeData[mapping.y] = position.y;
				shapeData[mapping.width] = 16;
				shapeData[mapping.height] = 16;
				break;
			case "point":
				shapeData[mapping.x] = position.x;
				shapeData[mapping.y] = position.y;
				break;
			case "circle":
				shapeData[mapping.x] = position.x;
				shapeData[mapping.y] = position.y;
				shapeData[mapping.radius] = 8;
				break;
			case "polygon":
				// Polygons start empty — user adds vertices by clicking
				break;
		}
	}

	// Set property defaults
	const propertyData: Record<string, unknown> = {};
	for (const prop of entity.properties) {
		propertyData[prop.name] = defaultForProperty(prop);
	}

	return { id: makeId(), entityType, shapeData, propertyData };
}

export function migrateEntityType(
	annotation: Annotation,
	spec: SpanSpec,
	newType: string,
): Annotation {
	const newEntity = spec.entities[newType];
	if (!newEntity) throw new Error(`Unknown entity type: ${newType}`);

	// Build new shape data with defaults
	const newShapeData: Record<string, number> = {};
	for (const field of newEntity.shape.fields) {
		newShapeData[field.name] = defaultForShapeField();
	}

	// Migrate properties — keep shared, stash removed, default new
	const oldProps = { ...annotation.propertyData };
	const newPropertyData: Record<string, unknown> = {};
	const stash: Record<string, unknown> = { ...(annotation._stash ?? {}) };

	const newPropNames = new Set(newEntity.properties.map((p) => p.name));

	// Stash old properties not in new type
	for (const [key, value] of Object.entries(oldProps)) {
		if (!newPropNames.has(key)) {
			stash[key] = value;
		}
	}

	// Set new properties — use old value if available, then stash, then default
	for (const prop of newEntity.properties) {
		if (prop.name in oldProps) {
			newPropertyData[prop.name] = oldProps[prop.name];
		} else if (prop.name in stash) {
			newPropertyData[prop.name] = stash[prop.name];
			delete stash[prop.name];
		} else {
			newPropertyData[prop.name] = defaultForProperty(prop);
		}
	}

	return {
		id: annotation.id,
		entityType: newType,
		shapeData: newShapeData,
		propertyData: newPropertyData,
		...(Object.keys(stash).length > 0 ? { _stash: stash } : {}),
	};
}

export function getShapeRect(
	annotation: Annotation,
	spec: SpanSpec,
): { x: number; y: number; width: number; height: number } | null {
	const mapping = getMapping(spec, annotation.entityType);
	if (!mapping || mapping.type !== "rect") return null;

	const x = annotation.shapeData[mapping.x] as number;
	const y = annotation.shapeData[mapping.y] as number;
	const w = annotation.shapeData[mapping.width] as number;
	const h = annotation.shapeData[mapping.height] as number;

	// TODO: LTRB detection — for now assume XYWH
	return { x, y, width: w, height: h };
}

export function getShapePosition(
	annotation: Annotation,
	spec: SpanSpec,
): { x: number; y: number } | null {
	const mapping = getMapping(spec, annotation.entityType);
	if (!mapping) return null;

	switch (mapping.type) {
		case "rect":
		case "point":
			return {
				x: annotation.shapeData[mapping.x] as number,
				y: annotation.shapeData[mapping.y] as number,
			};
		case "circle":
			return {
				x: annotation.shapeData[mapping.x] as number,
				y: annotation.shapeData[mapping.y] as number,
			};
		case "polygon":
			return null; // polygons don't have a single position
	}
}

export function duplicateAnnotation(
	annotation: Annotation,
	spec: SpanSpec,
): Annotation {
	const mapping = getMapping(spec, annotation.entityType);
	const newShapeData = { ...annotation.shapeData };

	// Offset position by 4px via mapping
	if (mapping) {
		switch (mapping.type) {
			case "rect":
			case "point":
				(newShapeData[mapping.x] as number) += 4;
				(newShapeData[mapping.y] as number) += 4;
				break;
			case "circle":
				(newShapeData[mapping.x] as number) += 4;
				(newShapeData[mapping.y] as number) += 4;
				break;
			case "polygon":
				// TODO: offset all vertices
				break;
		}
	}

	return {
		id: makeId(),
		entityType: annotation.entityType,
		shapeData: newShapeData,
		propertyData: { ...annotation.propertyData },
	};
}

export function clampToImage(
	annotation: Annotation,
	spec: SpanSpec,
	imgW: number,
	imgH: number,
): void {
	const mapping = getMapping(spec, annotation.entityType);
	if (!mapping) return;

	switch (mapping.type) {
		case "rect": {
			let x = annotation.shapeData[mapping.x] as number;
			let y = annotation.shapeData[mapping.y] as number;
			let w = annotation.shapeData[mapping.width] as number;
			let h = annotation.shapeData[mapping.height] as number;
			w = Math.max(1, Math.min(Math.round(w), imgW));
			h = Math.max(1, Math.min(Math.round(h), imgH));
			x = Math.max(0, Math.min(Math.round(x), imgW - w));
			y = Math.max(0, Math.min(Math.round(y), imgH - h));
			annotation.shapeData[mapping.x] = x;
			annotation.shapeData[mapping.y] = y;
			annotation.shapeData[mapping.width] = w;
			annotation.shapeData[mapping.height] = h;
			break;
		}
		case "point": {
			annotation.shapeData[mapping.x] = Math.max(0, Math.min(Math.round(annotation.shapeData[mapping.x] as number), imgW));
			annotation.shapeData[mapping.y] = Math.max(0, Math.min(Math.round(annotation.shapeData[mapping.y] as number), imgH));
			break;
		}
		case "circle": {
			const r = annotation.shapeData[mapping.radius] as number;
			annotation.shapeData[mapping.x] = Math.max(r, Math.min(Math.round(annotation.shapeData[mapping.x] as number), imgW - r));
			annotation.shapeData[mapping.y] = Math.max(r, Math.min(Math.round(annotation.shapeData[mapping.y] as number), imgH - r));
			break;
		}
	}
}
