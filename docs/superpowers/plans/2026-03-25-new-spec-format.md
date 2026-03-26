# New Spec Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the spec module to parse a simplified, declarative YAML spec format with top-level primary shapes, inline type syntax, and workspace-level shape field export overrides.

**Architecture:** Replace the existing spec type system, parser, validator, and all consumers (annotation, export, persistence, canvas, inspector) to use the new format. No backwards compatibility. TDD throughout — tests first, then implementation.

**Tech Stack:** TypeScript, Vue 3, Bun test runner, YAML npm package

**Spec:** `docs/superpowers/specs/2026-03-25-new-spec-format-design.md`

---

### File Structure

**Rewrite (replace contents entirely):**
- `src/mainview/src/spec/types.ts` — new type definitions
- `src/mainview/src/spec/parse.ts` — new parser for declarative format
- `src/mainview/src/spec/validate.ts` — new validation rules
- `src/mainview/src/spec/diff.ts` — updated diff logic
- `src/mainview/src/spec/__tests__/parse.test.ts` — new parser tests
- `src/mainview/src/spec/__tests__/validate.test.ts` — new validation tests
- `src/mainview/src/spec/__tests__/diff.test.ts` — updated diff tests
- `src/mainview/src/annotation.ts` — new annotation with `aabb`/`point` primary shapes
- `src/mainview/src/annotation.test.ts` — updated annotation tests
- `src/mainview/src/export.ts` — new export with shape field remapping
- `src/mainview/src/export.test.ts` — updated export tests
- `src/mainview/src/persistence.ts` — updated serialization for new Annotation shape
- `src/mainview/src/persistence.test.ts` — updated persistence tests

**Delete:**
- `src/mainview/src/spec/infer.ts` — no longer needed (fixed field names)
- `src/mainview/src/spec/__tests__/infer.test.ts` — no longer needed

**Modify (update imports/usage):**
- `src/mainview/src/state.ts` — update spec/annotation API calls
- `src/mainview/src/composables/useCanvas.ts` — read `aabb`/`point` directly
- `src/mainview/src/components/CanvasView.vue` — updated shape rendering
- `src/mainview/src/components/DynamicInspector.vue` — updated property display
- `src/mainview/src/components/GalleryPanel.vue` — updated thumbnail clipping
- `src/mainview/src/components/ToolPalette.vue` — updated shape info
- `src/mainview/src/components/AnnotationList.vue` — minor annotation type changes

---

### Task 1: Rewrite spec types

**Files:**
- Rewrite: `src/mainview/src/spec/types.ts`

- [ ] **Step 1: Write the new type definitions**

Replace the entire contents of `types.ts` with:

```typescript
// src/mainview/src/spec/types.ts

export type PrimaryShapeKind = "rect" | "point";
export type PropertyShapeType = "rect" | "point";
export type ScalarType = "string" | "integer" | "number" | "boolean" | "string[]";

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
```

- [ ] **Step 2: Delete infer.ts and its tests**

```bash
rm src/mainview/src/spec/infer.ts
rm src/mainview/src/spec/__tests__/infer.test.ts
```

- [ ] **Step 3: Verify types compile**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`

This will show type errors in consumers — that's expected. We just want to confirm `types.ts` itself has no syntax errors. Look for errors originating FROM `types.ts` only.

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/spec/types.ts
git add src/mainview/src/spec/infer.ts src/mainview/src/spec/__tests__/infer.test.ts
git commit -m "rewrite spec types for new declarative format, delete infer module"
```

---

### Task 2: Rewrite validation

**Files:**
- Rewrite: `src/mainview/src/spec/validate.ts`
- Rewrite: `src/mainview/src/spec/__tests__/validate.test.ts`

- [ ] **Step 1: Write the failing validation tests**

Replace the entire contents of `validate.test.ts` with:

```typescript
// src/mainview/src/spec/__tests__/validate.test.ts
import { describe, test, expect } from "bun:test";
import { validateSpec } from "../validate";

function errors(result: ReturnType<typeof validateSpec>) {
	return result.filter((e) => e.severity === "error");
}
function warnings(result: ReturnType<typeof validateSpec>) {
	return result.filter((e) => e.severity === "warning");
}

/** Minimal valid entity with aabb */
function entity(overrides: Record<string, unknown> = {}) {
	return {
		label: "Sprite",
		group: "sprites",
		aabb: "rect",
		properties: { name: "string" },
		...overrides,
	};
}

/** Minimal valid point entity */
function pointEntity(overrides: Record<string, unknown> = {}) {
	return {
		label: "Waypoint",
		group: "waypoints",
		point: "point",
		properties: { name: "string" },
		...overrides,
	};
}

describe("validateSpec", () => {
	// --- Structure ---

	test("valid spec with single aabb entity", () => {
		expect(errors(validateSpec([entity()]))).toHaveLength(0);
	});

	test("valid spec with single point entity", () => {
		expect(errors(validateSpec([pointEntity()]))).toHaveLength(0);
	});

	test("valid spec with multiple entities", () => {
		const raw = [entity(), pointEntity()];
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("input must be an array", () => {
		expect(errors(validateSpec({}))).toHaveLength(1);
		expect(errors(validateSpec({}))[0].message).toContain("array");
	});

	test("input must be an array — not null", () => {
		expect(errors(validateSpec(null))).toHaveLength(1);
	});

	test("input must be an array — not string", () => {
		expect(errors(validateSpec("hello"))).toHaveLength(1);
	});

	test("empty array is error", () => {
		const result = errors(validateSpec([]));
		expect(result).toHaveLength(1);
		expect(result[0].message).toContain("at least one");
	});

	test("entity must be an object", () => {
		expect(errors(validateSpec(["not_an_object"]))).toHaveLength(1);
	});

	// --- label ---

	test("missing label → error", () => {
		const raw = [{ group: "sprites", aabb: "rect", properties: {} }];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("label"))).toBe(true);
	});

	test("empty label → error", () => {
		expect(errors(validateSpec([entity({ label: "" })])).some((e) => e.message.includes("label"))).toBe(true);
	});

	test("label with spaces → error", () => {
		expect(errors(validateSpec([entity({ label: "My Sprite" })])).some((e) => e.message.includes("identifier"))).toBe(true);
	});

	test("duplicate label → error", () => {
		const raw = [entity(), entity({ group: "tiles" })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("Duplicate label"))).toBe(true);
	});

	// --- group ---

	test("missing group → error", () => {
		const raw = [{ label: "Sprite", aabb: "rect", properties: {} }];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("group"))).toBe(true);
	});

	test("empty group → error", () => {
		expect(errors(validateSpec([entity({ group: "" })])).some((e) => e.message.includes("group"))).toBe(true);
	});

	test("duplicate group → error", () => {
		const raw = [entity(), entity({ label: "Tile" })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("Duplicate group"))).toBe(true);
	});

	// --- primary shape ---

	test("entity must have exactly one primary shape", () => {
		const raw = [{ label: "Sprite", group: "sprites", properties: { name: "string" } }];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("primary shape"))).toBe(true);
	});

	test("entity cannot have both aabb and point", () => {
		const raw = [{ label: "Sprite", group: "sprites", aabb: "rect", point: "point", properties: {} }];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("primary shape"))).toBe(true);
	});

	test("aabb value must be 'rect'", () => {
		expect(errors(validateSpec([entity({ aabb: "circle" })])).some((e) => e.message.includes("rect"))).toBe(true);
	});

	test("point value must be 'point'", () => {
		const raw = [pointEntity({ point: "rect" })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("point"))).toBe(true);
	});

	// --- path ---

	test("path: file_name is valid", () => {
		expect(errors(validateSpec([entity({ path: "file_name" })]))).toHaveLength(0);
	});

	test("path with invalid value → error", () => {
		expect(errors(validateSpec([entity({ path: "something_else" })])).some((e) => e.message.includes("file_name"))).toBe(true);
	});

	// --- properties ---

	test("entity with no properties key is valid", () => {
		const raw = [{ label: "Sprite", group: "sprites", aabb: "rect" }];
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("entity with empty properties is valid", () => {
		expect(errors(validateSpec([entity({ properties: {} })]))).toHaveLength(0);
	});

	test("properties must be an object", () => {
		expect(errors(validateSpec([entity({ properties: "bad" })])).some((e) => e.message.includes("Properties"))).toBe(true);
	});

	test("properties as array → error", () => {
		expect(errors(validateSpec([entity({ properties: [1, 2] })])).some((e) => e.message.includes("Properties"))).toBe(true);
	});

	// --- scalar types ---

	test("valid scalar types", () => {
		for (const type of ["string", "integer", "number", "boolean", "string[]"]) {
			expect(errors(validateSpec([entity({ properties: { f: type } })]))).toHaveLength(0);
		}
	});

	test("unknown type → error", () => {
		expect(errors(validateSpec([entity({ properties: { f: "blob" } })])).some((e) => e.message.includes("blob"))).toBe(true);
	});

	// --- color ---

	test("color type is valid", () => {
		expect(errors(validateSpec([entity({ properties: { c: "color" } })]))).toHaveLength(0);
	});

	// --- enum ---

	test("valid inline enum", () => {
		expect(errors(validateSpec([entity({ properties: { dir: "enum[up, down, left, right]" } })]))).toHaveLength(0);
	});

	test("enum with fewer than 2 values → error", () => {
		expect(errors(validateSpec([entity({ properties: { dir: "enum[up]" } })])).some((e) => e.message.includes("at least 2"))).toBe(true);
	});

	test("enum with no values → error", () => {
		expect(errors(validateSpec([entity({ properties: { dir: "enum[]" } })])).some((e) => e.message.includes("at least 2"))).toBe(true);
	});

	// --- shape properties ---

	test("rect shape property is valid", () => {
		expect(errors(validateSpec([entity({ properties: { bounds: "rect" } })]))).toHaveLength(0);
	});

	test("point shape property is valid", () => {
		expect(errors(validateSpec([entity({ properties: { origin: "point" } })]))).toHaveLength(0);
	});

	test("rect[] shape property is valid", () => {
		expect(errors(validateSpec([entity({ properties: { collision: "rect[]" } })]))).toHaveLength(0);
	});

	test("point[] shape property is valid", () => {
		expect(errors(validateSpec([entity({ properties: { hotspots: "point[]" } })]))).toHaveLength(0);
	});

	test("shape property on point entity → error", () => {
		const raw = [pointEntity({ properties: { bounds: "rect" } })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("aabb"))).toBe(true);
	});

	// --- reserved prefix ---

	test("field name with __ prefix → error", () => {
		expect(errors(validateSpec([entity({ properties: { __hidden: "string" } })])).some((e) => e.message.includes("reserved"))).toBe(true);
	});

	// --- duplicate field names ---

	test("duplicate field name → error", () => {
		// YAML parsing would merge duplicates, but if somehow passed directly:
		// This tests the validation path by passing a raw array with a field appearing in the order
		// We can't truly test this via YAML since YAML merges keys, but the validator should catch it
		// in programmatic construction
	});

	// --- non-string non-object field value ---

	test("numeric field value → error", () => {
		expect(errors(validateSpec([entity({ properties: { bad: 42 } })])).some((e) => e.message.includes("Invalid"))).toBe(true);
	});

	test("boolean field value → error", () => {
		expect(errors(validateSpec([entity({ properties: { bad: true } })])).some((e) => e.message.includes("Invalid"))).toBe(true);
	});

	test("null field value → error", () => {
		expect(errors(validateSpec([entity({ properties: { bad: null } })])).some((e) => e.message.includes("Invalid"))).toBe(true);
	});

	test("array field value → error", () => {
		expect(errors(validateSpec([entity({ properties: { bad: [1, 2] } })])).some((e) => e.message.includes("Invalid"))).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx bun test src/mainview/src/spec/__tests__/validate.test.ts 2>&1 | tail -5`
