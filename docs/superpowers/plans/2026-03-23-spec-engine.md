# Spec Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone spec parsing, validation, inference, and diffing engine that converts user-provided JSON/YAML spec files into typed `SpanSpec` objects.

**Architecture:** Pure TypeScript module in `src/mainview/src/spec/` with no UI dependencies. Four files: types, parse (orchestrator), validate (structural checks), infer (shape field mapping), diff (spec change detection). Tested with Bun's built-in test runner.

**Tech Stack:** TypeScript, Bun test runner, `yaml` npm package

**Spec:** `docs/superpowers/specs/2026-03-23-spec-engine-design.md`

---

## File Structure

### New files

| File | Purpose |
|------|---------|
| `src/mainview/src/spec/types.ts` | All interfaces: `SpanSpec`, `EntityDef`, `ShapeDef`, `ShapeField`, `ShapeMapping`, `PropertyDef`, `SpecError`, `SpecDiff`, `SpecChange`, defaults helper |
| `src/mainview/src/spec/validate.ts` | `validateSpec(raw: unknown): SpecError[]` — structural validation |
| `src/mainview/src/spec/infer.ts` | `inferShapeMapping(type, fields): { mapping, warnings }` — field role inference |
| `src/mainview/src/spec/parse.ts` | `parseSpec(raw: string, format): SpanSpec \| SpecError[]` — orchestrator |
| `src/mainview/src/spec/diff.ts` | `diffSpecs(oldSpec, newSpec): SpecDiff` — change detection |
| `src/mainview/src/spec/__tests__/validate.test.ts` | Validation tests |
| `src/mainview/src/spec/__tests__/infer.test.ts` | Inference tests |
| `src/mainview/src/spec/__tests__/parse.test.ts` | Parse integration tests |
| `src/mainview/src/spec/__tests__/diff.test.ts` | Diff tests |

### Modified files

| File | Changes |
|------|---------|
| `package.json` | Add `yaml` dependency, add `"test"` script |

---

## Task 1: Types and Defaults

**Files:**
- Create: `src/mainview/src/spec/types.ts`

- [ ] **Step 1: Create `types.ts` with all interfaces**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/spec/types.ts
git commit -m "add spec engine type definitions and defaults"
```

---

## Task 2: Add yaml dependency and test script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install yaml package**

```bash
cd /path/to/worktree && bun add yaml
```

- [ ] **Step 2: Add test script to package.json**

Add to the `"scripts"` section:
```json
"test": "bun test"
```

- [ ] **Step 3: Verify bun test works**

Run: `bun test`
Expected: "0 tests" or similar (no test files yet)

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "add yaml dependency and test script"
```

---

## Task 3: Shape Field Inference

**Files:**
- Create: `src/mainview/src/spec/infer.ts`
- Create: `src/mainview/src/spec/__tests__/infer.test.ts`

- [ ] **Step 1: Write inference tests**

