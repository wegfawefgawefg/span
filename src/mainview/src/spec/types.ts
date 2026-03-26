// src/mainview/src/spec/types.ts

export type PrimaryShapeKind = "rect" | "point";
export type PropertyShapeType = "rect" | "point";
export type ScalarType = "string" | "integer" | "number" | "boolean" | "string[]" | "ainteger";

// --- Spec ---

export interface SpanSpec {
	format: "json" | "yaml";
	entities: EntityDef[];
}

export interface EntityDef {
	label: string;
	group: string;
	primaryShape: PrimaryShape;
	hasPath: boolean;
	hasChromaKey: boolean;
	properties: PropertyField[];
}

export interface PrimaryShape {
	kind: PrimaryShapeKind;
}

// --- Property fields (discriminated union) ---

export type PropertyField =
	| ScalarPropertyField
	| EnumPropertyField
	| ColorPropertyField
	| ShapePropertyField;

export interface ScalarPropertyField {
	kind: "scalar";
	name: string;
	type: ScalarType;
}

export interface EnumPropertyField {
	kind: "enum";
	name: string;
	values: string[];
}

export interface ColorPropertyField {
	kind: "color";
	name: string;
}

export interface ShapePropertyField {
	kind: "shape";
	name: string;
	shapeType: PropertyShapeType;
	array: boolean;
}

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
	| "primary_shape_changed";

export interface SpecChange {
	entity: string;
	field?: string;
	kind: SpecChangeKind;
	destructive: boolean;
	description: string;
}

// --- Defaults ---

export function defaultForScalar(field: ScalarPropertyField): unknown {
	const defaults: Record<ScalarType, unknown> = {
		string: "",
		integer: 0,
		number: 0,
		boolean: false,
		"string[]": [],
		ainteger: 0,
	};
	const d = defaults[field.type];
	return Array.isArray(d) ? [] : d;
}

export function defaultForEnum(field: EnumPropertyField): string {
	return field.values[0] ?? "";
}

export function defaultForColor(): string {
	return "";
}

export function defaultForShape(field: ShapePropertyField): unknown {
	if (field.array) return [];
	if (field.shapeType === "rect") return { x: 0, y: 0, w: 0, h: 0 };
	return { x: 0, y: 0 };
}

// --- Helpers ---

export function getEntityByLabel(spec: SpanSpec, label: string): EntityDef | undefined {
	return spec.entities.find((e) => e.label === label);
}

export function getShapeProperties(entity: EntityDef): ShapePropertyField[] {
	return entity.properties.filter((f): f is ShapePropertyField => f.kind === "shape");
}

export function getScalarProperties(entity: EntityDef): ScalarPropertyField[] {
	return entity.properties.filter((f): f is ScalarPropertyField => f.kind === "scalar");
}

export function getEnumProperties(entity: EntityDef): EnumPropertyField[] {
	return entity.properties.filter((f): f is EnumPropertyField => f.kind === "enum");
}
