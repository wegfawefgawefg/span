// src/mainview/src/spec/diff.ts
import type { SpanSpec, SpecDiff, SpecChange, PropertyField } from "./types";

function isTypeWidening(from: string, to: string): boolean {
	return from === "integer" && to === "number";
}

function fieldTypeKey(field: PropertyField): string {
	switch (field.kind) {
		case "scalar": return `scalar:${field.type}`;
		case "enum": return "enum";
		case "color": return "color";
		case "shape": return `shape:${field.shapeType}${field.array ? "[]" : ""}`;
	}
}

export function diffSpecs(oldSpec: SpanSpec, newSpec: SpanSpec): SpecDiff {
	const changes: SpecChange[] = [];

	const oldEntities = new Map(oldSpec.entities.map((e) => [e.label, e]));
	const newEntities = new Map(newSpec.entities.map((e) => [e.label, e]));

	for (const [label] of newEntities) {
		if (!oldEntities.has(label)) {
			changes.push({
				entity: label,
				kind: "entity_added",
				destructive: false,
				description: `Added entity: ${label}`,
			});
		}
	}

	for (const [label] of oldEntities) {
		if (!newEntities.has(label)) {
			changes.push({
				entity: label,
				kind: "entity_removed",
				destructive: true,
				description: `Removed entity: ${label} (existing annotations will be orphaned)`,
			});
		}
	}

	for (const [label, oldEnt] of oldEntities) {
		const newEnt = newEntities.get(label);
		if (!newEnt) continue;

		if (oldEnt.primaryShape.kind !== newEnt.primaryShape.kind) {
			changes.push({
				entity: label,
				kind: "primary_shape_changed",
				destructive: true,
				description: `${label} primary shape changed from ${oldEnt.primaryShape.kind} to ${newEnt.primaryShape.kind}`,
			});
		}

		const oldFields = new Map(oldEnt.properties.map((f) => [f.name, f]));
		const newFields = new Map(newEnt.properties.map((f) => [f.name, f]));

		for (const [fieldName] of newFields) {
			if (!oldFields.has(fieldName)) {
				changes.push({
					entity: label,
					field: fieldName,
					kind: "field_added",
					destructive: false,
					description: `Added ${label}.${fieldName}`,
				});
			}
		}

		for (const [fieldName] of oldFields) {
			if (!newFields.has(fieldName)) {
				changes.push({
					entity: label,
					field: fieldName,
					kind: "field_removed",
					destructive: true,
					description: `Removed ${label}.${fieldName} (data will be lost)`,
				});
			}
		}

		for (const [fieldName, oldField] of oldFields) {
			const newField = newFields.get(fieldName);
			if (!newField) continue;

			if (oldField.kind !== newField.kind) {
				changes.push({
					entity: label,
					field: fieldName,
					kind: "field_type_changed",
					destructive: true,
					description: `${label}.${fieldName} changed kind from ${oldField.kind} to ${newField.kind}`,
				});
			} else if (oldField.kind === "scalar" && newField.kind === "scalar" && oldField.type !== newField.type) {
				const widening = isTypeWidening(oldField.type, newField.type);
				changes.push({
					entity: label,
					field: fieldName,
					kind: "field_type_changed",
					destructive: !widening,
					description: widening
						? `${label}.${fieldName} widened from ${oldField.type} to ${newField.type}`
						: `${label}.${fieldName} changed from ${oldField.type} to ${newField.type}`,
				});
			} else if (oldField.kind === "shape" && newField.kind === "shape") {
				if (oldField.shapeType !== newField.shapeType || oldField.array !== newField.array) {
					changes.push({
						entity: label,
						field: fieldName,
						kind: "field_type_changed",
						destructive: true,
						description: `${label}.${fieldName} shape changed from ${fieldTypeKey(oldField)} to ${fieldTypeKey(newField)}`,
					});
				}
			}
		}
	}

	return {
		safe: !changes.some((c) => c.destructive),
		changes,
	};
}
