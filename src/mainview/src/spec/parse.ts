// src/mainview/src/spec/parse.ts
import YAML from "yaml";
import type {
	SpanSpec,
	EntityDef,
	PropertyField,
	ScalarPropertyField,
	ShapePropertyField,
	SpecError,
	ScalarType,
} from "./types";
import { validateSpec } from "./validate";

const SCALAR_TYPES = new Set<string>([
	"string", "integer", "number", "boolean", "string[]", "ainteger",
]);
const SHAPE_TYPES = new Set<string>(["rect", "point"]);
const ENUM_RE = /^enum\[(.+)\]$/;

export function parseSpec(
	raw: string,
	format: "json" | "yaml",
): SpanSpec | SpecError[] {
	let entities: unknown;

	try {
		if (format === "json") {
			entities = JSON.parse(raw);
		} else {
			const doc = YAML.parse(raw);
			entities = doc;
		}
	} catch (e: any) {
		return [{
			path: "",
			severity: "error",
			message: `Failed to parse ${format.toUpperCase()}: ${e.message}`,
		}];
	}

	// Validate structure
	const validationErrors = validateSpec(entities);
	const hardErrors = validationErrors.filter((e) => e.severity === "error");
	if (hardErrors.length > 0) {
		return validationErrors;
	}

	// Build typed SpanSpec
	const rawEntities = entities as Array<Record<string, any>>;
	const builtEntities: EntityDef[] = [];

	for (const rawEntity of rawEntities) {
		const primaryShape = "aabb" in rawEntity
			? { kind: "rect" as const }
			: { kind: "point" as const };

		const hasPath = rawEntity.path === "file_name";
		const rawProps = (rawEntity.properties ?? {}) as Record<string, unknown>;
		const nameField =
			parseRequiredScalarField("name", rawEntity.name) ??
			parseRequiredScalarField("name", rawProps.name);
		const frameField =
			parseRequiredScalarField("frame", rawEntity.frame) ??
			parseRequiredScalarField("frame", rawProps.frame);
		const durationField =
			parseRequiredScalarField("duration", rawEntity.duration) ??
			parseRequiredScalarField("duration", rawProps.duration);
		const offsetField =
			parseRequiredShapeField("offset", rawEntity.offset) ??
			parseRequiredShapeField("offset", rawProps.offset);

		const properties: PropertyField[] = [];

		for (const [name, value] of Object.entries(rawProps)) {
			if (name === "name" || name === "frame" || name === "duration" || name === "offset") {
				continue;
			}
			if (typeof value !== "string") continue;

			const field = parsePropertyType(name, value);
			if (field) properties.push(field);
		}

		builtEntities.push({
			label: rawEntity.label as string,
			group: rawEntity.group as string,
			primaryShape,
			hasPath,
			...(nameField ? { nameField } : {}),
			...(frameField ? { frameField } : {}),
			...(durationField ? { durationField } : {}),
			...(offsetField ? { offsetField } : {}),
			properties,
		});
	}

	return { format, entities: builtEntities };
}

function parseRequiredScalarField(
	name: "name" | "frame" | "duration",
	value: unknown,
): ScalarPropertyField | undefined {
	if (typeof value !== "string" || !SCALAR_TYPES.has(value)) return undefined;
	return { kind: "scalar", name, type: value as ScalarType };
}

function parseRequiredShapeField(
	name: "offset",
	value: unknown,
): ShapePropertyField | undefined {
	if (value !== "point") return undefined;
	return { kind: "shape", name, shapeType: "point", array: false };
}

function parsePropertyType(name: string, value: string): PropertyField | null {
	// Scalar types
	if (SCALAR_TYPES.has(value)) {
		return { kind: "scalar", name, type: value as ScalarType };
	}

	// Color
	if (value === "color") {
		return { kind: "color", name };
	}

	// Shape array: rect[], point[]
	const arrayMatch = value.match(/^(rect|point)\[\]$/);
	if (arrayMatch) {
		return {
			kind: "shape",
			name,
			shapeType: arrayMatch[1] as "rect" | "point",
			array: true,
		};
	}

	// Single shape: rect, point
	if (SHAPE_TYPES.has(value)) {
		return {
			kind: "shape",
			name,
			shapeType: value as "rect" | "point",
			array: false,
		};
	}

	// Enum: enum[val1, val2, ...]
	const enumMatch = value.match(ENUM_RE);
	if (enumMatch) {
		const values = enumMatch[1].split(",").map((v) => v.trim()).filter((v) => v.length > 0);
		return { kind: "enum", name, values };
	}

	return null;
}
