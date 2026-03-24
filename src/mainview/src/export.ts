// src/mainview/src/export.ts
import YAML from "yaml";
import type { SpanSpec } from "./spec/types";
import type { Annotation } from "./annotation";

// Use the WorkspaceSheet interface inline since workspace.ts isn't created yet
interface WorkspaceSheetLike {
	path: string;
	annotations: Annotation[];
}

export interface ExportSheet {
	file: string;
	[entityType: string]: unknown; // entity type → annotation array
}

export function buildExportData(
	sheets: WorkspaceSheetLike[],
	spec: SpanSpec,
	root: string,
): { sheets: ExportSheet[] } {
	const result: ExportSheet[] = [];

	for (const sheet of sheets) {
		// Group annotations by entity type
		const groups = new Map<string, Record<string, unknown>[]>();

		for (const ann of sheet.annotations) {
			const entityDef = spec.entities[ann.entityType];
			if (!entityDef) continue; // skip orphaned annotations

			// Build flattened object: shape fields first (spec order), then properties (spec order)
			const flat: Record<string, unknown> = {};

			for (const field of entityDef.shape.fields) {
				flat[field.name] = ann.shapeData[field.name] ?? 0;
			}
			for (const prop of entityDef.properties) {
				flat[prop.name] = ann.propertyData[prop.name] ?? null;
			}

			if (!groups.has(ann.entityType)) {
				groups.set(ann.entityType, []);
			}
			groups.get(ann.entityType)!.push(flat);
		}

		if (groups.size === 0) continue; // skip sheets with no valid annotations

		const exportSheet: ExportSheet = { file: sheet.path };
		for (const [entityType, annotations] of groups) {
			exportSheet[entityType] = annotations;
		}
		result.push(exportSheet);
	}

	return { sheets: result };
}

export function exportToString(
	sheets: WorkspaceSheetLike[],
	spec: SpanSpec,
	root: string,
): string {
	const data = buildExportData(sheets, spec, root);

	if (spec.format === "yaml") {
		return YAML.stringify(data, {
			flowCollectionPadding: true,
			defaultKeyType: "PLAIN",
			defaultStringType: "QUOTE_DOUBLE",
		});
	}
	return JSON.stringify(data, null, 2) + "\n";
}
