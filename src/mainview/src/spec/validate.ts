// src/mainview/src/spec/validate.ts
import type { SpecError, ShapeType, ShapeField } from "./types";
import { inferShapeMapping } from "./infer";

const VALID_SHAPE_TYPES = new Set<string>(["rect", "point", "circle", "polygon"]);
const VALID_SHAPE_VALUE_TYPES = new Set<string>(["integer", "number"]);
const VALID_SCALAR_TYPES = new Set<string>([
	"string", "integer", "number", "boolean", "string[]", "ColorHEX",
]);
const LABEL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const EXPECTED_SHAPE_FIELDS: Record<string, number> = {
	rect: 4,
	point: 2,
	circle: 3,
	polygon: 1,
};

/**
 * Validate the entity array from a parsed spec.
 * Input is the raw entity list (frontmatter is parsed separately).
 */
export function validateSpec(raw: unknown): SpecError[] {
	const errors: SpecError[] = [];

	if (!Array.isArray(raw)) {
		errors.push({ path: "", severity: "error", message: "Spec must be an array of entity definitions" });
		return errors;
	}

	if (raw.length === 0) {
		errors.push({ path: "", severity: "error", message: "Spec must have at least one entity" });
		return errors;
	}

	const seenLabels = new Set<string>();
	const seenGroups = new Set<string>();

	for (let i = 0; i < raw.length; i++) {
		const entity = raw[i];
		const ePath = `[${i}]`;

		if (typeof entity !== "object" || entity === null || Array.isArray(entity)) {
			errors.push({ path: ePath, severity: "error", message: "Entity must be an object" });
			continue;
		}

		const ent = entity as Record<string, unknown>;

		// --- label ---
		if (typeof ent.label !== "string" || ent.label.length === 0) {
			errors.push({ path: `${ePath}.label`, severity: "error", message: "Entity must have a 'label' string" });
		} else if (!LABEL_RE.test(ent.label)) {
			errors.push({
				path: `${ePath}.label`,
				severity: "error",
				message: `Label "${ent.label}" must be a valid identifier (alphanumeric + underscore, no spaces)`,
			});
		} else if (seenLabels.has(ent.label)) {
			errors.push({
				path: `${ePath}.label`,
				severity: "error",
				message: `Duplicate label "${ent.label}"`,
			});
		} else {
			seenLabels.add(ent.label);
		}

		// --- group ---
		if (typeof ent.group !== "string" || ent.group.length === 0) {
			errors.push({ path: `${ePath}.group`, severity: "error", message: "Entity must have a 'group' string" });
		} else if (seenGroups.has(ent.group)) {
			errors.push({
				path: `${ePath}.group`,
				severity: "error",
				message: `Duplicate group "${ent.group}"`,
			});
		} else {
			seenGroups.add(ent.group);
		}

		// --- properties ---
		if (ent.properties !== undefined && (typeof ent.properties !== "object" || ent.properties === null || Array.isArray(ent.properties))) {
			errors.push({ path: `${ePath}.properties`, severity: "error", message: "Properties must be an object" });
			continue;
		}

		const properties = (ent.properties ?? {}) as Record<string, unknown>;
		const fieldNames = new Set<string>();
		const label = typeof ent.label === "string" ? ent.label : `entity[${i}]`;

		for (const [fieldName, fieldValue] of Object.entries(properties)) {
			const fPath = `${ePath}.properties.${fieldName}`;

			// Reserved __ prefix
			if (fieldName.startsWith("__")) {
				errors.push({
					path: fPath,
					severity: "error",
					message: `Field name "${fieldName}" is reserved (__ prefix)`,
				});
				continue;
			}

			// Duplicate field name
			if (fieldNames.has(fieldName)) {
				errors.push({
					path: fPath,
					severity: "error",
					message: `Duplicate field name "${fieldName}"`,
				});
				continue;
			}
			fieldNames.add(fieldName);

			// Determine field type
			if (typeof fieldValue === "object" && fieldValue !== null && !Array.isArray(fieldValue)) {
				const obj = fieldValue as Record<string, unknown>;

				if ("__shape" in obj) {
					// Shape field
					validateShapeField(obj, fPath, errors);
				} else if ("enum" in obj) {
					// Enum field
					validateEnumField(obj, fPath, errors);
				} else {
					errors.push({
						path: fPath,
						severity: "error",
						message: `Invalid field definition — object must have "__shape" or "enum" key`,
					});
				}
			} else if (typeof fieldValue === "string") {
				// Path type or scalar type
				if (fieldValue === "FileName") {
					// Valid path type — nothing more to check
				} else if (VALID_SCALAR_TYPES.has(fieldValue)) {
					// Valid scalar type
				} else {
					errors.push({
						path: fPath,
						severity: "error",
						message: `Unknown type "${fieldValue}". Must be one of: string, integer, number, boolean, string[], ColorHEX, FileName`,
					});
				}
			} else {
				errors.push({
					path: fPath,
					severity: "error",
					message: `Invalid field value for "${fieldName}"`,
				});
			}
		}

		// Validate __reference fields within shape properties
		const shapeNames: string[] = [];
		for (const [fieldName, fieldValue] of Object.entries(properties)) {
			if (typeof fieldValue === "object" && fieldValue !== null && !Array.isArray(fieldValue)) {
				const obj = fieldValue as Record<string, unknown>;
				if ("__shape" in obj) {
					shapeNames.push(fieldName);
				}
			}
		}

		for (const [fieldName, fieldValue] of Object.entries(properties)) {
			if (typeof fieldValue !== "object" || fieldValue === null || Array.isArray(fieldValue)) continue;
			const obj = fieldValue as Record<string, unknown>;
			if (!("__shape" in obj) || !("__reference" in obj)) continue;

			const fPath = `${ePath}.properties.${fieldName}`;
			const ref = obj.__reference;

			if (typeof ref !== "string") {
				errors.push({ path: `${fPath}.__reference`, severity: "error", message: `__reference must be a string` });
				continue;
			}

			// Self-reference
			if (ref === fieldName) {
				errors.push({ path: `${fPath}.__reference`, severity: "error", message: `Shape "${fieldName}" cannot reference itself` });
				continue;
			}

			// Target must exist as a shape in this entity
			if (!shapeNames.includes(ref)) {
				errors.push({ path: `${fPath}.__reference`, severity: "error", message: `Reference target "${ref}" is not a shape in this entity` });
				continue;
			}

			// Forward-only: target must appear before this shape in spec order
			const targetIndex = shapeNames.indexOf(ref);
			const selfIndex = shapeNames.indexOf(fieldName);
			if (targetIndex >= selfIndex) {
				errors.push({ path: `${fPath}.__reference`, severity: "error", message: `Reference target "${ref}" must appear before "${fieldName}" in spec order` });
				continue;
			}

			// Polygon cannot have __reference
			if (obj.__shape === "polygon") {
				errors.push({ path: `${fPath}.__reference`, severity: "error", message: `Polygon shapes cannot use __reference` });
			}
		}
	}

	return errors;
}

