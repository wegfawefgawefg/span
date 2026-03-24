// src/mainview/src/spec/parse.ts
import YAML from "yaml";
import type {
	SpanSpec,
	EntityDef,
	ShapeDef,
	ShapeField,
	PropertyDef,
	SpecError,
	ShapeType,
} from "./types";
import { validateSpec } from "./validate";
import { inferShapeMapping } from "./infer";

export function parseSpec(
	raw: string,
	format: "json" | "yaml",
): SpanSpec | SpecError[] {
	// Step 1: Parse raw string
	let parsed: unknown;
	try {
		if (format === "json") {
			parsed = JSON.parse(raw);
		} else {
			parsed = YAML.parse(raw);
		}
	} catch (e: any) {
		return [
			{
				path: "",
				severity: "error",
				message: `Failed to parse ${format.toUpperCase()}: ${e.message}`,
			},
		];
	}

	// Step 2: Validate structure
	const validationErrors = validateSpec(parsed);
	const hardErrors = validationErrors.filter((e) => e.severity === "error");
	if (hardErrors.length > 0) {
		return validationErrors;
	}

	// Step 3: Build typed SpanSpec
	const obj = parsed as Record<string, any>;
	const entities: Record<string, EntityDef> = {};

	for (const [entityName, entityRaw] of Object.entries(obj.entities)) {
		const ent = entityRaw as Record<string, any>;
		const shapeRaw = ent.shape as Record<string, any>;
		const shapeType = shapeRaw.type as ShapeType;

		// Build shape fields
		const shapeFields: ShapeField[] = [];
		for (const [fieldName, fieldType] of Object.entries(shapeRaw)) {
			if (fieldName === "type") continue;
			// Polygon points field — special case
			if (shapeType === "polygon" && typeof fieldType === "object") {
				shapeFields.push({ name: fieldName, valueType: "integer" });
			} else {
				shapeFields.push({
					name: fieldName,
					valueType: fieldType as "integer" | "number",
				});
			}
		}

		// Infer mapping
		const inference = inferShapeMapping(shapeType, shapeFields);

		const shape: ShapeDef = {
			type: shapeType,
			fields: shapeFields,
			mapping: inference.mapping,
			warnings: inference.warnings,
		};

		// Build properties
		const properties: PropertyDef[] = [];
		if (ent.properties && typeof ent.properties === "object") {
			for (const [propName, propType] of Object.entries(ent.properties)) {
				if (typeof propType === "string") {
					properties.push({ name: propName, type: propType as PropertyDef["type"] });
				} else if (typeof propType === "object" && propType !== null) {
					const pt = propType as Record<string, unknown>;
					if (Array.isArray(pt.enum)) {
						properties.push({
							name: propName,
							type: "enum",
							enumValues: pt.enum as string[],
						});
					}
				}
			}
		}

		entities[entityName] = { shape, properties };
	}

	return { format, entities };
}
