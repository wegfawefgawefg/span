// src/mainview/src/annotation.ts
import type {
	SpanSpec,
	EntityDef,
	ShapeSpecField,
} from "./spec/types";
import {
	getEntityByLabel,
	getShapesForEntity,
	getScalarsForEntity,
	getPathFieldForEntity,
	getPrimaryShapeName as getPrimaryShapeNameFromEntity,
	defaultForScalar,
	defaultForShapeField,
} from "./spec/types";
import { makeId } from "./types";

export interface Annotation {
	id: string;
	entityType: string; // matches entity's label
	shapes: Record<string, Record<string, number>>; // shapeName → { fieldName: value }
	propertyData: Record<string, unknown>; // scalar + Path properties
	_stash?: Record<string, unknown>;
}

export function createAnnotation(
	spec: SpanSpec,
	entityType: string,
	position: { x: number; y: number },
): Annotation {
	const entity = getEntityByLabel(spec, entityType);
	if (!entity) throw new Error(`Unknown entity type: ${entityType}`);

	const shapeFields = getShapesForEntity(entity);
	const shapes: Record<string, Record<string, number>> = {};

	for (let i = 0; i < shapeFields.length; i++) {
		const sf = shapeFields[i];
		const isPrimary = i === 0;

		let pos: { x: number; y: number };
		if (sf.reference) {
			// Referenced shapes store relative offsets — default to 0,0
			pos = { x: 0, y: 0 };
		} else {
			const offset = isPrimary ? 0 : i * 4;
			pos = { x: position.x + offset, y: position.y + offset };
		}

		shapes[sf.name] = buildShapeDefaults(sf, pos);
	}

	// Set property defaults (scalars + paths)
	const propertyData: Record<string, unknown> = {};
	for (const field of entity.fields) {
		if (field.kind === "scalar") {
			propertyData[field.name] = defaultForScalar(field);
		} else if (field.kind === "path") {
			propertyData[field.name] = "";
		}
	}

	return { id: makeId(), entityType, shapes, propertyData };
}

function buildShapeDefaults(
	sf: ShapeSpecField,
	position: { x: number; y: number },
): Record<string, number> {
	const data: Record<string, number> = {};

	// Initialize all fields to 0
	for (const field of sf.shapeFields) {
		data[field.name] = defaultForShapeField();
	}

	// Apply position and sensible defaults based on mapping
	const mapping = sf.mapping;
	if (mapping) {
		switch (mapping.type) {
			case "rect":
				data[mapping.x] = position.x;
				data[mapping.y] = position.y;
				data[mapping.width] = 16;
				data[mapping.height] = 16;
				break;
			case "point":
				data[mapping.x] = position.x;
				data[mapping.y] = position.y;
				break;
			case "circle":
				data[mapping.x] = position.x;
				data[mapping.y] = position.y;
				data[mapping.radius] = 8;
				break;
			case "polygon":
				// Polygons start empty
				break;
		}
	}

	return data;
}

export function createAnnotationWithSize(
	spec: SpanSpec,
	entityType: string,
	position: { x: number; y: number },
	size: { width?: number; height?: number; radius?: number },
): Annotation {
	const annotation = createAnnotation(spec, entityType, position);

	// Override primary shape dimensions with drawn size
	const entity = getEntityByLabel(spec, entityType);
	if (!entity) return annotation;

	const shapes = getShapesForEntity(entity);
	if (shapes.length === 0) return annotation;

	const primary = shapes[0];
	const mapping = primary.mapping;
	if (!mapping) return annotation;

	const shapeData = annotation.shapes[primary.name];
	if (!shapeData) return annotation;

	if (mapping.type === "rect" && size.width !== undefined && size.height !== undefined) {
		shapeData[mapping.width] = size.width;
		shapeData[mapping.height] = size.height;
	} else if (mapping.type === "circle" && size.radius !== undefined) {
		shapeData[mapping.radius] = size.radius;
	}

	return annotation;
}

/**
 * Resolve the absolute position of a shape, following __reference chains.
 * Returns the absolute x/y by adding stored offsets to the reference shape's resolved position.
 */
export function resolveAbsolutePosition(
	annotation: Annotation,
	spec: SpanSpec,
	shapeName: string,
): { x: number; y: number } | null {
	const entity = getEntityByLabel(spec, annotation.entityType);
	if (!entity) return null;

	const sf = getShapesForEntity(entity).find((s) => s.name === shapeName);
	if (!sf?.mapping) return null;

	const shapeData = annotation.shapes[shapeName];
	if (!shapeData) return null;

	let x: number;
	let y: number;

	switch (sf.mapping.type) {
		case "rect":
		case "point":
		case "circle":
			x = shapeData[sf.mapping.x];
			y = shapeData[sf.mapping.y];
			break;
		default:
			return null;
	}

	if (sf.reference) {
		const refPos = resolveAbsolutePosition(annotation, spec, sf.reference);
		if (refPos) {
			x += refPos.x;
			y += refPos.y;
		}
	}

	return { x, y };
}

export function getShapeRect(
	annotation: Annotation,
	spec: SpanSpec,
	shapeName: string,
): { x: number; y: number; width: number; height: number } | null {
	const entity = getEntityByLabel(spec, annotation.entityType);
	if (!entity) return null;

	const shapeField = getShapesForEntity(entity).find(
		(s) => s.name === shapeName,
	);
	if (!shapeField) return null;

	const mapping = shapeField.mapping;
	if (!mapping || mapping.type !== "rect") return null;

	const shapeData = annotation.shapes[shapeName];
	if (!shapeData) return null;

	const pos = resolveAbsolutePosition(annotation, spec, shapeName);
	if (!pos) return null;

	return {
		x: pos.x,
		y: pos.y,
		width: shapeData[mapping.width],
		height: shapeData[mapping.height],
	};
}