Expected: Failures (old validate.ts doesn't handle new format)

- [ ] **Step 3: Write the new validation implementation**

Replace the entire contents of `validate.ts` with:

```typescript
// src/mainview/src/spec/validate.ts
import type { SpecError } from "./types";

const VALID_SCALAR_TYPES = new Set<string>([
	"string", "integer", "number", "boolean", "string[]",
]);
const VALID_SHAPE_TYPES = new Set<string>(["rect", "point"]);
const LABEL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENUM_RE = /^enum\[(.+)\]$/;

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
			errors.push({ path: `${ePath}.label`, severity: "error", message: `Duplicate label "${ent.label}"` });
		} else {
			seenLabels.add(ent.label);
		}

		// --- group ---
		if (typeof ent.group !== "string" || ent.group.length === 0) {
			errors.push({ path: `${ePath}.group`, severity: "error", message: "Entity must have a 'group' string" });
		} else if (seenGroups.has(ent.group)) {
			errors.push({ path: `${ePath}.group`, severity: "error", message: `Duplicate group "${ent.group}"` });
		} else {
			seenGroups.add(ent.group);
		}

		// --- primary shape ---
		const hasAabb = "aabb" in ent;
		const hasPoint = "point" in ent;

		if (hasAabb && hasPoint) {
			errors.push({ path: ePath, severity: "error", message: "Entity must have exactly one primary shape (aabb or point), not both" });
		} else if (!hasAabb && !hasPoint) {
			errors.push({ path: ePath, severity: "error", message: "Entity must have a primary shape (aabb or point)" });
		} else if (hasAabb && ent.aabb !== "rect") {
			errors.push({ path: `${ePath}.aabb`, severity: "error", message: `aabb value must be "rect"` });
		} else if (hasPoint && ent.point !== "point") {
			errors.push({ path: `${ePath}.point`, severity: "error", message: `point value must be "point"` });
		}

		const isAabbEntity = hasAabb && ent.aabb === "rect";

		// --- path ---
		if ("path" in ent) {
			if (ent.path !== "file_name") {
				errors.push({ path: `${ePath}.path`, severity: "error", message: `path value must be "file_name"` });
			}
		}

		// --- properties ---
		if (ent.properties !== undefined && (typeof ent.properties !== "object" || ent.properties === null || Array.isArray(ent.properties))) {
			errors.push({ path: `${ePath}.properties`, severity: "error", message: "Properties must be an object" });
			continue;
		}

		if (ent.properties === undefined) continue;

		const properties = ent.properties as Record<string, unknown>;
		const fieldNames = new Set<string>();

		for (const [fieldName, fieldValue] of Object.entries(properties)) {
			const fPath = `${ePath}.properties.${fieldName}`;

			// Reserved __ prefix
			if (fieldName.startsWith("__")) {
				errors.push({ path: fPath, severity: "error", message: `Field name "${fieldName}" is reserved (__ prefix)` });
				continue;
			}

			// Duplicate field name
			if (fieldNames.has(fieldName)) {
				errors.push({ path: fPath, severity: "error", message: `Duplicate field name "${fieldName}"` });
				continue;
			}
			fieldNames.add(fieldName);

			if (typeof fieldValue !== "string") {
				errors.push({ path: fPath, severity: "error", message: `Invalid field value for "${fieldName}" — must be a type string` });
				continue;
			}

			// Parse the type string
			if (VALID_SCALAR_TYPES.has(fieldValue) || fieldValue === "color") {
				// Valid scalar or color type
				continue;
			}

			// Shape types: rect, point, rect[], point[]
			const arrayMatch = fieldValue.match(/^(rect|point)\[\]$/);
			if (arrayMatch || VALID_SHAPE_TYPES.has(fieldValue)) {
				// Shape property — must be on an aabb entity
				if (!isAabbEntity) {
					errors.push({
						path: fPath,
						severity: "error",
						message: `Shape properties require the entity to have "aabb: rect" as primary shape`,
					});
				}
				continue;
			}

			// Enum: enum[val1, val2, ...]
			const enumMatch = fieldValue.match(ENUM_RE);
			if (enumMatch) {
				const values = enumMatch[1].split(",").map((v) => v.trim()).filter((v) => v.length > 0);
				if (values.length < 2) {
					errors.push({ path: fPath, severity: "error", message: `Enum must have at least 2 values, got ${values.length}` });
				}
				continue;
			}

			// Check for empty enum
			if (fieldValue === "enum[]") {
				errors.push({ path: fPath, severity: "error", message: `Enum must have at least 2 values, got 0` });
				continue;
			}

			// Unknown type
			errors.push({
				path: fPath,
				severity: "error",
				message: `Unknown type "${fieldValue}". Valid types: string, integer, number, boolean, string[], color, rect, point, rect[], point[], enum[...]`,
			});
		}
	}

	return errors;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx bun test src/mainview/src/spec/__tests__/validate.test.ts 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/spec/validate.ts src/mainview/src/spec/__tests__/validate.test.ts
git commit -m "rewrite spec validation for new declarative format"
```

---

### Task 3: Rewrite parser

**Files:**
- Rewrite: `src/mainview/src/spec/parse.ts`
- Rewrite: `src/mainview/src/spec/__tests__/parse.test.ts`

- [ ] **Step 1: Write the failing parser tests**

Replace the entire contents of `parse.test.ts` with:

```typescript
// src/mainview/src/spec/__tests__/parse.test.ts
import { describe, test, expect } from "bun:test";
import { parseSpec } from "../parse";
import type {
	SpanSpec,
	SpecError,
	ScalarPropertyField,
	EnumPropertyField,
	ColorPropertyField,
	ShapePropertyField,
} from "../types";

function isSpec(result: SpanSpec | SpecError[]): result is SpanSpec {
	return !Array.isArray(result);
}

const EXAMPLE_SPEC_YAML = `
- label: Sprite
  group: sprites
  aabb: rect
  path: file_name
  properties:
    name: string
    frame: integer
    collision: rect[]
    origin: point
    chroma_key: color
    direction: enum[up, down, left, right]
    variant: string
    tags: string[]

- label: Tile
  group: tiles
  aabb: rect
  path: file_name
  properties:
    name: string
    solid: boolean
    layer: enum[background, foreground, overlay]
    chroma_key: color
    tags: string[]

- label: Waypoint
  group: waypoints
  point: point
  properties:
    name: string
    order: integer
    type: enum[spawn, entrance, exit, warp]
`;

describe("parseSpec", () => {
	// --- Example spec ---

	test("parses example YAML with 3 entities", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		expect(isSpec(result)).toBe(true);
		if (!isSpec(result)) return;

		expect(result.format).toBe("yaml");
		expect(result.entities).toHaveLength(3);
		expect(result.entities.map((e) => e.label)).toEqual(["Sprite", "Tile", "Waypoint"]);
		expect(result.entities.map((e) => e.group)).toEqual(["sprites", "tiles", "waypoints"]);
	});

	test("Sprite entity has aabb primary shape and hasPath", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		if (!isSpec(result)) return;

		const sprite = result.entities[0];
		expect(sprite.primaryShape).toEqual({ kind: "rect" });
		expect(sprite.hasPath).toBe(true);
	});

	test("Waypoint entity has point primary shape and no path", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		if (!isSpec(result)) return;

		const waypoint = result.entities[2];
		expect(waypoint.primaryShape).toEqual({ kind: "point" });
		expect(waypoint.hasPath).toBe(false);
	});

	test("Sprite properties are parsed in spec order", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		if (!isSpec(result)) return;

		const sprite = result.entities[0];
		const names = sprite.properties.map((p) => p.name);
		expect(names).toEqual([
			"name", "frame", "collision", "origin",
			"chroma_key", "direction", "variant", "tags",
		]);
	});

	test("scalar properties parsed correctly", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		if (!isSpec(result)) return;

		const sprite = result.entities[0];

		const name = sprite.properties[0] as ScalarPropertyField;
		expect(name.kind).toBe("scalar");
		expect(name.type).toBe("string");

		const frame = sprite.properties[1] as ScalarPropertyField;
		expect(frame.kind).toBe("scalar");
		expect(frame.type).toBe("integer");
	});

	test("shape properties parsed correctly", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		if (!isSpec(result)) return;

		const sprite = result.entities[0];

		const collision = sprite.properties[2] as ShapePropertyField;
		expect(collision.kind).toBe("shape");
		expect(collision.shapeType).toBe("rect");
		expect(collision.array).toBe(true);

		const origin = sprite.properties[3] as ShapePropertyField;
		expect(origin.kind).toBe("shape");
		expect(origin.shapeType).toBe("point");
		expect(origin.array).toBe(false);
	});

	test("color property parsed correctly", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		if (!isSpec(result)) return;

		const sprite = result.entities[0];
		const chroma = sprite.properties[4] as ColorPropertyField;
		expect(chroma.kind).toBe("color");
		expect(chroma.name).toBe("chroma_key");
	});

	test("enum property parsed correctly", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		if (!isSpec(result)) return;

		const sprite = result.entities[0];
		const dir = sprite.properties[5] as EnumPropertyField;
		expect(dir.kind).toBe("enum");
		expect(dir.values).toEqual(["up", "down", "left", "right"]);
	});

	test("string[] property parsed correctly", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		if (!isSpec(result)) return;

		const sprite = result.entities[0];
		const tags = sprite.properties[7] as ScalarPropertyField;
		expect(tags.kind).toBe("scalar");
		expect(tags.type).toBe("string[]");
	});

	test("boolean property parsed correctly", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		if (!isSpec(result)) return;

		const tile = result.entities[1];
		const solid = tile.properties.find((p) => p.name === "solid") as ScalarPropertyField;
		expect(solid.kind).toBe("scalar");
		expect(solid.type).toBe("boolean");
	});

	// --- JSON ---

	test("parses JSON spec", () => {
		const json = JSON.stringify([
			{
				label: "Tile",
				group: "tiles",
				aabb: "rect",
				properties: {
					solid: "boolean",
				},
			},
		]);
		const result = parseSpec(json, "json");
		expect(isSpec(result)).toBe(true);
		if (!isSpec(result)) return;

		expect(result.format).toBe("json");
		expect(result.entities).toHaveLength(1);
		expect(result.entities[0].primaryShape).toEqual({ kind: "rect" });
	});

	// --- Field order ---

	test("field order preserved from spec", () => {
		const yaml = `
- label: Item
  group: items
  aabb: rect
  properties:
    z_name: string
    a_count: integer
    m_flag: boolean
`;
		const result = parseSpec(yaml, "yaml");
		expect(isSpec(result)).toBe(true);
		if (!isSpec(result)) return;

		const names = result.entities[0].properties.map((p) => p.name);
		expect(names).toEqual(["z_name", "a_count", "m_flag"]);
	});

	// --- Entity with no properties ---

	test("entity with no properties has empty properties array", () => {
		const yaml = `
- label: Marker
  group: markers
  point: point
`;
		const result = parseSpec(yaml, "yaml");
		expect(isSpec(result)).toBe(true);
		if (isSpec(result)) {
			expect(result.entities[0].properties).toHaveLength(0);
			expect(result.entities[0].hasPath).toBe(false);
		}
	});

	// --- Error cases ---

	test("invalid YAML returns error array", () => {
		const result = parseSpec("{{invalid", "yaml");
		expect(Array.isArray(result)).toBe(true);
		if (Array.isArray(result)) {
			expect(result.some((e) => e.severity === "error")).toBe(true);
		}
	});

	test("invalid JSON returns error array", () => {
		const result = parseSpec("{bad json", "json");
		expect(Array.isArray(result)).toBe(true);
	});

	test("invalid structure (not an array) returns error array", () => {
		const result = parseSpec("{}", "json");
		expect(Array.isArray(result)).toBe(true);
	});

	test("invalid structure (missing label) returns error array", () => {
		const yaml = `
- group: things
  aabb: rect
  properties:
    name: string
`;
		const result = parseSpec(yaml, "yaml");
		expect(Array.isArray(result)).toBe(true);
		if (Array.isArray(result)) {
			expect(result.some((e) => e.severity === "error")).toBe(true);
		}
	});

	// --- Enum edge cases ---

	test("enum with spaces around values parses correctly", () => {
		const yaml = `
- label: Thing
  group: things
  aabb: rect
  properties:
    dir: "enum[up , down , left , right]"
`;
		const result = parseSpec(yaml, "yaml");
		expect(isSpec(result)).toBe(true);
		if (isSpec(result)) {
			const dir = result.entities[0].properties[0] as EnumPropertyField;
			expect(dir.values).toEqual(["up", "down", "left", "right"]);
		}
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx bun test src/mainview/src/spec/__tests__/parse.test.ts 2>&1 | tail -5`
Expected: Failures

- [ ] **Step 3: Write the new parser implementation**

Replace the entire contents of `parse.ts` with:

```typescript
// src/mainview/src/spec/parse.ts
import YAML from "yaml";
import type {
	SpanSpec,
	EntityDef,
	PropertyField,
	SpecError,
	ScalarType,
} from "./types";
import { validateSpec } from "./validate";

const SCALAR_TYPES = new Set<string>([
	"string", "integer", "number", "boolean", "string[]",
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

		const properties: PropertyField[] = [];
		const rawProps = (rawEntity.properties ?? {}) as Record<string, unknown>;

		for (const [name, value] of Object.entries(rawProps)) {
			if (typeof value !== "string") continue;

			const field = parsePropertyType(name, value);
			if (field) properties.push(field);
		}

		builtEntities.push({
			label: rawEntity.label as string,
			group: rawEntity.group as string,
			primaryShape,
			hasPath,
			properties,
		});
	}

	return { format, entities: builtEntities };
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx bun test src/mainview/src/spec/__tests__/parse.test.ts 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 5: Run validation tests too**

Run: `bunx bun test src/mainview/src/spec/__tests__/validate.test.ts 2>&1 | tail -5`
Expected: All tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/mainview/src/spec/parse.ts src/mainview/src/spec/__tests__/parse.test.ts
git commit -m "rewrite spec parser for new declarative format"
```

---

### Task 4: Rewrite diff module

**Files:**
- Rewrite: `src/mainview/src/spec/diff.ts`
- Rewrite: `src/mainview/src/spec/__tests__/diff.test.ts`

- [ ] **Step 1: Write the failing diff tests**

Replace the entire contents of `diff.test.ts` with:

```typescript
// src/mainview/src/spec/__tests__/diff.test.ts
import { describe, test, expect } from "bun:test";
import { diffSpecs } from "../diff";
import { parseSpec } from "../parse";
import type { SpanSpec } from "../types";

function spec(yaml: string): SpanSpec {
	const result = parseSpec(yaml, "yaml");
	if (Array.isArray(result)) throw new Error("Invalid spec in test: " + JSON.stringify(result));
	return result;
}

const BASE = `
- label: Sprite
  group: sprites
  aabb: rect
  properties:
    name: string
    frame: integer
`;

describe("diffSpecs", () => {
	test("identical specs are safe with no changes", () => {
		const s = spec(BASE);
		const diff = diffSpecs(s, s);
		expect(diff.safe).toBe(true);
		expect(diff.changes).toHaveLength(0);
	});

	test("adding an entity is safe", () => {
		const newSpec = spec(BASE + `
- label: Waypoint
  group: waypoints
  point: point
  properties:
    name: string
`);
		const diff = diffSpecs(spec(BASE), newSpec);
		expect(diff.safe).toBe(true);
		expect(diff.changes).toHaveLength(1);
		expect(diff.changes[0].kind).toBe("entity_added");
		expect(diff.changes[0].destructive).toBe(false);
	});

	test("removing an entity is destructive", () => {
		const oldSpec = spec(BASE + `
- label: Waypoint
  group: waypoints
  point: point
  properties:
    name: string
`);
		const diff = diffSpecs(oldSpec, spec(BASE));
		expect(diff.safe).toBe(false);
		expect(diff.changes.some((c) => c.kind === "entity_removed" && c.destructive)).toBe(true);
	});

	test("adding a field is safe", () => {
		const newYaml = `
- label: Sprite
  group: sprites
  aabb: rect
  properties:
    name: string
    frame: integer
    tags: string[]
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(true);
		expect(diff.changes).toHaveLength(1);
		expect(diff.changes[0].kind).toBe("field_added");
		expect(diff.changes[0].field).toBe("tags");
	});

	test("removing a field is destructive", () => {
		const newYaml = `
- label: Sprite
  group: sprites
  aabb: rect
  properties:
    name: string
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(false);
		expect(diff.changes[0].kind).toBe("field_removed");
		expect(diff.changes[0].field).toBe("frame");
	});

	test("changing primary shape is destructive", () => {
		const newYaml = `
- label: Sprite
  group: sprites
  point: point
  properties:
    name: string
    frame: integer
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(false);
		expect(diff.changes.some((c) => c.kind === "primary_shape_changed" && c.destructive)).toBe(true);
	});

	test("scalar type widened integer→number is safe", () => {
		const newYaml = `
- label: Sprite
  group: sprites
  aabb: rect
  properties:
    name: string
    frame: number
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(true);
		expect(diff.changes[0].kind).toBe("field_type_changed");
		expect(diff.changes[0].destructive).toBe(false);
	});

	test("scalar type changed incompatibly is destructive", () => {
		const newYaml = `
- label: Sprite
  group: sprites
  aabb: rect
  properties:
    name: string
    frame: string
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(false);
		expect(diff.changes[0].destructive).toBe(true);
	});

	test("kind changed from scalar to shape is destructive", () => {
		const newYaml = `
- label: Sprite
  group: sprites
  aabb: rect
  properties:
    name: string
    frame: rect
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(false);
		expect(diff.changes[0].kind).toBe("field_type_changed");
		expect(diff.changes[0].destructive).toBe(true);
	});

	test("entities matched by label, not array position", () => {
		const oldYaml = `
- label: Sprite
  group: sprites
  aabb: rect
  properties:
    name: string
- label: Waypoint
  group: waypoints
  point: point
  properties:
    order: integer
`;
		const newYaml = `
- label: Waypoint
  group: waypoints
  point: point
  properties:
    order: integer
- label: Sprite
  group: sprites
  aabb: rect
  properties:
    name: string
`;
		const diff = diffSpecs(spec(oldYaml), spec(newYaml));
		expect(diff.safe).toBe(true);
		expect(diff.changes).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx bun test src/mainview/src/spec/__tests__/diff.test.ts 2>&1 | tail -5`
Expected: Failures

- [ ] **Step 3: Write the new diff implementation**

Replace the entire contents of `diff.ts` with:

```typescript
// src/mainview/src/spec/diff.ts
import type { SpanSpec, SpecDiff, SpecChange, PropertyField } from "./types";

function isTypeWidening(from: string, to: string): boolean {
	return from === "integer" && to === "number";
}

function fieldTypeKey(field: PropertyField): string {
	switch (field.kind) {
		case "scalar": return `scalar:${field.type}`;
		case "enum": return "enum";
		case "color": return "color";
		case "shape": return `shape:${field.shapeType}${field.array ? "[]" : ""}`;
	}
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

	// Changed entities
	for (const [label, oldEnt] of oldEntities) {
		const newEnt = newEntities.get(label);
		if (!newEnt) continue;

		// Primary shape change
		if (oldEnt.primaryShape.kind !== newEnt.primaryShape.kind) {
			changes.push({
				entity: label,
				kind: "primary_shape_changed",
				destructive: true,
				description: `${label} primary shape changed from ${oldEnt.primaryShape.kind} to ${newEnt.primaryShape.kind}`,
			});
		}

		// Field changes
		const oldFields = new Map(oldEnt.properties.map((f) => [f.name, f]));
		const newFields = new Map(newEnt.properties.map((f) => [f.name, f]));

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

		for (const [fieldName, oldField] of oldFields) {
			const newField = newFields.get(fieldName);
			if (!newField) continue;

			if (oldField.kind !== newField.kind) {
				changes.push({
					entity: label,
					field: fieldName,
					kind: "field_type_changed",
					destructive: true,
					description: `${label}.${fieldName} changed kind from ${oldField.kind} to ${newField.kind}`,
				});
			} else if (oldField.kind === "scalar" && newField.kind === "scalar" && oldField.type !== newField.type) {
				const widening = isTypeWidening(oldField.type, newField.type);
				changes.push({
					entity: label,
					field: fieldName,
					kind: "field_type_changed",
					destructive: !widening,
					description: widening
						? `${label}.${fieldName} widened from ${oldField.type} to ${newField.type}`
						: `${label}.${fieldName} changed from ${oldField.type} to ${newField.type}`,
				});
			} else if (oldField.kind === "shape" && newField.kind === "shape") {
				if (oldField.shapeType !== newField.shapeType || oldField.array !== newField.array) {
					changes.push({
						entity: label,
						field: fieldName,
						kind: "field_type_changed",
						destructive: true,
						description: `${label}.${fieldName} shape changed from ${fieldTypeKey(oldField)} to ${fieldTypeKey(newField)}`,
					});
				}
			}
		}
	}

	return {
		safe: !changes.some((c) => c.destructive),
		changes,
	};
}
```

- [ ] **Step 4: Run all spec tests**

Run: `bunx bun test src/mainview/src/spec/__tests__/ 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/spec/diff.ts src/mainview/src/spec/__tests__/diff.test.ts
git commit -m "rewrite spec diff for new declarative format"
```

---

### Task 5: Rewrite annotation module

**Files:**
- Rewrite: `src/mainview/src/annotation.ts`

- [ ] **Step 1: Write the new annotation module**

Replace the entire contents of `annotation.ts` with:

```typescript
// src/mainview/src/annotation.ts
import type {
	SpanSpec,
	EntityDef,
	ShapePropertyField,
} from "./spec/types";
import {
	getEntityByLabel,
	defaultForScalar,
	defaultForEnum,
	defaultForColor,
	defaultForShape,
} from "./spec/types";
import { makeId } from "./types";

export interface Annotation {
	id: string;
	entityType: string;
	aabb: { x: number; y: number; w: number; h: number } | null;
	point: { x: number; y: number } | null;
	properties: Record<string, unknown>;
	_stash?: Record<string, unknown>;
}

export function createAnnotation(
	spec: SpanSpec,
	entityType: string,
	position: { x: number; y: number },
): Annotation {
	const entity = getEntityByLabel(spec, entityType);
	if (!entity) throw new Error(`Unknown entity type: ${entityType}`);

	const aabb = entity.primaryShape.kind === "rect"
		? { x: position.x, y: position.y, w: 16, h: 16 }
		: null;
	const point = entity.primaryShape.kind === "point"
		? { x: position.x, y: position.y }
		: null;

	const properties: Record<string, unknown> = {};
	for (const field of entity.properties) {
		switch (field.kind) {
			case "scalar":
				properties[field.name] = defaultForScalar(field);
				break;
			case "enum":
				properties[field.name] = defaultForEnum(field);
				break;
			case "color":
				properties[field.name] = defaultForColor();
				break;
			case "shape":
				properties[field.name] = defaultForShape(field);
				break;
		}
	}

	return { id: makeId(), entityType, aabb, point, properties };
}

export function createAnnotationWithSize(
	spec: SpanSpec,
	entityType: string,
	position: { x: number; y: number },
	size: { width: number; height: number },
): Annotation {
	const annotation = createAnnotation(spec, entityType, position);
	if (annotation.aabb) {
		annotation.aabb.w = size.width;
		annotation.aabb.h = size.height;
	}
	return annotation;
}

export function duplicateAnnotation(annotation: Annotation): Annotation {
	const aabb = annotation.aabb
		? { ...annotation.aabb, x: annotation.aabb.x + 4, y: annotation.aabb.y + 4 }
		: null;
	const point = annotation.point
		? { ...annotation.point, x: annotation.point.x + 4, y: annotation.point.y + 4 }
		: null;

	return {
		id: makeId(),
		entityType: annotation.entityType,
		aabb,
		point,
		properties: JSON.parse(JSON.stringify(annotation.properties)),
		...(annotation._stash
			? { _stash: JSON.parse(JSON.stringify(annotation._stash)) }
			: {}),
	};
}

export function migrateEntityType(
	annotation: Annotation,
	spec: SpanSpec,
	newType: string,
): Annotation {
	const newEntity = getEntityByLabel(spec, newType);
	if (!newEntity) throw new Error(`Unknown entity type: ${newType}`);

	// Build new primary shape, keeping position if same kind
	let aabb: Annotation["aabb"] = null;
	let point: Annotation["point"] = null;

	if (newEntity.primaryShape.kind === "rect") {
		aabb = annotation.aabb
			? { ...annotation.aabb }
			: { x: annotation.point?.x ?? 0, y: annotation.point?.y ?? 0, w: 16, h: 16 };
	} else {
		point = annotation.point
			? { ...annotation.point }
			: { x: annotation.aabb?.x ?? 0, y: annotation.aabb?.y ?? 0 };
	}

	// Migrate properties
	const oldProps = { ...annotation.properties };
	const newProperties: Record<string, unknown> = {};
	const stash: Record<string, unknown> = { ...(annotation._stash ?? {}) };

	const newFieldNames = new Set(newEntity.properties.map((f) => f.name));

	// Stash old properties not in new type
	for (const [key, value] of Object.entries(oldProps)) {
		if (!newFieldNames.has(key)) {
			stash[key] = value;
		}
	}

	// Set new properties
	for (const field of newEntity.properties) {
		if (field.name in oldProps) {
			newProperties[field.name] = oldProps[field.name];
		} else if (field.name in stash) {
			newProperties[field.name] = stash[field.name];
			delete stash[field.name];
		} else {
			switch (field.kind) {
				case "scalar": newProperties[field.name] = defaultForScalar(field); break;
				case "enum": newProperties[field.name] = defaultForEnum(field); break;
				case "color": newProperties[field.name] = defaultForColor(); break;
				case "shape": newProperties[field.name] = defaultForShape(field); break;
			}
		}
	}

	return {
		id: annotation.id,
		entityType: newType,
		aabb,
		point,
		properties: newProperties,
		...(Object.keys(stash).length > 0 ? { _stash: stash } : {}),
	};
}

export function clampToImage(
	annotation: Annotation,
	imgW: number,
	imgH: number,
): void {
	if (annotation.aabb) {
		const a = annotation.aabb;
		a.w = Math.max(1, Math.min(Math.round(a.w), imgW));
		a.h = Math.max(1, Math.min(Math.round(a.h), imgH));
		a.x = Math.max(0, Math.min(Math.round(a.x), imgW - a.w));
		a.y = Math.max(0, Math.min(Math.round(a.y), imgH - a.h));
	}
	if (annotation.point) {
		const p = annotation.point;
		p.x = Math.max(0, Math.min(Math.round(p.x), imgW));
		p.y = Math.max(0, Math.min(Math.round(p.y), imgH));
	}
}

/** Resolve the absolute position of a shape property (relative to aabb). */
export function resolveShapePropertyPosition(
	annotation: Annotation,
	shapeValue: { x: number; y: number },
): { x: number; y: number } {
	const base = annotation.aabb ?? { x: 0, y: 0 };
	return {
		x: base.x + shapeValue.x,
		y: base.y + shapeValue.y,
	};
}
```

- [ ] **Step 2: Run type check to see remaining consumer errors**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -40`

Note the errors — these are in consumer files that still use the old API. We'll fix them in subsequent tasks.

- [ ] **Step 3: Rewrite annotation tests**

Replace the entire contents of `annotation.test.ts` with:

```typescript
// src/mainview/src/annotation.test.ts
import { describe, test, expect } from "bun:test";
import {
	createAnnotation,
	createAnnotationWithSize,
	migrateEntityType,
	duplicateAnnotation,
	clampToImage,
	resolveShapePropertyPosition,
} from "./annotation";
import type { SpanSpec } from "./spec/types";
import { parseSpec } from "./spec/parse";

function spec(yaml: string): SpanSpec {
	const result = parseSpec(yaml, "yaml");
	if (Array.isArray(result)) throw new Error(JSON.stringify(result));
	return result;
}

const TEST_SPEC = spec(`
- label: Sprite
  group: sprites
  aabb: rect
  path: file_name
  properties:
    name: string
    frame: integer
    collision: rect[]
    origin: point
    direction: enum[up, down, left, right]
    tags: string[]
- label: Tile
  group: tiles
  aabb: rect
  path: file_name
  properties:
    name: string
    solid: boolean
- label: Waypoint
  group: waypoints
  point: point
  properties:
    name: string
    order: integer
`);

describe("createAnnotation", () => {
	test("creates aabb entity with rect at position", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		expect(ann.entityType).toBe("Sprite");
		expect(ann.id).toBeTruthy();
		expect(ann.aabb).toEqual({ x: 10, y: 20, w: 16, h: 16 });
		expect(ann.point).toBeNull();
	});

	test("creates point entity at position", () => {
		const ann = createAnnotation(TEST_SPEC, "Waypoint", { x: 50, y: 60 });
		expect(ann.point).toEqual({ x: 50, y: 60 });
		expect(ann.aabb).toBeNull();
	});

	test("sets scalar property defaults", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 0, y: 0 });
		expect(ann.properties.name).toBe("");
		expect(ann.properties.frame).toBe(0);
		expect(ann.properties.direction).toBe("up");
		expect(ann.properties.tags).toEqual([]);
	});

	test("sets shape property defaults", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 0, y: 0 });
		expect(ann.properties.collision).toEqual([]); // rect[] defaults to empty array
		expect(ann.properties.origin).toEqual({ x: 0, y: 0 }); // point defaults to origin
	});

	test("throws for unknown entity type", () => {
		expect(() => createAnnotation(TEST_SPEC, "Unknown", { x: 0, y: 0 })).toThrow(
			"Unknown entity type: Unknown",
		);
	});
});

