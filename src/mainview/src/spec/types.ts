// src/mainview/src/spec/types.ts

// --- Spec types ---

export type ShapeType = "rect" | "point" | "circle" | "polygon";

export type PropertyType =
	| "string"
	| "integer"
	| "number"
	| "boolean"
	| "string[]"
	| "enum";

export interface SpanSpec {
	format: "json" | "yaml";
	entities: Record<string, EntityDef>;
}

export interface EntityDef {
	shape: ShapeDef;
	properties: PropertyDef[];
}

export interface ShapeDef {
	type: ShapeType;
	fields: ShapeField[];
	mapping: ShapeMapping | null; // null if inference failed (entity unusable)
	warnings: string[];
}

export interface ShapeField {
	name: string;
	valueType: "integer" | "number";
}

export type ShapeMapping =
	| { type: "rect"; x: string; y: string; width: string; height: string }
	| { type: "point"; x: string; y: string }
	| { type: "circle"; x: string; y: string; radius: string }
	| { type: "polygon"; points: string };

export interface PropertyDef {
	name: string;
	type: PropertyType;
	enumValues?: string[];
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
	| "property_added"
	| "property_removed"
	| "property_type_changed"
	| "shape_type_changed";

export interface SpecChange {
	entity: string;
	field?: string;
	kind: SpecChangeKind;
	destructive: boolean;
	description: string;
}

// --- Defaults ---

const PROPERTY_DEFAULTS: Record<PropertyType, unknown> = {
	string: "",
	integer: 0,
	number: 0,
	boolean: false,
	"string[]": [],
	enum: null, // handled specially — uses first enum value
};

export function defaultForProperty(def: PropertyDef): unknown {
	if (def.type === "enum") {
		return def.enumValues?.[0] ?? "";
	}
	const d = PROPERTY_DEFAULTS[def.type];
	// Return a fresh array each time for string[]
	return Array.isArray(d) ? [] : d;
}

export function defaultForShapeField(): number {
	return 0;
}