export function getShapePosition(
	annotation: Annotation,
	spec: SpanSpec,
	shapeName: string,
): { x: number; y: number } | null {
	return resolveAbsolutePosition(annotation, spec, shapeName);
}

export function getPrimaryShapeName(
	spec: SpanSpec,
	entityType: string,
): string | null {
	const entity = getEntityByLabel(spec, entityType);
	if (!entity) return null;
	return getPrimaryShapeNameFromEntity(entity);
}

export function duplicateAnnotation(
	annotation: Annotation,
	spec: SpanSpec,
): Annotation {
	const entity = getEntityByLabel(spec, annotation.entityType);

	// Deep copy all shapes
	const newShapes: Record<string, Record<string, number>> = {};
	for (const [shapeName, shapeData] of Object.entries(annotation.shapes)) {
		newShapes[shapeName] = { ...shapeData };
	}

	// Offset primary shape position by 4px
	if (entity) {
		const primaryName = getPrimaryShapeNameFromEntity(entity);
		if (primaryName && newShapes[primaryName]) {
			const primaryField = getShapesForEntity(entity).find(
				(s) => s.name === primaryName,
			);
			if (primaryField?.mapping) {
				const mapping = primaryField.mapping;
				switch (mapping.type) {
					case "rect":
					case "point":
						newShapes[primaryName][mapping.x] += 4;
						newShapes[primaryName][mapping.y] += 4;
						break;
					case "circle":
						newShapes[primaryName][mapping.x] += 4;
						newShapes[primaryName][mapping.y] += 4;
						break;
					case "polygon":
						break;
				}
			}
		}
	}

	return {
		id: makeId(),
		entityType: annotation.entityType,
		shapes: newShapes,
		propertyData: JSON.parse(JSON.stringify(annotation.propertyData)),
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

	// Build new shapes with defaults (all at origin)
	const shapeFields = getShapesForEntity(newEntity);
	const newShapes: Record<string, Record<string, number>> = {};
	for (const sf of shapeFields) {
		const data: Record<string, number> = {};
		for (const field of sf.shapeFields) {
			data[field.name] = defaultForShapeField();
		}
		newShapes[sf.name] = data;
	}

	// Migrate scalar properties — keep shared, stash removed, default new
	const oldProps = { ...annotation.propertyData };
	const newPropertyData: Record<string, unknown> = {};
	const stash: Record<string, unknown> = { ...(annotation._stash ?? {}) };

	// Collect new scalar+path field names
	const newFieldNames = new Set<string>();
	for (const field of newEntity.fields) {
		if (field.kind === "scalar" || field.kind === "path") {
			newFieldNames.add(field.name);
		}
	}

	// Stash old properties not in new type
	for (const [key, value] of Object.entries(oldProps)) {
		if (!newFieldNames.has(key)) {
			stash[key] = value;
		}
	}

	// Set new properties — use old value if available, then stash, then default
	for (const field of newEntity.fields) {
		if (field.kind === "scalar") {
			if (field.name in oldProps) {
				newPropertyData[field.name] = oldProps[field.name];
			} else if (field.name in stash) {
				newPropertyData[field.name] = stash[field.name];
				delete stash[field.name];
			} else {
				newPropertyData[field.name] = defaultForScalar(field);
			}
		} else if (field.kind === "path") {
			if (field.name in oldProps) {
				newPropertyData[field.name] = oldProps[field.name];
			} else if (field.name in stash) {
				newPropertyData[field.name] = stash[field.name];
				delete stash[field.name];
			} else {
				newPropertyData[field.name] = "";
			}
		}
	}

	return {
		id: annotation.id,
		entityType: newType,
		shapes: newShapes,
		propertyData: newPropertyData,
		...(Object.keys(stash).length > 0 ? { _stash: stash } : {}),
	};
}

export function clampToImage(
	annotation: Annotation,
	spec: SpanSpec,
	imgW: number,
	imgH: number,
): void {
	const entity = getEntityByLabel(spec, annotation.entityType);
	if (!entity) return;

	const shapeFields = getShapesForEntity(entity);

	for (const sf of shapeFields) {
		const shapeData = annotation.shapes[sf.name];
		if (!shapeData) continue;

		const mapping = sf.mapping;
		if (!mapping) continue;

		switch (mapping.type) {
			case "rect": {
				let w = Math.max(1, Math.min(Math.round(shapeData[mapping.width]), imgW));
				let h = Math.max(1, Math.min(Math.round(shapeData[mapping.height]), imgH));
				let x = Math.max(0, Math.min(Math.round(shapeData[mapping.x]), imgW - w));
				let y = Math.max(0, Math.min(Math.round(shapeData[mapping.y]), imgH - h));
				shapeData[mapping.x] = x;
				shapeData[mapping.y] = y;
				shapeData[mapping.width] = w;
				shapeData[mapping.height] = h;
				break;
			}
			case "point": {
				shapeData[mapping.x] = Math.max(
					0,
					Math.min(Math.round(shapeData[mapping.x]), imgW),
				);
				shapeData[mapping.y] = Math.max(
					0,
					Math.min(Math.round(shapeData[mapping.y]), imgH),
				);
				break;
			}
			case "circle": {
				const r = shapeData[mapping.radius];
				shapeData[mapping.x] = Math.max(
					r,
					Math.min(Math.round(shapeData[mapping.x]), imgW - r),
				);
				shapeData[mapping.y] = Math.max(
					r,
					Math.min(Math.round(shapeData[mapping.y]), imgH - r),
				);
				break;
			}
		}
	}
}