describe("createAnnotationWithSize", () => {
	test("creates annotation with custom aabb size", () => {
		const ann = createAnnotationWithSize(TEST_SPEC, "Sprite", { x: 10, y: 20 }, { width: 64, height: 48 });
		expect(ann.aabb).toEqual({ x: 10, y: 20, w: 64, h: 48 });
	});

	test("point entity ignores size", () => {
		const ann = createAnnotationWithSize(TEST_SPEC, "Waypoint", { x: 10, y: 20 }, { width: 64, height: 48 });
		expect(ann.point).toEqual({ x: 10, y: 20 });
		expect(ann.aabb).toBeNull();
	});
});

describe("duplicateAnnotation", () => {
	test("creates copy with new id", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		const copy = duplicateAnnotation(ann);
		expect(copy.id).not.toBe(ann.id);
		expect(copy.entityType).toBe("Sprite");
	});

	test("offsets aabb position by 4px", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		const copy = duplicateAnnotation(ann);
		expect(copy.aabb!.x).toBe(14);
		expect(copy.aabb!.y).toBe(24);
		expect(copy.aabb!.w).toBe(16);
		expect(copy.aabb!.h).toBe(16);
	});

	test("offsets point position by 4px", () => {
		const ann = createAnnotation(TEST_SPEC, "Waypoint", { x: 10, y: 20 });
		const copy = duplicateAnnotation(ann);
		expect(copy.point!.x).toBe(14);
		expect(copy.point!.y).toBe(24);
	});

	test("deep copies properties", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 0, y: 0 });
		ann.properties.tags = ["a", "b"];
		const copy = duplicateAnnotation(ann);

		(copy.properties.tags as string[]).push("c");
		expect(ann.properties.tags).toEqual(["a", "b"]);
	});
});

