// src/mainview/src/spec/diff.ts
import type { SpanSpec, SpecDiff, SpecChange } from "./types";

// integer → number is a safe widening
function isTypeWidening(from: string, to: string): boolean {
	return from === "integer" && to === "number";
}

export function diffSpecs(oldSpec: SpanSpec, newSpec: SpanSpec): SpecDiff {
	const changes: SpecChange[] = [];

	const oldEntities = Object.keys(oldSpec.entities);
	const newEntities = Object.keys(newSpec.entities);
	const oldSet = new Set(oldEntities);
	const newSet = new Set(newEntities);

	// Added entities
	for (const name of newEntities) {
		if (!oldSet.has(name)) {
			changes.push({
				entity: name,
				kind: "entity_added",
				destructive: false,
				description: `Added entity: ${name}`,
			});
		}
	}

	// Removed entities
	for (const name of oldEntities) {
		if (!newSet.has(name)) {
			changes.push({
				entity: name,
				kind: "entity_removed",
				destructive: true,
				description: `Removed entity: ${name} (existing annotations will be orphaned)`,
			});
		}
	}

	// Changed entities
	for (const name of oldEntities) {
		if (!newSet.has(name)) continue;

		const oldEnt = oldSpec.entities[name];
		const newEnt = newSpec.entities[name];

		// Shape type change
		if (oldEnt.shape.type !== newEnt.shape.type) {
			changes.push({
				entity: name,
				kind: "shape_type_changed",
				destructive: true,
				description: `${name} shape changed from ${oldEnt.shape.type} to ${newEnt.shape.type}`,
			});
		}

		// Property changes
		const oldProps = new Map(oldEnt.properties.map((p) => [p.name, p]));
		const newProps = new Map(newEnt.properties.map((p) => [p.name, p]));

		// Added properties
		for (const [propName] of newProps) {
			if (!oldProps.has(propName)) {
				changes.push({
					entity: name,
					field: propName,
					kind: "property_added",
					destructive: false,
					description: `Added ${name}.${propName}`,
				});
			}
		}

		// Removed properties
		for (const [propName] of oldProps) {
			if (!newProps.has(propName)) {
				changes.push({
					entity: name,
					field: propName,
					kind: "property_removed",
					destructive: true,
					description: `Removed ${name}.${propName} (data will be lost)`,
				});
			}
		}

		// Type changes
		for (const [propName, oldProp] of oldProps) {
			const newProp = newProps.get(propName);
			if (!newProp) continue;
			if (oldProp.type !== newProp.type) {
				const widening = isTypeWidening(oldProp.type, newProp.type);
				changes.push({
					entity: name,
					field: propName,
					kind: "property_type_changed",
					destructive: !widening,
					description: widening
						? `${name}.${propName} widened from ${oldProp.type} to ${newProp.type}`
						: `${name}.${propName} changed from ${oldProp.type} to ${newProp.type}`,
				});
			}
		}
	}

	return {
		safe: !changes.some((c) => c.destructive),
		changes,
	};
}
