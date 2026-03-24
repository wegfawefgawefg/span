// src/mainview/src/spec/diff.ts
import type { SpanSpec, SpecDiff, SpecChange, SpecField } from "./types";

// integer → number is a safe widening
function isTypeWidening(from: string, to: string): boolean {
	return from === "integer" && to === "number";
}

export function diffSpecs(oldSpec: SpanSpec, newSpec: SpanSpec): SpecDiff {
	const changes: SpecChange[] = [];

	const oldEntities = new Map(oldSpec.entities.map((e) => [e.label, e]));
	const newEntities = new Map(newSpec.entities.map((e) => [e.label, e]));

	// Added entities
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

	// Removed entities
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

	// Changed entities (present in both)
	for (const [label, oldEnt] of oldEntities) {
		const newEnt = newEntities.get(label);
		if (!newEnt) continue;

		const oldFields = new Map(oldEnt.fields.map((f) => [f.name, f]));
		const newFields = new Map(newEnt.fields.map((f) => [f.name, f]));

		// Added fields
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

		// Removed fields
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

		// Changed fields (present in both)
		for (const [fieldName, oldField] of oldFields) {
			const newField = newFields.get(fieldName);
			if (!newField) continue;

			changes.push(...compareFields(label, fieldName, oldField, newField));
		}
	}

	return {
		safe: !changes.some((c) => c.destructive),
		changes,
	};
}

function compareFields(
	entity: string,
	fieldName: string,
	oldField: SpecField,
	newField: SpecField,
): SpecChange[] {
	const changes: SpecChange[] = [];

	// Kind changed (shape ↔ scalar, shape ↔ path, scalar ↔ path) — always destructive
	if (oldField.kind !== newField.kind) {
		changes.push({
			entity,
			field: fieldName,
			kind: "field_type_changed",
			destructive: true,
			description: `${entity}.${fieldName} changed kind from ${oldField.kind} to ${newField.kind}`,
		});
		return changes;
	}

	// Same kind — compare type details
	if (oldField.kind === "shape" && newField.kind === "shape") {
		if (oldField.shapeType !== newField.shapeType) {
			changes.push({
				entity,
				field: fieldName,
				kind: "shape_type_changed",
				destructive: true,
				description: `${entity}.${fieldName} shape changed from ${oldField.shapeType} to ${newField.shapeType}`,
			});
		}
	} else if (oldField.kind === "scalar" && newField.kind === "scalar") {
		if (oldField.type !== newField.type) {
			const widening = isTypeWidening(oldField.type, newField.type);
			changes.push({
				entity,
				field: fieldName,
				kind: "field_type_changed",
				destructive: !widening,
				description: widening
					? `${entity}.${fieldName} widened from ${oldField.type} to ${newField.type}`
					: `${entity}.${fieldName} changed from ${oldField.type} to ${newField.type}`,
			});
		}
	}
	// path kind: PathType change (Path ↔ RelativePath) — not tracked as destructive since
	// the underlying value format is the same; no change recorded.

	return changes;
}