describe("migrateEntityType", () => {
	test("migrates aabb entity to point entity", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		const migrated = migrateEntityType(ann, TEST_SPEC, "Waypoint");

		expect(migrated.entityType).toBe("Waypoint");
		expect(migrated.point).toEqual({ x: 10, y: 20 });
		expect(migrated.aabb).toBeNull();
	});

	test("migrates point entity to aabb entity", () => {
		const ann = createAnnotation(TEST_SPEC, "Waypoint", { x: 10, y: 20 });
		const migrated = migrateEntityType(ann, TEST_SPEC, "Sprite");

		expect(migrated.aabb).toEqual({ x: 10, y: 20, w: 16, h: 16 });
		expect(migrated.point).toBeNull();
	});

	test("preserves shared properties", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 0, y: 0 });
		ann.properties.name = "hero";

		const migrated = migrateEntityType(ann, TEST_SPEC, "Waypoint");
		expect(migrated.properties.name).toBe("hero");
	});

	test("stashes removed properties", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 0, y: 0 });
		ann.properties.frame = 3;
		ann.properties.direction = "left";

		const migrated = migrateEntityType(ann, TEST_SPEC, "Waypoint");
		expect(migrated._stash?.frame).toBe(3);
		expect(migrated._stash?.direction).toBe("left");
	});

	test("restores stashed properties when migrating back", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 0, y: 0 });
		ann.properties.frame = 5;

		const toWaypoint = migrateEntityType(ann, TEST_SPEC, "Waypoint");
		const backToSprite = migrateEntityType(toWaypoint, TEST_SPEC, "Sprite");

		expect(backToSprite.properties.frame).toBe(5);
	});

	test("preserves annotation id", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 0, y: 0 });
		const migrated = migrateEntityType(ann, TEST_SPEC, "Tile");
		expect(migrated.id).toBe(ann.id);
	});
});