function validateShapeField(
	obj: Record<string, unknown>,
	fPath: string,
	errors: SpecError[],
): void {
	const shapeType = obj.__shape;

	if (typeof shapeType !== "string" || !VALID_SHAPE_TYPES.has(shapeType)) {
		errors.push({
			path: `${fPath}.__shape`,
			severity: "error",
			message: `Unknown shape type "${shapeType}". Must be one of: rect, point, circle, polygon`,
		});
		return;
	}

	// Extract shape fields (everything except __shape)
	const shapeFieldEntries = Object.entries(obj).filter(([k]) => k !== "__shape" && k !== "__reference");
	const expectedCount = EXPECTED_SHAPE_FIELDS[shapeType];

	if (shapeFieldEntries.length !== expectedCount) {
		errors.push({
			path: fPath,
			severity: "error",
			message: `Shape type "${shapeType}" requires exactly ${expectedCount} field(s), got ${shapeFieldEntries.length}`,
		});
		return;
	}

	// Validate shape field value types
	const shapeFields: ShapeField[] = [];
	let shapeFieldsValid = true;

	for (const [name, valueType] of shapeFieldEntries) {
		// Polygon points field has a special nested type
		if (shapeType === "polygon" && typeof valueType === "object" && valueType !== null) {
			const pt = valueType as Record<string, unknown>;
			if (pt.type !== "array" || typeof pt.items !== "object" || pt.items === null) {
				errors.push({
					path: `${fPath}.${name}`,
					severity: "error",
					message: `Polygon field "${name}" must have { type: array, items: { ... } }`,
				});
				shapeFieldsValid = false;
			} else {
				const items = pt.items as Record<string, unknown>;
				const itemFields = Object.entries(items);
				if (itemFields.length !== 2 || !itemFields.every(([, v]) => v === "integer" || v === "number")) {
					errors.push({
						path: `${fPath}.${name}.items`,
						severity: "error",
						message: `Polygon items must have exactly 2 numeric fields (e.g., { x: integer, y: integer })`,
					});
					shapeFieldsValid = false;
				}
			}
			shapeFields.push({ name, valueType: "integer" });
			continue;
		}

		if (typeof valueType !== "string" || !VALID_SHAPE_VALUE_TYPES.has(valueType)) {
			errors.push({
				path: `${fPath}.${name}`,
				severity: "error",
				message: `Shape field "${name}" must have type "integer" or "number", got "${valueType}"`,
			});
			shapeFieldsValid = false;
		} else {
			shapeFields.push({
				name,
				valueType: valueType as "integer" | "number",
			});
		}
	}

	// Run inference to produce warnings
	if (shapeFieldsValid) {
		const inference = inferShapeMapping(shapeType as ShapeType, shapeFields);
		for (const w of inference.warnings) {
			errors.push({
				path: fPath,
				severity: "warning",
				message: w,
			});
		}
	}
}

function validateEnumField(
	obj: Record<string, unknown>,
	fPath: string,
	errors: SpecError[],
): void {
	if (!Array.isArray(obj.enum)) {
		errors.push({
			path: fPath,
			severity: "error",
			message: `Enum must be an array`,
		});
		return;
	}

	if (obj.enum.length < 2) {
		errors.push({
			path: fPath,
			severity: "error",
			message: `Enum must have at least 2 values, got ${obj.enum.length}`,
		});
	} else if (!obj.enum.every((v: unknown) => typeof v === "string")) {
		errors.push({
			path: fPath,
			severity: "error",
			message: `Enum values must all be strings`,
		});
	}
}
