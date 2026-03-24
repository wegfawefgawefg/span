// src/mainview/src/spec/types.ts

export type ShapeType = "rect" | "point" | "circle" | "polygon";

export type ScalarType =
	| "string"
	| "integer"
	| "number"
	| "boolean"
	| "string[]"
	| "enum";

export type PathType = "Path" | "RelativePath";

// --- Spec ---

export interface SpanSpec {
	format: "json" | "yaml";
	frontmatter: Record<string, unknown>; // __properties values
	entities: EntityDef[];
}

export interface EntityDef {
	label: string;    // display name + annotation key
	group: string;    // top-level output key
	fields: SpecField[];  // ordered list preserving spec property order
}

// Discriminated union for spec fields
export type SpecField =
	| ShapeSpecField
	| ScalarSpecField
	| PathSpecField;

export interface ShapeSpecField {
	kind: "shape";
	name: string;          // field name in output (e.g., "slice", "collision")
	shapeType: ShapeType;
	shapeFields: ShapeField[];
	mapping: ShapeMapping | null;
	warnings: string[];
}

export interface ScalarSpecField {
	kind: "scalar";
	name: string;
	type: ScalarType;
	enumValues?: string[];
}

export interface PathSpecField {
	kind: "path";
	name: string;
	pathType: PathType;  // "Path" or "RelativePath"
}

// --- Shape sub-types (unchanged) ---

export interface ShapeField {
	name: string;
	valueType: "integer" | "number";
}

export type ShapeMapping =
	| { type: "rect"; x: string; y: string; width: string; height: string }
	| { type: "point"; x: string; y: string }
	| { type: "circle"; x: string; y: string; radius: string }
	| { type: "polygon"; points: string };

// --- Errors ---

export interface SpecError {
	path: string;
	severity: "error" | "warning";
	message: string;
}

// --- Diff ---

export interface SpecDiff {
	safe: boolean;
	changes: SpecChange[];
}

export type SpecChangeKind =
	| "entity_added"
	| "entity_removed"
	| "field_added"
	| "field_removed"
	| "field_type_changed"
	| "shape_type_changed";

export interface SpecChange {
	entity: string;
	field?: string;
	kind: SpecChangeKind;
	destructive: boolean;
	description: string;
}

// --- Defaults ---

export function defaultForScalar(field: ScalarSpecField): unknown {
	if (field.type === "enum") return field.enumValues?.[0] ?? "";
	const defaults: Record<ScalarType, unknown> = {
		string: "", integer: 0, number: 0, boolean: false, "string[]": [], enum: null,
	};
	const d = defaults[field.type];
	return Array.isArray(d) ? [] : d;
}

export function defaultForShapeField(): number {
	return 0;
}

// --- Helpers ---

export function getEntityByLabel(spec: SpanSpec, label: string): EntityDef | undefined {
	return spec.entities.find((e) => e.label === label);
}

export function getShapesForEntity(entity: EntityDef): ShapeSpecField[] {
	return entity.fields.filter((f): f is ShapeSpecField => f.kind === "shape");
}

export function getScalarsForEntity(entity: EntityDef): ScalarSpecField[] {
	return entity.fields.filter((f): f is ScalarSpecField => f.kind === "scalar");
}

export function getPathFieldForEntity(entity: EntityDef): PathSpecField | undefined {
	return entity.fields.find((f): f is PathSpecField => f.kind === "path");
}

export function getPrimaryShapeName(entity: EntityDef): string | null {
	const shapes = getShapesForEntity(entity);
	return shapes.length > 0 ? shapes[0].name : null;
}