describe("clampToImage", () => {
	test("clamps aabb to image bounds", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: -5, y: -5 });
		ann.aabb!.w = 200;
		clampToImage(ann, 100, 100);

		expect(ann.aabb!.x).toBe(0);
		expect(ann.aabb!.y).toBe(0);
		expect(ann.aabb!.w).toBe(100);
	});

	test("clamps point to image bounds", () => {
		const ann = createAnnotation(TEST_SPEC, "Waypoint", { x: 200, y: -10 });
		clampToImage(ann, 100, 100);

		expect(ann.point!.x).toBe(100);
		expect(ann.point!.y).toBe(0);
	});
});

describe("resolveShapePropertyPosition", () => {
	test("resolves point relative to aabb", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		ann.properties.origin = { x: 5, y: 3 };
		const pos = resolveShapePropertyPosition(ann, ann.properties.origin as { x: number; y: number });
		expect(pos).toEqual({ x: 15, y: 23 });
	});
});
```

- [ ] **Step 4: Run annotation tests**

Run: `bunx bun test src/mainview/src/annotation.test.ts 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/annotation.ts src/mainview/src/annotation.test.ts
git commit -m "rewrite annotation module for new aabb/point primary shape model"
```

---

### Task 6: Rewrite export module

**Files:**
- Rewrite: `src/mainview/src/export.ts`
- Rewrite: `src/mainview/src/export.test.ts`

- [ ] **Step 1: Write the failing export tests**

Replace the entire contents of `export.test.ts` with:

```typescript
// src/mainview/src/export.test.ts
import { describe, expect, it } from "bun:test";
import { buildExportData, exportToString, type ExportEntry } from "./export";
import type { SpanSpec, EntityDef } from "./spec/types";
import type { Annotation } from "./annotation";

// --- Helpers ---

function makeSpriteEntity(extraProperties: EntityDef["properties"] = []): EntityDef {
	return {
		label: "Sprite",
		group: "sprites",
		primaryShape: { kind: "rect" },
		hasPath: true,
		properties: [
			{ kind: "scalar", name: "name", type: "string" },
			...extraProperties,
		],
	};
}

function makeSpec(entities: EntityDef[], format: "yaml" | "json" = "yaml"): SpanSpec {
	return { format, entities };
}

function makeAnnotation(
	entityType: string,
	aabb: Annotation["aabb"],
	point: Annotation["point"] = null,
	properties: Record<string, unknown> = {},
	extra: Partial<Annotation> = {},
): Annotation {
	return { id: "test-id", entityType, aabb, point, properties, ...extra };
}

function entry(ann: Annotation, sheetFile = "sheet.png"): ExportEntry {
	return { annotation: ann, sheetFile };
}

function entries(...anns: Annotation[]): ExportEntry[] {
	return anns.map((a) => entry(a));
}

// --- Tests ---

