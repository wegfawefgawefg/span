// src/mainview/src/spec/validate.ts
import type { SpecError, ShapeType, ShapeField } from "./types";
import { inferShapeMapping } from "./infer";

const VALID_SHAPE_TYPES = new Set<string>(["rect", "point", "circle", "polygon"]);
const VALID_SHAPE_VALUE_TYPES = new Set<string>(["integer", "number"]);
const VALID_PROPERTY_TYPES = new Set<string>([
	"string", "integer", "number", "boolean", "string[]", "enum",
]);
const ENTITY_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const EXPECTED_SHAPE_FIELDS: Record<string, number> = {
	rect: 4,
	point: 2,
	circle: 3,
	polygon: 1,
};

export function validateSpec(raw: unknown): SpecError[] {
	const errors: SpecError[] = [];

	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		errors.push({ path: "", severity: "error", message: "Spec must be an object" });
		return errors;
	}

	const obj = raw as Record<string, unknown>;

	if (!obj.entities || typeof obj.entities !== "object" || Array.isArray(obj.entities)) {
		errors.push({ path: "entities", severity: "error", message: "Spec must have an 'entities' object" });
		return errors;
	}

	const entities = obj.entities as Record<string, unknown>;
	const entityNames = Object.keys(entities);

	if (entityNames.length === 0) {
		errors.push({ path: "entities", severity: "error", message: "Spec must have at least one entity" });
		return errors;
	}

	for (const entityName of entityNames) {
		const ePath = `entities.${entityName}`;

		if (!ENTITY_NAME_RE.test(entityName)) {
			errors.push({
				path: ePath,
				severity: "error",
				message: `Entity name "${entityName}" must be a valid identifier (alphanumeric + underscore, no spaces)`,
			});
			continue;
		}

		const entity = entities[entityName];
		if (typeof entity !== "object" || entity === null) {
			errors.push({ path: ePath, severity: "error", message: "Entity must be an object" });
			continue;
		}

		const ent = entity as Record<string, unknown>;

		// --- Shape ---
		if (!ent.shape || typeof ent.shape !== "object") {
			errors.push({ path: `${ePath}.shape`, severity: "error", message: "Entity must have a 'shape' object" });
			continue;
		}

		const shape = ent.shape as Record<string, unknown>;
		const shapeType = shape.type as string;

		if (!VALID_SHAPE_TYPES.has(shapeType)) {
			errors.push({
				path: `${ePath}.shape.type`,
				severity: "error",
				message: `Unknown shape type "${shapeType}". Must be one of: rect, point, circle, polygon`,
			});
			continue;
		}

		// Extract shape fields (everything in shape except "type")
		const shapeFieldEntries = Object.entries(shape).filter(([k]) => k !== "type");
		const expectedCount = EXPECTED_SHAPE_FIELDS[shapeType];

		if (shapeFieldEntries.length !== expectedCount) {
			errors.push({
				path: `${ePath}.shape`,
				severity: "error",
				message: `Shape type "${shapeType}" requires exactly ${expectedCount} field(s), got ${shapeFieldEntries.length}`,
			});
			continue;
		}

		// Validate shape field value types
		const shapeFields: ShapeField[] = [];
		let shapeFieldsValid = true;

		for (const [fieldName, fieldType] of shapeFieldEntries) {
			// Polygon points field has a special nested type
			if (shapeType === "polygon" && typeof fieldType === "object" && fieldType !== null) {
				const pt = fieldType as Record<string, unknown>;
				if (pt.type !== "array" || typeof pt.items !== "object" || pt.items === null) {
					errors.push({
						path: `${ePath}.shape.${fieldName}`,
						severity: "error",
						message: `Polygon field "${fieldName}" must have { type: array, items: { ... } }`,
					});
					shapeFieldsValid = false;
				} else {
					// Validate items have point-like fields
					const items = pt.items as Record<string, unknown>;
					const itemFields = Object.entries(items);
					if (itemFields.length !== 2 || !itemFields.every(([, v]) => v === "integer" || v === "number")) {
						errors.push({
							path: `${ePath}.shape.${fieldName}.items`,
							severity: "error",
							message: `Polygon items must have exactly 2 numeric fields (e.g., { x: integer, y: integer })`,
						});
						shapeFieldsValid = false;
					}
				}
				shapeFields.push({ name: fieldName, valueType: "integer" });
				continue;
			}

			if (typeof fieldType !== "string" || !VALID_SHAPE_VALUE_TYPES.has(fieldType)) {
				errors.push({
					path: `${ePath}.shape.${fieldName}`,
					severity: "error",
					message: `Shape field "${fieldName}" must have type "integer" or "number", got "${fieldType}"`,
				});
				shapeFieldsValid = false;
			} else {
				shapeFields.push({
					name: fieldName,
					valueType: fieldType as "integer" | "number",
				});
			}
		}

		// Run inference to produce warnings
		if (shapeFieldsValid) {
			const inference = inferShapeMapping(shapeType as ShapeType, shapeFields);
			for (const w of inference.warnings) {
				errors.push({
					path: `${ePath}.shape`,
					severity: "warning",
					message: w,
				});
			}
		}

		// --- Properties ---
		const shapeFieldNames = new Set(shapeFieldEntries.map(([k]) => k));
		const properties = ent.properties as Record<string, unknown> | undefined;

		if (properties && typeof properties === "object" && !Array.isArray(properties)) {
			const propNames = new Set<string>();

			for (const [propName, propType] of Object.entries(properties)) {
				const pPath = `${ePath}.properties.${propName}`;

				// Check collision with shape fields
				if (shapeFieldNames.has(propName)) {
					errors.push({
						path: pPath,
						severity: "error",
						message: `Property "${propName}" has a name collision with a shape field`,
					});
				}

				// Check duplicate property name
				if (propNames.has(propName)) {
					errors.push({
						path: pPath,
						severity: "error",
						message: `Duplicate property name "${propName}"`,
					});
				}
				propNames.add(propName);

				// Check property type
				if (typeof propType === "string") {
					if (!VALID_PROPERTY_TYPES.has(propType)) {
						errors.push({
							path: pPath,
							severity: "error",
							message: `Unknown property type "${propType}". Must be one of: string, integer, number, boolean, string[], enum`,
						});
					}
				} else if (typeof propType === "object" && propType !== null) {
					const pt = propType as Record<string, unknown>;
					if (Array.isArray(pt.enum)) {
						if (pt.enum.length < 2) {
							errors.push({
								path: pPath,
								severity: "error",
								message: `Enum must have at least 2 values, got ${pt.enum.length}`,
							});
						} else if (!pt.enum.every((v: unknown) => typeof v === "string")) {
							errors.push({
								path: pPath,
								severity: "error",
								message: `Enum values must all be strings`,
							});
						}
					} else {
						errors.push({
							path: pPath,
							severity: "error",
							message: `Complex property type must be an enum: { enum: [...] }`,
						});
					}
				} else {
					errors.push({
						path: pPath,
						severity: "error",
						message: `Invalid property type for "${propName}"`,
					});
				}
			}
		}
	}

	return errors;
}
