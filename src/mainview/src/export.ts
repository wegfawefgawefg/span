// src/mainview/src/export.ts
import YAML from "yaml";
import type { SpanSpec } from "./spec/types";
import { getEntityByLabel } from "./spec/types";
import type { Annotation } from "./annotation";

export interface ExportEntry {
	annotation: Annotation;
	sheetFile: string;
}

export interface ShapeFieldOverrides {
	rect?: [string, string, string, string]; // [x, y, w, h]
	point?: [string, string];                 // [x, y]
}

function remapRect(
	data: { x: number; y: number; w: number; h: number },
	overrides?: [string, string, string, string],
): Record<string, number> {
	const [xKey, yKey, wKey, hKey] = overrides ?? ["x", "y", "w", "h"];
	return { [xKey]: data.x, [yKey]: data.y, [wKey]: data.w, [hKey]: data.h };
}

function remapPoint(
	data: { x: number; y: number },
	overrides?: [string, string],
): Record<string, number> {
	const [xKey, yKey] = overrides ?? ["x", "y"];
	return { [xKey]: data.x, [yKey]: data.y };
}

function remapShapeValue(
	value: unknown,
	shapeType: "rect" | "point",
	array: boolean,
	overrides?: ShapeFieldOverrides,
): unknown {
	if (array) {
		const arr = Array.isArray(value) ? value : [];
		return arr.map((item: any) =>
			shapeType === "rect"
				? remapRect(item, overrides?.rect)
				: remapPoint(item, overrides?.point),
		);
	}
	if (shapeType === "rect") {
		return remapRect(value as any, overrides?.rect);
	}
	return remapPoint(value as any, overrides?.point);
}

export function buildExportData(
	entries: ExportEntry[],
	spec: SpanSpec,
	shapeFields?: ShapeFieldOverrides,
): Record<string, unknown> {
	const output: Record<string, unknown> = {};
	const groups = new Map<string, { items: Record<string, unknown>[] }>();

	for (const { annotation: ann, sheetFile } of entries) {
		const entityDef = getEntityByLabel(spec, ann.entityType);
		if (!entityDef) continue;

		const groupKey = entityDef.group;
		if (!groups.has(groupKey)) {
			groups.set(groupKey, { items: [] });
		}

		const flat: Record<string, unknown> = {};

		// Path field (from sheet filename)
		if (entityDef.hasPath) {
			flat["path"] = sheetFile;
		}

		// Primary shape
		if (ann.aabb) {
			flat["aabb"] = remapRect(ann.aabb, shapeFields?.rect);
		} else if (ann.point) {
			flat["point"] = remapPoint(ann.point, shapeFields?.point);
		}

		// Chroma key
		if (entityDef.hasChromaKey && ann.chromaKey) {
			flat["chroma_key"] = ann.chromaKey;
		}

		if (entityDef.nameField) {
			flat["name"] = ann.properties.name ?? null;
		}
		if (entityDef.frameField) {
			flat["frame"] = ann.properties.frame ?? null;
		}
		if (entityDef.durationField) {
			flat["duration"] = ann.properties.duration ?? null;
		}
		if (entityDef.offsetField) {
			flat["offset"] = remapPoint(
				(ann.properties.offset as { x: number; y: number } | undefined) ?? { x: 0, y: 0 },
				shapeFields?.point,
			);
		}

		// Properties in spec order
		for (const field of entityDef.properties) {
			const value = ann.properties[field.name];
			if (field.kind === "shape") {
				flat[field.name] = remapShapeValue(value, field.shapeType, field.array, shapeFields);
			} else {
				flat[field.name] = value ?? null;
			}
		}

		groups.get(groupKey)!.items.push(flat);
	}

	for (const [groupKey, { items }] of groups) {
		if (items.length > 0) {
			output[groupKey] = items;
		}
	}

	return output;
}

export function exportToString(
	entries: ExportEntry[],
	spec: SpanSpec,
	shapeFields?: ShapeFieldOverrides,
): string {
	const data = buildExportData(entries, spec, shapeFields);

	if (spec.format === "yaml") {
		return YAML.stringify(data, {
			flowCollectionPadding: true,
			defaultKeyType: "PLAIN",
			defaultStringType: "QUOTE_DOUBLE",
		});
	}
	return JSON.stringify(data, null, 2) + "\n";
}