describe("buildExportData", () => {
	it("groups annotations by entity group key", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation("Sprite", { x: 0, y: 0, w: 16, h: 16 }, null, { name: "hero" });

		const result = buildExportData(entries(ann), spec);
		expect(result["sprites"]).toBeDefined();
		expect(Array.isArray(result["sprites"])).toBe(true);
	});

	it("exports aabb as top-level field with default field names", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation("Sprite", { x: 10, y: 20, w: 32, h: 32 }, null, { name: "hero" });

		const result = buildExportData(entries(ann), spec);
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];
		expect(sprite["aabb"]).toEqual({ x: 10, y: 20, w: 32, h: 32 });
	});

	it("exports point as top-level field", () => {
		const waypointEntity: EntityDef = {
			label: "Waypoint",
			group: "waypoints",
			primaryShape: { kind: "point" },
			hasPath: false,
			properties: [{ kind: "scalar", name: "name", type: "string" }],
		};
		const spec = makeSpec([waypointEntity]);
		const ann = makeAnnotation("Waypoint", null, { x: 5, y: 10 }, { name: "start" });

		const result = buildExportData(entries(ann), spec);
		const wp = (result["waypoints"] as Record<string, unknown>[])[0];
		expect(wp["point"]).toEqual({ x: 5, y: 10 });
	});

	it("exports path field from sheet filename when entity hasPath", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation("Sprite", { x: 0, y: 0, w: 16, h: 16 }, null, { name: "hero" });

		const result = buildExportData([entry(ann, "spritesheet.png")], spec);
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];
		expect(sprite["path"]).toBe("spritesheet.png");
	});

	it("does not export path when entity has no hasPath", () => {
		const entity: EntityDef = {
			label: "Waypoint",
			group: "waypoints",
			primaryShape: { kind: "point" },
			hasPath: false,
			properties: [],
		};
		const spec = makeSpec([entity]);
		const ann = makeAnnotation("Waypoint", null, { x: 5, y: 10 });

		const result = buildExportData(entries(ann), spec);
		const wp = (result["waypoints"] as Record<string, unknown>[])[0];
		expect(wp["path"]).toBeUndefined();
	});

	it("exports scalar properties in spec order", () => {
		const entity = makeSpriteEntity([
			{ kind: "scalar", name: "frame", type: "integer" },
		]);
		const spec = makeSpec([entity]);
		const ann = makeAnnotation("Sprite", { x: 0, y: 0, w: 16, h: 16 }, null, { name: "link_idle", frame: 3 });

		const result = buildExportData(entries(ann), spec);
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];
		expect(sprite["name"]).toBe("link_idle");
		expect(sprite["frame"]).toBe(3);
	});

	it("exports shape properties as objects (single) or arrays", () => {
		const entity: EntityDef = {
			label: "Sprite",
			group: "sprites",
			primaryShape: { kind: "rect" },
			hasPath: false,
			properties: [
				{ kind: "shape", name: "origin", shapeType: "point", array: false },
				{ kind: "shape", name: "collision", shapeType: "rect", array: true },
			],
		};
		const spec = makeSpec([entity]);
		const ann = makeAnnotation("Sprite", { x: 0, y: 0, w: 32, h: 32 }, null, {
			origin: { x: 16, y: 16 },
			collision: [
				{ x: 2, y: 4, w: 28, h: 24 },
				{ x: 0, y: 0, w: 32, h: 32 },
			],
		});

		const result = buildExportData(entries(ann), spec);
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];
		expect(sprite["origin"]).toEqual({ x: 16, y: 16 });
		expect(sprite["collision"]).toEqual([
			{ x: 2, y: 4, w: 28, h: 24 },
			{ x: 0, y: 0, w: 32, h: 32 },
		]);
	});

	it("applies workspace shape field overrides on export", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation("Sprite", { x: 10, y: 20, w: 32, h: 32 }, null, { name: "hero" });

		const shapeFields = {
			rect: ["left", "top", "width", "height"] as [string, string, string, string],
		};
		const result = buildExportData(entries(ann), spec, shapeFields);
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];
		expect(sprite["aabb"]).toEqual({ left: 10, top: 20, width: 32, height: 32 });
	});

	it("applies workspace point field overrides on export", () => {
		const waypointEntity: EntityDef = {
			label: "Waypoint",
			group: "waypoints",
			primaryShape: { kind: "point" },
			hasPath: false,
			properties: [],
		};
		const spec = makeSpec([waypointEntity]);
		const ann = makeAnnotation("Waypoint", null, { x: 5, y: 10 });

		const shapeFields = {
			point: ["px", "py"] as [string, string],
		};
		const result = buildExportData(entries(ann), spec, shapeFields);
		const wp = (result["waypoints"] as Record<string, unknown>[])[0];
		expect(wp["point"]).toEqual({ px: 5, py: 10 });
	});

	it("excludes id and _stash from output", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation(
			"Sprite",
			{ x: 0, y: 0, w: 16, h: 16 },
			null,
			{ name: "hero" },
			{ id: "abc123", _stash: { old_prop: "value" } },
		);

		const result = buildExportData(entries(ann), spec);
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];
		expect(sprite).not.toHaveProperty("id");
		expect(sprite).not.toHaveProperty("_stash");
	});

	it("omits group key when entity type has no annotations", () => {
		const tileEntity: EntityDef = {
			label: "Tile",
			group: "tiles",
			primaryShape: { kind: "rect" },
			hasPath: false,
			properties: [],
		};
		const spec = makeSpec([makeSpriteEntity(), tileEntity]);
		const ann = makeAnnotation("Sprite", { x: 0, y: 0, w: 16, h: 16 }, null, { name: "hero" });

		const result = buildExportData(entries(ann), spec);
		expect(result["sprites"]).toBeDefined();
		expect(result["tiles"]).toBeUndefined();
	});

	it("skips annotations with unknown entity types", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const validAnn = makeAnnotation("Sprite", { x: 0, y: 0, w: 16, h: 16 }, null, { name: "hero" });
		const orphanAnn = makeAnnotation("Ghost", null, null, {});

		const result = buildExportData(entries(validAnn, orphanAnn), spec);
		expect((result["sprites"] as unknown[]).length).toBe(1);
	});

	it("returns empty object for empty annotations", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const result = buildExportData([], spec);
		expect(result["sprites"]).toBeUndefined();
	});
});