```typescript
// src/mainview/src/spec/__tests__/infer.test.ts
import { describe, test, expect } from "bun:test";
import { inferShapeMapping } from "../infer";
import type { ShapeField } from "../types";

describe("inferShapeMapping", () => {
	// --- rect ---
	test("rect with standard names", () => {
		const fields: ShapeField[] = [
			{ name: "x", valueType: "integer" },
			{ name: "y", valueType: "integer" },
			{ name: "width", valueType: "integer" },
			{ name: "height", valueType: "integer" },
		];
		const result = inferShapeMapping("rect", fields);
		expect(result.mapping).toEqual({
			type: "rect",
			x: "x",
			y: "y",
			width: "width",
			height: "height",
		});
		expect(result.warnings).toHaveLength(0);
	});

	test("rect with w/h aliases", () => {
		const fields: ShapeField[] = [
			{ name: "x", valueType: "integer" },
			{ name: "y", valueType: "integer" },
			{ name: "w", valueType: "integer" },
			{ name: "h", valueType: "integer" },
		];
		const result = inferShapeMapping("rect", fields);
		expect(result.mapping).toEqual({
			type: "rect",
			x: "x",
			y: "y",
			width: "w",
			height: "h",
		});
	});

	test("rect with LTRB names", () => {
		const fields: ShapeField[] = [
			{ name: "left", valueType: "integer" },
			{ name: "top", valueType: "integer" },
			{ name: "right", valueType: "integer" },
			{ name: "bottom", valueType: "integer" },
		];
		const result = inferShapeMapping("rect", fields);
		expect(result.mapping).toEqual({
			type: "rect",
			x: "left",
			y: "top",
			width: "right",
			height: "bottom",
		});
	});

	test("rect with unrecognized name warns", () => {
		const fields: ShapeField[] = [
			{ name: "x", valueType: "integer" },
			{ name: "y", valueType: "integer" },
			{ name: "foo", valueType: "integer" },
			{ name: "height", valueType: "integer" },
		];
		const result = inferShapeMapping("rect", fields);
		expect(result.mapping).toBeNull();
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	// --- point ---
	test("point with standard names", () => {
		const fields: ShapeField[] = [
			{ name: "x", valueType: "integer" },
			{ name: "y", valueType: "integer" },
		];
		const result = inferShapeMapping("point", fields);
		expect(result.mapping).toEqual({ type: "point", x: "x", y: "y" });
		expect(result.warnings).toHaveLength(0);
	});

	// --- circle ---
	test("circle with cx/cy/radius", () => {
		const fields: ShapeField[] = [
			{ name: "cx", valueType: "integer" },
			{ name: "cy", valueType: "integer" },
			{ name: "radius", valueType: "integer" },
		];
		const result = inferShapeMapping("circle", fields);
		expect(result.mapping).toEqual({
			type: "circle",
			x: "cx",
			y: "cy",
			radius: "radius",
		});
	});

	test("circle with r alias", () => {
		const fields: ShapeField[] = [
			{ name: "x", valueType: "integer" },
			{ name: "y", valueType: "integer" },
			{ name: "r", valueType: "integer" },
		];
		const result = inferShapeMapping("circle", fields);
		expect(result.mapping).toEqual({
			type: "circle",
			x: "x",
			y: "y",
			radius: "r",
		});
	});

	// --- polygon ---
	test("polygon with points", () => {
		const fields: ShapeField[] = [
			{ name: "points", valueType: "integer" },
		];
		const result = inferShapeMapping("polygon", fields);
		expect(result.mapping).toEqual({ type: "polygon", points: "points" });
	});

	test("polygon with vertices alias", () => {
		const fields: ShapeField[] = [
			{ name: "vertices", valueType: "integer" },
		];
		const result = inferShapeMapping("polygon", fields);
		expect(result.mapping).toEqual({
			type: "polygon",
			points: "vertices",
		});
	});

	// --- number value type ---
	test("rect with number value types", () => {
		const fields: ShapeField[] = [
			{ name: "x", valueType: "number" },
			{ name: "y", valueType: "number" },
			{ name: "width", valueType: "number" },
			{ name: "height", valueType: "number" },
		];
		const result = inferShapeMapping("rect", fields);
		expect(result.mapping).toEqual({
			type: "rect",
			x: "x", y: "y", width: "width", height: "height",
		});
	});

	// --- col/row aliases ---
	test("point with col/row aliases", () => {
		const fields: ShapeField[] = [
			{ name: "col", valueType: "integer" },
			{ name: "row", valueType: "integer" },
		];
		const result = inferShapeMapping("point", fields);
		expect(result.mapping).toEqual({ type: "point", x: "col", y: "row" });
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/mainview/src/spec/__tests__/infer.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement inference**

```typescript
// src/mainview/src/spec/infer.ts
import type { ShapeType, ShapeField, ShapeMapping } from "./types";

// Alias tables: role → recognized field names
const RECT_ALIASES: Record<string, string[]> = {
	x: ["x", "left", "col"],
	y: ["y", "top", "row"],
	width: ["width", "w", "right"],
	height: ["height", "h", "bottom"],
};

const POINT_ALIASES: Record<string, string[]> = {
	x: ["x", "col"],
	y: ["y", "row"],
};

const CIRCLE_ALIASES: Record<string, string[]> = {
	x: ["x", "cx"],
	y: ["y", "cy"],
	radius: ["radius", "r"],
};

const POLYGON_ALIASES: Record<string, string[]> = {
	points: ["points", "vertices", "verts"],
};

const ALIAS_TABLES: Record<ShapeType, Record<string, string[]>> = {
	rect: RECT_ALIASES,
	point: POINT_ALIASES,
	circle: CIRCLE_ALIASES,
	polygon: POLYGON_ALIASES,
};

const EXPECTED_FIELD_COUNT: Record<ShapeType, number> = {
	rect: 4,
	point: 2,
	circle: 3,
	polygon: 1,
};

