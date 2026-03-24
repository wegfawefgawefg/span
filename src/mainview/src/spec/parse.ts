// src/mainview/src/spec/parse.ts
import YAML from "yaml";
import type {
	SpanSpec,
	EntityDef,
	SpecField,
	ShapeSpecField,
	ScalarSpecField,
	PathSpecField,
	ShapeField,
	ShapeType,
	ScalarType,
	SpecError,
} from "./types";
import { validateSpec } from "./validate";
import { inferShapeMapping } from "./infer";

const SCALAR_TYPES = new Set<string>([
	"string", "integer", "number", "boolean", "string[]",
]);

export function parseSpec(
	raw: string,
	format: "json" | "yaml",
): SpanSpec | SpecError[] {
	// Step 1: Parse raw string and extract frontmatter + entities
	let frontmatter: Record<string, unknown> = {};
	let entities: unknown;

	try {
		if (format === "json") {
			entities = JSON.parse(raw);
		} else {
			// Use parseAllDocuments to handle multi-document YAML (frontmatter + entities)
			const docs = YAML.parseAllDocuments(raw);

			if (docs.length === 0) {
				return [{ path: "", severity: "error", message: "Empty YAML document" }];
			}

			// Check for parse errors in any document
			for (const doc of docs) {
				if (doc.errors.length > 0) {
					return doc.errors.map((e) => ({
						path: "",
						severity: "error" as const,
						message: `Failed to parse YAML: ${e.message}`,
					}));
				}
			}

			// Find frontmatter (object with __properties) and entity list (array)
			let foundFrontmatter = false;
			let foundEntities = false;

			for (const doc of docs) {
				const value = doc.toJSON();
				if (
					!foundFrontmatter &&
					typeof value === "object" &&
					value !== null &&
					!Array.isArray(value) &&
					"__properties" in value
				) {
					frontmatter = (value as Record<string, unknown>).__properties as Record<string, unknown> ?? {};
					foundFrontmatter = true;
				} else if (!foundEntities && Array.isArray(value)) {
					entities = value;
					foundEntities = true;
				}
			}

			if (!foundEntities) {
				// Single document that's not an array — try using it directly
				if (docs.length === 1) {
					entities = docs[0].toJSON();
				}
			}
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
	const validationErrors = validateSpec(entities);
	const hardErrors = validationErrors.filter((e) => e.severity === "error");
	if (hardErrors.length > 0) {
		return validationErrors;
	}

	// Step 3: Build typed SpanSpec
	const rawEntities = entities as Array<Record<string, any>>;
	const builtEntities: EntityDef[] = [];

	for (const rawEntity of rawEntities) {
		const fields: SpecField[] = [];
		const properties = (rawEntity.properties ?? {}) as Record<string, unknown>;

		for (const [fieldName, fieldValue] of Object.entries(properties)) {
			if (typeof fieldValue === "object" && fieldValue !== null && !Array.isArray(fieldValue)) {
				const obj = fieldValue as Record<string, unknown>;

				if ("__shape" in obj) {
					// Shape field
					fields.push(buildShapeField(fieldName, obj));
				} else if ("enum" in obj) {
					// Enum field
					fields.push({
						kind: "scalar",
						name: fieldName,
						type: "enum",
						enumValues: obj.enum as string[],
					} satisfies ScalarSpecField);
				}
			} else if (typeof fieldValue === "string") {
				if (fieldValue === "Path" || fieldValue === "RelativePath") {
					fields.push({
						kind: "path",
						name: fieldName,
						pathType: fieldValue,
					} satisfies PathSpecField);
				} else if (SCALAR_TYPES.has(fieldValue)) {
					fields.push({
						kind: "scalar",
						name: fieldName,
						type: fieldValue as ScalarType,
					} satisfies ScalarSpecField);
				}
			}
		}

		builtEntities.push({
			label: rawEntity.label as string,
			group: rawEntity.group as string,
			fields,
		});
	}

	return {
		format,
		frontmatter,
		entities: builtEntities,
	};
}

function buildShapeField(name: string, obj: Record<string, unknown>): ShapeSpecField {
	const shapeType = obj.__shape as ShapeType;
	const reference = typeof obj.__reference === "string" ? obj.__reference : null;

	// Extract shape fields (everything except __shape and __reference)
	const shapeFields: ShapeField[] = [];
	for (const [fieldName, fieldType] of Object.entries(obj)) {
		if (fieldName === "__shape" || fieldName === "__reference") continue;

		if (shapeType === "polygon" && typeof fieldType === "object") {
			shapeFields.push({ name: fieldName, valueType: "integer" });
		} else {
			shapeFields.push({
				name: fieldName,
				valueType: fieldType as "integer" | "number",
			});
		}
	}

	const inference = inferShapeMapping(shapeType, shapeFields);

	return {
		kind: "shape",
		name,
		shapeType,
		shapeFields,
		mapping: inference.mapping,
		reference,
		warnings: inference.warnings,
	};
}