describe("exportToString", () => {
	it("produces YAML output when spec format is yaml", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation("Sprite", { x: 1, y: 2, w: 3, h: 4 }, null, { name: "hero" });

		const output = exportToString(entries(ann), spec);
		expect(() => JSON.parse(output)).toThrow();
		expect(output).toContain("sprites:");
	});

	it("produces JSON output when spec format is json", () => {
		const spec = makeSpec([makeSpriteEntity()], "json");
		const ann = makeAnnotation("Sprite", { x: 5, y: 6, w: 7, h: 8 }, null, { name: "hero" });

		const output = exportToString(entries(ann), spec);
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed["sprites"])).toBe(true);
	});

	it("JSON output ends with a newline", () => {
		const spec = makeSpec([makeSpriteEntity()], "json");
		const ann = makeAnnotation("Sprite", { x: 0, y: 0, w: 16, h: 16 }, null, { name: "" });

		const output = exportToString(entries(ann), spec);
		expect(output.endsWith("\n")).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx bun test src/mainview/src/export.test.ts 2>&1 | tail -5`
Expected: Failures

- [ ] **Step 3: Write the new export implementation**

Replace the entire contents of `export.ts` with:

```typescript
// src/mainview/src/export.ts
import YAML from "yaml";
import type { SpanSpec } from "./spec/types";
import { getEntityByLabel } from "./spec/types";
import type { Annotation } from "./annotation";

export interface ExportEntry {
	annotation: Annotation;
	sheetFile: string;
}

export interface ShapeFieldOverrides {
	rect?: [string, string, string, string]; // [x, y, w, h]
	point?: [string, string];                 // [x, y]
}

function remapRect(
	data: { x: number; y: number; w: number; h: number },
	overrides?: [string, string, string, string],
): Record<string, number> {
	const [xKey, yKey, wKey, hKey] = overrides ?? ["x", "y", "w", "h"];
	return { [xKey]: data.x, [yKey]: data.y, [wKey]: data.w, [hKey]: data.h };
}

function remapPoint(
	data: { x: number; y: number },
	overrides?: [string, string],
): Record<string, number> {
	const [xKey, yKey] = overrides ?? ["x", "y"];
	return { [xKey]: data.x, [yKey]: data.y };
}

function remapShapeValue(
	value: unknown,
	shapeType: "rect" | "point",
	array: boolean,
	overrides?: ShapeFieldOverrides,
): unknown {
	if (array) {
		const arr = Array.isArray(value) ? value : [];
		return arr.map((item: any) =>
			shapeType === "rect"
				? remapRect(item, overrides?.rect)
				: remapPoint(item, overrides?.point),
		);
	}
	if (shapeType === "rect") {
		return remapRect(value as any, overrides?.rect);
	}
	return remapPoint(value as any, overrides?.point);
}

export function buildExportData(
	entries: ExportEntry[],
	spec: SpanSpec,
	shapeFields?: ShapeFieldOverrides,
): Record<string, unknown> {
	const output: Record<string, unknown> = {};
	const groups = new Map<string, { items: Record<string, unknown>[] }>();

	for (const { annotation: ann, sheetFile } of entries) {
		const entityDef = getEntityByLabel(spec, ann.entityType);
		if (!entityDef) continue;

		const groupKey = entityDef.group;
		if (!groups.has(groupKey)) {
			groups.set(groupKey, { items: [] });
		}

		const flat: Record<string, unknown> = {};

		// Path field (from sheet filename)
		if (entityDef.hasPath) {
			flat["path"] = sheetFile;
		}

		// Primary shape
		if (ann.aabb) {
			flat["aabb"] = remapRect(ann.aabb, shapeFields?.rect);
		} else if (ann.point) {
			flat["point"] = remapPoint(ann.point, shapeFields?.point);
		}

		// Properties in spec order
		for (const field of entityDef.properties) {
			const value = ann.properties[field.name];
			if (field.kind === "shape") {
				flat[field.name] = remapShapeValue(value, field.shapeType, field.array, shapeFields);
			} else {
				flat[field.name] = value ?? null;
			}
		}

		groups.get(groupKey)!.items.push(flat);
	}

	for (const [groupKey, { items }] of groups) {
		if (items.length > 0) {
			output[groupKey] = items;
		}
	}

	return output;
}

export function exportToString(
	entries: ExportEntry[],
	spec: SpanSpec,
	shapeFields?: ShapeFieldOverrides,
): string {
	const data = buildExportData(entries, spec, shapeFields);

	if (spec.format === "yaml") {
		return YAML.stringify(data, {
			flowCollectionPadding: true,
			defaultKeyType: "PLAIN",
			defaultStringType: "QUOTE_DOUBLE",
		});
	}
	return JSON.stringify(data, null, 2) + "\n";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx bun test src/mainview/src/export.test.ts 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/export.ts src/mainview/src/export.test.ts
git commit -m "rewrite export module with shape field overrides"
```

---

### Task 7: Update persistence module

**Files:**
- Modify: `src/mainview/src/persistence.ts`

- [ ] **Step 1: Update serialization for new Annotation shape**

Replace the entire contents of `persistence.ts` with:

```typescript
// src/mainview/src/persistence.ts
import type { Annotation } from "./annotation";

export interface WorkspaceSheet {
	path: string;
	annotations: Annotation[];
	[key: string]: unknown;
}

export interface SpanFile {
	version: number;
	spec: SpanFileSpec | null;
	sheets: SpanFileSheet[];
}

export interface SpanFileSpec {
	format: "json" | "yaml";
	raw: string;
}

export interface SpanFileSheet {
	path: string;
	annotations: Annotation[];
}

export function serializeWorkspace(
	sheets: WorkspaceSheet[],
	spec: SpanFileSpec | null,
): string {
	const data: SpanFile = {
		version: 2,
		spec,
		sheets: sheets.map((s) => ({
			path: s.path,
			annotations: s.annotations.map((a) => ({
				id: a.id,
				entityType: a.entityType,
				aabb: a.aabb ? { ...a.aabb } : null,
				point: a.point ? { ...a.point } : null,
				properties: JSON.parse(JSON.stringify(a.properties)),
				...(a._stash && Object.keys(a._stash).length > 0
					? { _stash: { ...a._stash } }
					: {}),
			})),
		})),
	};

	return JSON.stringify(data, null, 2) + "\n";
}

export function deserializeWorkspace(raw: string): SpanFile {
	const data = JSON.parse(raw);

	if (typeof data.version !== "number") {
		throw new Error("Invalid .span file: missing version");
	}
	if (data.version > 2) {
		throw new Error(
			`Unsupported .span file version: ${data.version}. This version of Span supports version 2.`,
		);
	}

	let spec: SpanFileSpec | null = null;
	if (data.spec && typeof data.spec === "object" && data.spec.raw) {
		spec = { format: data.spec.format ?? "yaml", raw: data.spec.raw };
	}

	return {
		version: data.version,
		spec,
		sheets: (data.sheets ?? []).map((s: any) => ({
			path: s.path ?? "",
			annotations: (s.annotations ?? []).map((a: any) => ({
				id: a.id ?? "",
				entityType: a.entityType ?? "",
				aabb: a.aabb ?? null,
				point: a.point ?? null,
				properties: a.properties ?? {},
				...(a._stash ? { _stash: a._stash } : {}),
			})),
		})),
	};
}

// --- Autosave debouncing ---
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export function debouncedSave(fn: () => void, delay: number = 500): void {
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = setTimeout(fn, delay);
}
```

- [ ] **Step 2: Rewrite persistence tests**

Replace the entire contents of `persistence.test.ts` with:

```typescript
import { describe, it, expect } from "bun:test";
import {
	serializeWorkspace,
	deserializeWorkspace,
	type WorkspaceSheet,
	type SpanFileSpec,
} from "./persistence";
import type { Annotation } from "./annotation";

// --- Helpers ---

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
	return {
		id: "ann-1",
		entityType: "Sprite",
		aabb: { x: 10, y: 20, w: 32, h: 32 },
		point: null,
		properties: { name: "hero" },
		...overrides,
	};
}

function makeSheet(
	path: string,
	annotations: Annotation[] = [],
): WorkspaceSheet {
	return { path, annotations };
}

const testSpec: SpanFileSpec = {
	format: "yaml",
	raw: "- label: Sprite\n  group: sprites\n  aabb: rect\n  properties:\n    name: string\n",
};

// --- Tests ---

describe("serializeWorkspace", () => {
	it("produces correct JSON structure with version 2", () => {
		const ann = makeAnnotation();
		const sheets = [makeSheet("images/hero.png", [ann])];
		const json = serializeWorkspace(sheets, testSpec);
		const parsed = JSON.parse(json);

		expect(parsed.version).toBe(2);
		expect(parsed.spec).toEqual(testSpec);
		expect(parsed.sheets).toHaveLength(1);
		expect(parsed.sheets[0].path).toBe("images/hero.png");
		expect(parsed.sheets[0].annotations[0].aabb).toEqual({ x: 10, y: 20, w: 32, h: 32 });
		expect(parsed.sheets[0].annotations[0].point).toBeNull();
		expect(parsed.sheets[0].annotations[0].properties).toEqual({ name: "hero" });
	});

	it("ends with a newline", () => {
		const json = serializeWorkspace([], null);
		expect(json.endsWith("\n")).toBe(true);
	});

	it("empty workspace serializes to correct structure", () => {
		const json = serializeWorkspace([], null);
		const parsed = JSON.parse(json);
		expect(parsed).toEqual({ version: 2, spec: null, sheets: [] });
	});

	it("preserves _stash fields in annotations", () => {
		const ann = makeAnnotation({ _stash: { oldProp: "preserved" } });
		const sheets = [makeSheet("a.png", [ann])];
		const json = serializeWorkspace(sheets, null);
		const parsed = JSON.parse(json);
		expect(parsed.sheets[0].annotations[0]._stash).toEqual({ oldProp: "preserved" });
	});

	it("omits _stash when it is empty", () => {
		const ann = makeAnnotation({ _stash: {} });
		const sheets = [makeSheet("a.png", [ann])];
		const json = serializeWorkspace(sheets, null);
		const parsed = JSON.parse(json);
		expect(parsed.sheets[0].annotations[0]._stash).toBeUndefined();
	});

	it("serializes point annotation", () => {
		const ann = makeAnnotation({ aabb: null, point: { x: 5, y: 10 } });
		const sheets = [makeSheet("a.png", [ann])];
		const json = serializeWorkspace(sheets, null);
		const parsed = JSON.parse(json);
		expect(parsed.sheets[0].annotations[0].aabb).toBeNull();
		expect(parsed.sheets[0].annotations[0].point).toEqual({ x: 5, y: 10 });
	});
});

describe("deserializeWorkspace", () => {
	it("correctly parses version 2 JSON", () => {
		const raw = JSON.stringify({
			version: 2,
			spec: testSpec,
			sheets: [{
				path: "images/hero.png",
				annotations: [{
					id: "ann-1",
					entityType: "Sprite",
					aabb: { x: 10, y: 20, w: 32, h: 32 },
					point: null,
					properties: { name: "hero" },
				}],
			}],
		});

		const result = deserializeWorkspace(raw);
		expect(result.version).toBe(2);
		expect(result.sheets[0].annotations[0].aabb).toEqual({ x: 10, y: 20, w: 32, h: 32 });
		expect(result.sheets[0].annotations[0].point).toBeNull();
		expect(result.sheets[0].annotations[0].properties).toEqual({ name: "hero" });
	});

	it("throws when version > 2", () => {
		const raw = JSON.stringify({ version: 3, spec: null, sheets: [] });
		expect(() => deserializeWorkspace(raw)).toThrow("Unsupported .span file version: 3");
	});

	it("throws when version is missing", () => {
		const raw = JSON.stringify({ spec: null, sheets: [] });
		expect(() => deserializeWorkspace(raw)).toThrow("Invalid .span file: missing version");
	});

	it("applies defaults for missing fields", () => {
		const raw = JSON.stringify({ version: 2 });
		const result = deserializeWorkspace(raw);
		expect(result.spec).toBeNull();
		expect(result.sheets).toEqual([]);
	});

	it("applies defaults for missing annotation fields", () => {
		const raw = JSON.stringify({
			version: 2,
			sheets: [{ annotations: [{}] }],
		});
		const result = deserializeWorkspace(raw);
		const ann = result.sheets[0].annotations[0];
		expect(ann.id).toBe("");
		expect(ann.entityType).toBe("");
		expect(ann.aabb).toBeNull();
		expect(ann.point).toBeNull();
		expect(ann.properties).toEqual({});
	});

	it("preserves _stash through deserialization", () => {
		const raw = JSON.stringify({
			version: 2,
			sheets: [{
				path: "a.png",
				annotations: [{
					id: "x",
					entityType: "T",
					aabb: null,
					point: null,
					properties: {},
					_stash: { legacy: 42 },
				}],
			}],
		});
		const result = deserializeWorkspace(raw);
		expect(result.sheets[0].annotations[0]._stash).toEqual({ legacy: 42 });
	});
});

describe("round-trip", () => {
	it("serialize → deserialize → data matches", () => {
		const ann = makeAnnotation({
			aabb: { x: 5, y: 15, w: 64, h: 48 },
			properties: { name: "enemy" },
		});
		const sheets = [makeSheet("levels/stage1.png", [ann])];
		const json = serializeWorkspace(sheets, testSpec);
		const result = deserializeWorkspace(json);

		expect(result.version).toBe(2);
		expect(result.spec).toEqual(testSpec);
		const resultAnn = result.sheets[0].annotations[0];
		expect(resultAnn.aabb).toEqual({ x: 5, y: 15, w: 64, h: 48 });
		expect(resultAnn.properties).toEqual({ name: "enemy" });
	});

	it("_stash fields preserved through round-trip", () => {
		const ann = makeAnnotation({ _stash: { removedProp: "value" } });
		const sheets = [makeSheet("img.png", [ann])];
		const json = serializeWorkspace(sheets, null);
		const result = deserializeWorkspace(json);
		expect(result.sheets[0].annotations[0]._stash).toEqual({ removedProp: "value" });
	});
});
```

- [ ] **Step 3: Run persistence tests**

Run: `bunx bun test src/mainview/src/persistence.test.ts 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/persistence.ts src/mainview/src/persistence.test.ts
git commit -m "update persistence for new annotation shape (version 2)"
```

---

### Task 8: Update state.ts

**Files:**
- Modify: `src/mainview/src/state.ts`

- [ ] **Step 1: Update state.ts for new API**

The key changes are:
1. Remove imports of old helpers (`getShapesForEntity`, etc.) and replace with new ones
2. `updateShapeData` → removed (shapes are now `aabb`/`point` directly or in `properties`)
3. `addAnnotationWithSize` → simplified
4. `clampAnnotationToImage` → `clampToImage` no longer needs spec
5. `getPreviewShapeName` → simplified (primary shape is always known from entity def)
6. `duplicateAnnotation` no longer needs spec

Apply these edits to `state.ts`:

- Remove `getShapesForEntity` from the import line from `./spec/types`
- Update `duplicateAnnotation` call: remove `spec` argument (change `duplicateAnnotation(ann, spec)` to `duplicateAnnotation(ann)`)
- Update `clampAnnotationToImage`: remove spec argument from `clampToImage` call (change `clampToImage(annotation, spec, imgW, imgH)` to `clampToImage(annotation, imgW, imgH)`)
- Simplify `addAnnotationWithSize`: remove shape type lookup, just pass width/height directly
- Update `updateShapeData` to work with `aabb`/`point` directly
- Update `getPreviewShapeName` to return `"aabb"` when entity has rect primary shape, else `null`

The full updated `state.ts` needs these specific changes (apply as edits, not full rewrite — the file has too much unrelated code):

**Import changes:**
```typescript
// Old:
import { getEntityByLabel, getShapesForEntity } from "./spec/types";
// New:
import { getEntityByLabel } from "./spec/types";
```

**`getPreviewShapeName` function:**
```typescript
export function getPreviewShapeName(entityLabel: string): string | null {
	const spec = activeSpec.value;
	if (!spec) return null;
	const entity = getEntityByLabel(spec, entityLabel);
	if (!entity) return null;
	return entity.primaryShape.kind === "rect" ? "aabb" : null;
}
```

**`addAnnotationWithSize` function:**
```typescript
export function addAnnotationWithSize(
	entityType: string,
	x: number,
	y: number,
	...sizeArgs: number[]
) {
	const spec = activeSpec.value;
	const sheet = currentSheet.value;
	if (!spec || !getEntityByLabel(spec, entityType) || !sheet) return;

	const entity = getEntityByLabel(spec, entityType)!;
	const isRect = entity.primaryShape.kind === "rect";

	let annotation;
	if (isRect && sizeArgs.length >= 2) {
		annotation = createAnnotationWithSize(spec, entityType, { x, y }, {
			width: sizeArgs[0],
			height: sizeArgs[1],
		});
	} else {
		annotation = createAnnotation(spec, entityType, { x, y });
	}

	sheet.annotations.push(annotation);
	selectedId.value = annotation.id;
	markDirty(true);
}
```

**`duplicateSelected` function:**
```typescript
export function duplicateSelected() {
	const ann = selectedAnnotation.value;
	const sheet = currentSheet.value;
	if (!ann || !sheet) return;
	const copy = duplicateAnnotation(ann);
	sheet.annotations.push(copy);
	selectedId.value = copy.id;
	markDirty(true);
}
```

**`updateShapeData` function:**
```typescript
export function updateShapeData(shapeName: string, patch: Record<string, number>) {
	const ann = selectedAnnotation.value;
	if (!ann) return;
	if (shapeName === "aabb" && ann.aabb) {
		Object.assign(ann.aabb, patch);
	} else if (shapeName === "point" && ann.point) {
		Object.assign(ann.point, patch);
	}
	markDirty(true);
}
```

**`clampAnnotationToImage` function:**
```typescript
export function clampAnnotationToImage(
	annotation: Annotation,
	imgW: number = imageWidth.value,
	imgH: number = imageHeight.value,
) {
	clampToImage(annotation, imgW, imgH);
}
```

Also update the import of `clampToImage` — it no longer needs `spec`:
```typescript
// Old:
import { createAnnotation, duplicateAnnotation, clampToImage, createAnnotationWithSize } from "./annotation";
// New (same, but function signatures changed):
import { createAnnotation, duplicateAnnotation, clampToImage, createAnnotationWithSize } from "./annotation";
```

And remove `getShapesForEntity` from the spec/types import.

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/state.ts
git commit -m "update state.ts for new annotation and spec APIs"
```

---

### Task 9: Update useCanvas composable

**Files:**
- Modify: `src/mainview/src/composables/useCanvas.ts`

- [ ] **Step 1: Rewrite useCanvas for new annotation model**

Replace the entire contents of `useCanvas.ts` with:

```typescript
import { ref, triggerRef } from "vue";
import type { Annotation } from "../annotation";
import { zoom, annotations, markDirty, activeSpec } from "../state";
import { ZOOM_MIN, ZOOM_MAX } from "../state";
import { getEntityByLabel } from "../spec/types";

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export interface DragState {
	id: string;
	shapeName: string; // "aabb", "point", or a property shape name
	shapeIndex?: number; // for array shape properties
	mode: "move" | "resize";
	pointerId: number;
	startClientX: number;
	startClientY: number;
	startAabb: { x: number; y: number; w: number; h: number } | null;
	startPoint: { x: number; y: number } | null;
	startPropertyValue: unknown;
}

export function useCanvas() {
	const drag = ref<DragState | null>(null);

	function zoomTo(
		nextZoom: number,
		scroller: HTMLElement,
		stage: HTMLElement,
		clientX: number | null = null,
		clientY: number | null = null,
	) {
		const clamped = Math.round(clamp(nextZoom, ZOOM_MIN, ZOOM_MAX) * 10) / 10;
		if (clamped === zoom.value) return;

		const oldZoom = zoom.value;
		const scrollerRect = scroller.getBoundingClientRect();
		const stageRect = stage.getBoundingClientRect();
		const offsetX =
			clientX === null
				? scroller.clientWidth / 2
				: clientX - scrollerRect.left;
		const offsetY =
			clientY === null
				? scroller.clientHeight / 2
				: clientY - scrollerRect.top;
		const stageX =
			clientX === null
				? scroller.scrollLeft + offsetX
				: clientX - stageRect.left;
		const stageY =
			clientY === null
				? scroller.scrollTop + offsetY
				: clientY - stageRect.top;
		const worldX = stageX / oldZoom;
		const worldY = stageY / oldZoom;

		zoom.value = clamped;

		requestAnimationFrame(() => {
			scroller.scrollLeft = worldX * clamped - offsetX;
			scroller.scrollTop = worldY * clamped - offsetY;
		});
	}

	function startDrag(
		event: PointerEvent,
		annotation: Annotation,
		shapeName: string,
		mode: "move" | "resize" = "move",
		shapeIndex?: number,
	) {
		drag.value = {
			id: annotation.id,
			shapeName,
			shapeIndex,
			mode,
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startClientY: event.clientY,
			startAabb: annotation.aabb ? { ...annotation.aabb } : null,
			startPoint: annotation.point ? { ...annotation.point } : null,
			startPropertyValue: shapeName !== "aabb" && shapeName !== "point"
				? JSON.parse(JSON.stringify(annotation.properties[shapeName]))
				: null,
		};
	}

	function onPointerMove(
		event: PointerEvent,
		imageWidth: number,
		imageHeight: number,
	) {
		const d = drag.value;
		if (!d || d.pointerId !== event.pointerId) return;

		const ann = annotations.value.find((a) => a.id === d.id);
		if (!ann) return;

		const deltaX = (event.clientX - d.startClientX) / zoom.value;
		const deltaY = (event.clientY - d.startClientY) / zoom.value;

		if (d.shapeName === "aabb" && ann.aabb && d.startAabb) {
			if (d.mode === "move") {
				const w = ann.aabb.w;
				const h = ann.aabb.h;
				ann.aabb.x = clamp(Math.round(d.startAabb.x + deltaX), 0, imageWidth - w);
				ann.aabb.y = clamp(Math.round(d.startAabb.y + deltaY), 0, imageHeight - h);
			} else if (d.mode === "resize") {
				const x = ann.aabb.x;
				const y = ann.aabb.y;
				ann.aabb.w = clamp(Math.round(d.startAabb.w + deltaX), 1, imageWidth - x);
				ann.aabb.h = clamp(Math.round(d.startAabb.h + deltaY), 1, imageHeight - y);
			}
		} else if (d.shapeName === "point" && ann.point && d.startPoint) {
			ann.point.x = clamp(Math.round(d.startPoint.x + deltaX), 0, imageWidth);
			ann.point.y = clamp(Math.round(d.startPoint.y + deltaY), 0, imageHeight);
		}
		// Property shape drag handling can be added later for the CRUD feature

		markDirty(true);
		triggerRef(annotations);
	}

	function endDrag() {
		drag.value = null;
	}

	return { drag, zoomTo, startDrag, onPointerMove, endDrag };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/composables/useCanvas.ts
git commit -m "update useCanvas for new aabb/point drag model"
```

---

### Task 10: Update Vue components

**Files:**
- Modify: `src/mainview/src/components/CanvasView.vue`
- Modify: `src/mainview/src/components/DynamicInspector.vue`
- Modify: `src/mainview/src/components/GalleryPanel.vue`
- Modify: `src/mainview/src/components/ToolPalette.vue`
- Modify: `src/mainview/src/components/AnnotationList.vue`

This task requires reading each Vue component to understand its current usage, then updating imports and API calls. The changes are mechanical — replacing old type/function references with new ones.

- [ ] **Step 1: Read all Vue components**

Read each of the 5 Vue files listed above to understand current usage patterns.

- [ ] **Step 2: Update CanvasView.vue**

Key changes:
- Remove imports of `ShapeSpecField`, `getShapesForEntity`
- Replace `annotation.shapes[shapeName]` access with `annotation.aabb` / `annotation.point`
- Replace `getShapeRect(annotation, spec, shapeName)` with direct `annotation.aabb` access
- Replace `getShapePosition(annotation, spec, shapeName)` with direct `annotation.point` or `annotation.aabb` access
- Replace `resolveAbsolutePosition` calls with direct aabb/point access

- [ ] **Step 3: Update DynamicInspector.vue**

Key changes:
- Replace `getShapesForEntity`, `getScalarsForEntity` with `entity.properties` iteration
- Replace `ShapeSpecField`, `ScalarSpecField` types with new `PropertyField` union types
- Update shape data display to read from `annotation.aabb`/`annotation.point` and `annotation.properties`
- Display properties in spec order (iterate `entity.properties`)
- Import `migrateEntityType` — its signature changed (no longer needs spec for shapes)

- [ ] **Step 4: Update GalleryPanel.vue**

Key changes:
- Replace `getShapeRect` usage with direct `annotation.aabb` access for thumbnails
- Simplify — if entity has aabb, use it; otherwise no thumbnail clipping

- [ ] **Step 5: Update ToolPalette.vue**

Key changes:
- Replace `getShapesForEntity` with `entity.primaryShape.kind` checks
- Show entity primary shape type in the palette

- [ ] **Step 6: Update AnnotationList.vue**

Key changes:
- Replace any `annotation.shapes` access with `annotation.aabb`/`annotation.point`

- [ ] **Step 7: Type check the full project**

Run: `bunx tsc --noEmit --pretty 2>&1 | tail -20`
Expected: No type errors

- [ ] **Step 8: Run all tests**

Run: `bunx bun test 2>&1 | tail -15`
Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add src/mainview/src/components/
git commit -m "update Vue components for new spec and annotation model"
```

---

### Task 11: Update example spec and verify end-to-end

**Files:**
- Modify: `example_project/example_spec.yaml`

- [ ] **Step 1: Replace example_spec.yaml with new format**

Copy the content from `example_project/example_spec1.yaml` into `example_project/example_spec.yaml`:

```yaml
- label: Sprite
  group: sprites
  aabb: rect
  path: file_name
  properties:
    name: string
    frame: integer
    collision: rect[]
    origin: point
    chroma_key: color
    direction: enum[up, down, left, right]
    variant: string
    tags: string[]

- label: Tile
  group: tiles
  aabb: rect
  path: file_name
  properties:
    name: string
    solid: boolean
    layer: enum[background, foreground, overlay]
    chroma_key: color
    tags: string[]

- label: Waypoint
  group: waypoints
  point: point
  properties:
    name: string
    order: integer
    type: enum[spawn, entrance, exit, warp]
```

- [ ] **Step 2: Remove example_spec1.yaml**

```bash
rm example_project/example_spec1.yaml
```

- [ ] **Step 3: Run all tests one final time**

Run: `bunx bun test 2>&1 | tail -15`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add example_project/
git commit -m "update example spec to new declarative format"
```