export function inferShapeMapping(
	type: ShapeType,
	fields: ShapeField[],
): { mapping: ShapeMapping | null; warnings: string[] } {
	const warnings: string[] = [];
	const aliases = ALIAS_TABLES[type];
	const expected = EXPECTED_FIELD_COUNT[type];

	if (fields.length !== expected) {
		warnings.push(
			`Shape type "${type}" expects ${expected} field(s), got ${fields.length}`,
		);
		return { mapping: null, warnings };
	}

	// For each role, find which field matches
	const roleToFieldName: Record<string, string> = {};
	const usedFields = new Set<string>();

	for (const [role, names] of Object.entries(aliases)) {
		const match = fields.find(
			(f) => names.includes(f.name) && !usedFields.has(f.name),
		);
		if (match) {
			roleToFieldName[role] = match.name;
			usedFields.add(match.name);
		}
	}

	// Check for unrecognized fields
	for (const field of fields) {
		if (!usedFields.has(field.name)) {
			warnings.push(
				`Unrecognized field name "${field.name}" for shape type "${type}"`,
			);
		}
	}

	// Check all roles are filled
	const roles = Object.keys(aliases);
	const missingRoles = roles.filter((r) => !(r in roleToFieldName));
	if (missingRoles.length > 0) {
		warnings.push(
			`Could not infer role(s): ${missingRoles.join(", ")} for shape type "${type}"`,
		);
		return { mapping: null, warnings };
	}

	// Build the mapping
	const r = roleToFieldName;
	let mapping: ShapeMapping;
	switch (type) {
		case "rect":
			mapping = {
				type: "rect",
				x: r.x,
				y: r.y,
				width: r.width,
				height: r.height,
			};
			break;
		case "point":
			mapping = { type: "point", x: r.x, y: r.y };
			break;
		case "circle":
			mapping = { type: "circle", x: r.x, y: r.y, radius: r.radius };
			break;
		case "polygon":
			mapping = { type: "polygon", points: r.points };
			break;
	}

	return { mapping, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/mainview/src/spec/__tests__/infer.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/spec/infer.ts src/mainview/src/spec/__tests__/infer.test.ts
git commit -m "add shape field inference with alias-based mapping"
```

---

## Task 4: Validation

**Files:**
- Create: `src/mainview/src/spec/validate.ts`
- Create: `src/mainview/src/spec/__tests__/validate.test.ts`

- [ ] **Step 1: Write validation tests**

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

describe("validateSpec", () => {
	test("valid minimal spec", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "rect", x: "integer", y: "integer", width: "integer", height: "integer" },
					properties: { name: "string" },
				},
			},
		};
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("missing entities", () => {
		expect(errors(validateSpec({}))).toHaveLength(1);
		expect(errors(validateSpec({}))[0].message).toContain("entities");
	});

	test("empty entities", () => {
		expect(errors(validateSpec({ entities: {} }))).toHaveLength(1);
	});

	test("invalid entity name with spaces", () => {
		const raw = {
			entities: {
				"My Sprite": {
					shape: { type: "rect", x: "integer", y: "integer", width: "integer", height: "integer" },
				},
			},
		};
		expect(errors(validateSpec(raw)).length).toBeGreaterThan(0);
	});

	test("invalid shape type", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "hexagon", x: "integer", y: "integer" },
				},
			},
		};
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("hexagon"))).toBe(true);
	});

	test("wrong number of shape fields", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "rect", x: "integer", y: "integer" },
				},
			},
		};
		expect(errors(validateSpec(raw)).length).toBeGreaterThan(0);
	});

	test("invalid shape field type", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", x: "string", y: "integer" },
				},
			},
		};
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("string"))).toBe(true);
	});

	test("invalid property type", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", x: "integer", y: "integer" },
					properties: { name: "blob" },
				},
			},
		};
		expect(errors(validateSpec(raw)).length).toBeGreaterThan(0);
	});

	test("duplicate property name", () => {
		// JS objects can't have duplicate keys, but we test shape/prop collision
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", x: "integer", y: "integer" },
					properties: { x: "string" },
				},
			},
		};
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("collision"))).toBe(true);
	});

	test("enum with fewer than 2 values", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", x: "integer", y: "integer" },
					properties: { dir: { enum: ["up"] } },
				},
			},
		};
		expect(errors(validateSpec(raw)).length).toBeGreaterThan(0);
	});

	test("empty properties section is valid", () => {
		const raw = {
			entities: {
				HitBox: {
					shape: { type: "rect", x: "integer", y: "integer", width: "integer", height: "integer" },
				},
			},
		};
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("unrecognized shape field name produces warning", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", foo: "integer", bar: "integer" },
				},
			},
		};
		const result = validateSpec(raw);
		expect(errors(result)).toHaveLength(0); // inference failure is warning
		expect(warnings(result).length).toBeGreaterThan(0);
	});

	test("enum with non-string values", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", x: "integer", y: "integer" },
					properties: { dir: { enum: [1, 2, 3] } },
				},
			},
		};
		expect(errors(validateSpec(raw)).length).toBeGreaterThan(0);
	});

	test("polygon with invalid nested structure", () => {
		const raw = {
			entities: {
				Region: {
					shape: { type: "polygon", points: { garbage: true } },
				},
			},
		};
		expect(errors(validateSpec(raw)).length).toBeGreaterThan(0);
	});

	test("number shape field type is valid", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", x: "number", y: "number" },
					properties: { name: "string" },
				},
			},
		};
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("string[] property type is valid", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", x: "integer", y: "integer" },
					properties: { tags: "string[]" },
				},
			},
		};
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/mainview/src/spec/__tests__/validate.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement validation**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/mainview/src/spec/__tests__/validate.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/spec/validate.ts src/mainview/src/spec/__tests__/validate.test.ts
git commit -m "add spec validation with structural checks"
```

---

## Task 5: Parse Orchestrator

**Files:**
- Create: `src/mainview/src/spec/parse.ts`
- Create: `src/mainview/src/spec/__tests__/parse.test.ts`

- [ ] **Step 1: Write parse integration tests**

```typescript
// src/mainview/src/spec/__tests__/parse.test.ts
import { describe, test, expect } from "bun:test";
import { parseSpec } from "../parse";
import type { SpanSpec, SpecError } from "../types";

function isSpec(result: SpanSpec | SpecError[]): result is SpanSpec {
	return !Array.isArray(result);
}

const VALID_YAML = `
entities:
  Sprite:
    shape:
      type: rect
      x: integer
      y: integer
      width: integer
      height: integer
    properties:
      name: string
      frame: integer
      direction: { enum: [up, down, left, right] }
  Waypoint:
    shape:
      type: point
      x: integer
      y: integer
    properties:
      name: string
`;

const VALID_JSON = JSON.stringify({
	entities: {
		Tile: {
			shape: { type: "rect", x: "integer", y: "integer", w: "integer", h: "integer" },
			properties: { solid: "boolean" },
		},
	},
});

describe("parseSpec", () => {
	test("parses valid YAML spec", () => {
		const result = parseSpec(VALID_YAML, "yaml");
		expect(isSpec(result)).toBe(true);
		if (!isSpec(result)) return;

		expect(result.format).toBe("yaml");
		expect(Object.keys(result.entities)).toEqual(["Sprite", "Waypoint"]);

		const sprite = result.entities.Sprite;
		expect(sprite.shape.type).toBe("rect");
		expect(sprite.shape.mapping).toEqual({
			type: "rect",
			x: "x", y: "y", width: "width", height: "height",
		});
		expect(sprite.properties).toHaveLength(3);
		expect(sprite.properties[0]).toEqual({ name: "name", type: "string" });
		expect(sprite.properties[2]).toEqual({
			name: "direction",
			type: "enum",
			enumValues: ["up", "down", "left", "right"],
		});
	});

	test("parses valid JSON spec", () => {
		const result = parseSpec(VALID_JSON, "json");
		expect(isSpec(result)).toBe(true);
		if (!isSpec(result)) return;

		expect(result.format).toBe("json");
		const tile = result.entities.Tile;
		expect(tile.shape.mapping).toEqual({
			type: "rect",
			x: "x", y: "y", width: "w", height: "h",
		});
	});

	test("returns errors for invalid YAML", () => {
		const result = parseSpec("{{invalid", "yaml");
		expect(Array.isArray(result)).toBe(true);
	});

	test("returns errors for invalid JSON", () => {
		const result = parseSpec("{bad json", "json");
		expect(Array.isArray(result)).toBe(true);
	});

	test("returns errors for invalid spec structure", () => {
		const result = parseSpec("{}", "json");
		expect(Array.isArray(result)).toBe(true);
		if (Array.isArray(result)) {
			expect(result.some((e) => e.severity === "error")).toBe(true);
		}
	});

	test("entity with no properties is valid", () => {
		const yaml = `
entities:
  HitBox:
    shape:
      type: rect
      x: integer
      y: integer
      width: integer
      height: integer
`;
		const result = parseSpec(yaml, "yaml");
		expect(isSpec(result)).toBe(true);
		if (isSpec(result)) {
			expect(result.entities.HitBox.properties).toHaveLength(0);
		}
	});

	test("warnings are preserved but don't block parsing", () => {
		const yaml = `
entities:
  Thing:
    shape:
      type: point
      foo: integer
      bar: integer
    properties:
      name: string
`;
		const result = parseSpec(yaml, "yaml");
		// Unrecognized field names — inference fails but this is a warning
		// The parse should still succeed but with warnings on the shape
		expect(isSpec(result)).toBe(true);
		if (isSpec(result)) {
			expect(result.entities.Thing.shape.warnings.length).toBeGreaterThan(0);
			expect(result.entities.Thing.shape.mapping).toBeNull();
		}
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/mainview/src/spec/__tests__/parse.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement parse orchestrator**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/mainview/src/spec/__tests__/parse.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run all spec tests**

Run: `bun test src/mainview/src/spec/`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/mainview/src/spec/parse.ts src/mainview/src/spec/__tests__/parse.test.ts
git commit -m "add spec parse orchestrator with YAML/JSON support"
```

---

## Task 6: Spec Diffing

**Files:**
- Create: `src/mainview/src/spec/diff.ts`
- Create: `src/mainview/src/spec/__tests__/diff.test.ts`

- [ ] **Step 1: Write diff tests**

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
entities:
  Sprite:
    shape:
      type: rect
      x: integer
      y: integer
      width: integer
      height: integer
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
  Waypoint:
    shape:
      type: point
      x: integer
      y: integer
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
  Waypoint:
    shape:
      type: point
      x: integer
      y: integer
    properties:
      name: string
`);
		const diff = diffSpecs(oldSpec, spec(BASE));
		expect(diff.safe).toBe(false);
		expect(diff.changes.some((c) => c.kind === "entity_removed" && c.destructive)).toBe(true);
	});

	test("adding a property is safe", () => {
		const newYaml = `
entities:
  Sprite:
    shape:
      type: rect
      x: integer
      y: integer
      width: integer
      height: integer
    properties:
      name: string
      frame: integer
      tags: string[]
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(true);
		expect(diff.changes.some((c) => c.kind === "property_added")).toBe(true);
	});

	test("removing a property is destructive", () => {
		const newYaml = `
entities:
  Sprite:
    shape:
      type: rect
      x: integer
      y: integer
      width: integer
      height: integer
    properties:
      name: string
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(false);
		expect(diff.changes.some((c) => c.kind === "property_removed" && c.destructive)).toBe(true);
	});

	test("changing shape type is destructive", () => {
		const newYaml = `
entities:
  Sprite:
    shape:
      type: point
      x: integer
      y: integer
    properties:
      name: string
      frame: integer
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(false);
		expect(diff.changes.some((c) => c.kind === "shape_type_changed")).toBe(true);
	});

	test("changing property type is destructive", () => {
		const newYaml = `
entities:
  Sprite:
    shape:
      type: rect
      x: integer
      y: integer
      width: integer
      height: integer
    properties:
      name: string
      frame: string
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(false);
		expect(diff.changes.some((c) => c.kind === "property_type_changed" && c.destructive)).toBe(true);
	});

	test("changing enum values is not detected (known limitation)", () => {
		const oldYaml = `
entities:
  Sprite:
    shape:
      type: rect
      x: integer
      y: integer
      width: integer
      height: integer
    properties:
      direction: { enum: [up, down, left, right] }
`;
		const newYaml = `
entities:
  Sprite:
    shape:
      type: rect
      x: integer
      y: integer
      width: integer
      height: integer
    properties:
      direction: { enum: [north, south, east, west] }
`;
		const diff = diffSpecs(spec(oldYaml), spec(newYaml));
		// Both are type "enum" so no type change detected — enum value changes are not tracked
		expect(diff.changes).toHaveLength(0);
	});

	test("widening integer to number is safe", () => {
		const newYaml = `
entities:
  Sprite:
    shape:
      type: rect
      x: integer
      y: integer
      width: integer
      height: integer
    properties:
      name: string
      frame: number
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(true);
		expect(diff.changes.some((c) => c.kind === "property_type_changed" && !c.destructive)).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/mainview/src/spec/__tests__/diff.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement diffing**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/mainview/src/spec/__tests__/diff.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run all spec tests**

Run: `bun test src/mainview/src/spec/`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/mainview/src/spec/diff.ts src/mainview/src/spec/__tests__/diff.test.ts
git commit -m "add spec change diffing with destructive change detection"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `bun test src/mainview/src/spec/`
Expected: All tests PASS (inference, validation, parse, diff)

- [ ] **Step 2: Verify web build still works**

Run: `bun run build:web`
Expected: Build succeeds (the spec module has no side effects so it gets tree-shaken if unused)

- [ ] **Step 3: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```
