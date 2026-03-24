// src/mainview/src/export.ts
import YAML from "yaml";
import type { SpanSpec } from "./spec/types";
import { getEntityByLabel } from "./spec/types";
import type { Annotation } from "./annotation";
import { relativePath } from "./workspace";

export function buildExportData(
	annotations: Annotation[],
	spec: SpanSpec,
	workspaceRoot: string,
): Record<string, unknown> {
	// Start output with frontmatter values
	const output: Record<string, unknown> = { ...spec.frontmatter };

	// Group annotations by their entity's group key
	const groups = new Map<string, { group: string; items: Record<string, unknown>[] }>();

	for (const ann of annotations) {
		const entityDef = getEntityByLabel(spec, ann.entityType);
		if (!entityDef) continue; // skip orphaned annotations

		const groupKey = entityDef.group;

		if (!groups.has(groupKey)) {
			groups.set(groupKey, { group: groupKey, items: [] });
		}

		// Build the flat annotation object in spec field order
		const flat: Record<string, unknown> = {};

		for (const field of entityDef.fields) {
			if (field.kind === "shape") {
				// Nest shape fields under the shape name
				const shapeData = ann.shapes[field.name] ?? {};
				const nested: Record<string, unknown> = {};
				for (const shapeField of field.shapeFields) {
					nested[shapeField.name] = shapeData[shapeField.name] ?? 0;
				}
				flat[field.name] = nested;
			} else if (field.kind === "scalar") {
				flat[field.name] = ann.propertyData[field.name] ?? null;
			} else if (field.kind === "path") {
				const rawPath = ann.propertyData[field.name];
				if (field.pathType === "RelativePath" && typeof rawPath === "string" && rawPath !== "") {
					// Make relative to workspace root
					flat[field.name] = "./" + relativePath(rawPath, workspaceRoot);
				} else {
					// Path — emit as-is (absolute)
					flat[field.name] = rawPath ?? "";
				}
			}
		}

		groups.get(groupKey)!.items.push(flat);
	}

	// Write non-empty groups to output
	for (const [groupKey, { items }] of groups) {
		if (items.length > 0) {
			output[groupKey] = items;
		}
	}

	return output;
}

export function exportToString(
	annotations: Annotation[],
	spec: SpanSpec,
	workspaceRoot: string,
): string {
	const data = buildExportData(annotations, spec, workspaceRoot);

	if (spec.format === "yaml") {
		return YAML.stringify(data, {
			flowCollectionPadding: true,
			defaultKeyType: "PLAIN",
			defaultStringType: "QUOTE_DOUBLE",
		});
	}
	return JSON.stringify(data, null, 2) + "\n";
}
