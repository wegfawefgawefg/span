// src/mainview/src/spec/__tests__/parse.test.ts
import { describe, test, expect } from "bun:test";
import { parseSpec } from "../parse";
import type { SpanSpec, SpecError, ShapeSpecField, ScalarSpecField, PathSpecField } from "../types";

function isSpec(result: SpanSpec | SpecError[]): result is SpanSpec {
	return !Array.isArray(result);
}

// The example spec YAML (multi-doc with frontmatter)
const EXAMPLE_SPEC_YAML = `---
__properties:
  version: 0.1.0
---
- label: Sprite
  group: sprites
  properties:
    path: FileName
    slice:
      __shape: rect
      x: integer
      y: integer
      width: integer
      height: integer
    collision:
      __shape: rect
      x: integer
      y: integer
      width: integer
      height: integer
    origin:
      __shape: point
      x: integer
      y: integer
    name: string
    frame: integer
    direction: { enum: [up, down, left, right] }
    variant: string
    tags: string[]

- label: Tile
  group: tiles
  properties:
    path: FileName
    slice:
      __shape: rect
      x: integer
      y: integer
      width: integer
      height: integer
    name: string
    solid: boolean
    layer: { enum: [background, foreground, overlay] }
    tags: string[]

- label: Waypoint
  group: waypoints
  properties:
    point:
      __shape: point
      x: integer
      y: integer
    name: string
    order: integer
    type: { enum: [spawn, entrance, exit, warp] }
`;

const YAML_NO_FRONTMATTER = `
- label: Sprite
  group: sprites
  properties:
    slice:
      __shape: rect
      x: integer
      y: integer
      width: integer
      height: integer
    name: string
`;

const JSON_SPEC = JSON.stringify([
	{
		label: "Tile",
		group: "tiles",
		properties: {
			slice: { __shape: "rect", x: "integer", y: "integer", w: "integer", h: "integer" },
			solid: "boolean",
		},
	},
]);

describe("parseSpec", () => {
	// --- Example spec (multi-doc with frontmatter) ---

	test("parses example YAML spec with frontmatter and 3 entities", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		expect(isSpec(result)).toBe(true);
		if (!isSpec(result)) return;

		expect(result.format).toBe("yaml");
		expect(result.frontmatter).toEqual({ version: "0.1.0" });
		expect(result.entities).toHaveLength(3);
		expect(result.entities.map((e) => e.label)).toEqual(["Sprite", "Tile", "Waypoint"]);
		expect(result.entities.map((e) => e.group)).toEqual(["sprites", "tiles", "waypoints"]);
	});

	test("Sprite entity has multiple shapes (2 rect + 1 point)", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		if (!isSpec(result)) return;

		const sprite = result.entities[0];
		const shapes = sprite.fields.filter((f): f is ShapeSpecField => f.kind === "shape");
		expect(shapes).toHaveLength(3);

		expect(shapes[0].name).toBe("slice");
		expect(shapes[0].shapeType).toBe("rect");
		expect(shapes[0].mapping).toEqual({ type: "rect", x: "x", y: "y", width: "width", height: "height" });

		expect(shapes[1].name).toBe("collision");
		expect(shapes[1].shapeType).toBe("rect");

		expect(shapes[2].name).toBe("origin");
		expect(shapes[2].shapeType).toBe("point");
		expect(shapes[2].mapping).toEqual({ type: "point", x: "x", y: "y" });
	});

	test("Sprite has Path and scalar fields in correct order", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		if (!isSpec(result)) return;

		const sprite = result.entities[0];
		const fieldNames = sprite.fields.map((f) => f.name);
		expect(fieldNames).toEqual([
			"path", "slice", "collision", "origin",
			"name", "frame", "direction", "variant", "tags",
		]);

		// path field
		const pathField = sprite.fields[0] as PathSpecField;
		expect(pathField.kind).toBe("path");
		expect(pathField.pathType).toBe("FileName");

		// scalar fields
		const nameField = sprite.fields[4] as ScalarSpecField;
		expect(nameField.kind).toBe("scalar");
		expect(nameField.type).toBe("string");

		const frameField = sprite.fields[5] as ScalarSpecField;
		expect(frameField.kind).toBe("scalar");
		expect(frameField.type).toBe("integer");

		// enum field
		const dirField = sprite.fields[6] as ScalarSpecField;
		expect(dirField.kind).toBe("scalar");
		expect(dirField.type).toBe("enum");
		expect(dirField.enumValues).toEqual(["up", "down", "left", "right"]);

		// string[] field
		const tagsField = sprite.fields[8] as ScalarSpecField;
		expect(tagsField.kind).toBe("scalar");
		expect(tagsField.type).toBe("string[]");
	});

	// --- Frontmatter ---

	test("__properties values land in spec.frontmatter", () => {
		const yaml = `---
__properties:
  version: 1.2.3
  author: test
---
- label: Thing
  group: things
  properties:
    name: string
`;
		const result = parseSpec(yaml, "yaml");
		expect(isSpec(result)).toBe(true);
		if (!isSpec(result)) return;

		expect(result.frontmatter).toEqual({ version: "1.2.3", author: "test" });
	});

	test("spec with no frontmatter has empty frontmatter", () => {
		const result = parseSpec(YAML_NO_FRONTMATTER, "yaml");
		expect(isSpec(result)).toBe(true);
		if (!isSpec(result)) return;

		expect(result.frontmatter).toEqual({});
		expect(result.entities).toHaveLength(1);
		expect(result.entities[0].label).toBe("Sprite");
	});

	// --- JSON ---

	test("parses JSON spec with correct SpanSpec", () => {
		const result = parseSpec(JSON_SPEC, "json");
		expect(isSpec(result)).toBe(true);
		if (!isSpec(result)) return;

		expect(result.format).toBe("json");
		expect(result.frontmatter).toEqual({});
		expect(result.entities).toHaveLength(1);

		const tile = result.entities[0];
		expect(tile.label).toBe("Tile");
		expect(tile.group).toBe("tiles");

		const shape = tile.fields[0] as ShapeSpecField;
		expect(shape.kind).toBe("shape");
		expect(shape.shapeType).toBe("rect");
		expect(shape.mapping).toEqual({ type: "rect", x: "x", y: "y", width: "w", height: "h" });

		const solidField = tile.fields[1] as ScalarSpecField;
		expect(solidField.kind).toBe("scalar");
		expect(solidField.type).toBe("boolean");
	});

	// --- Path types ---

	test("FileName produces PathSpecField entry", () => {
		const yaml = `
- label: Asset
  group: assets
  properties:
    file: FileName
    name: string
`;
		const result = parseSpec(yaml, "yaml");
		expect(isSpec(result)).toBe(true);
		if (!isSpec(result)) return;

		const asset = result.entities[0];
		const file = asset.fields[0] as PathSpecField;
		expect(file.kind).toBe("path");
		expect(file.pathType).toBe("FileName");
	});

	// --- Field order ---

	test("field order preserved from spec", () => {
		const yaml = `
- label: Item
  group: items
  properties:
    z_name: string
    a_count: integer
    m_flag: boolean
`;
		const result = parseSpec(yaml, "yaml");
		expect(isSpec(result)).toBe(true);
		if (!isSpec(result)) return;

		const fieldNames = result.entities[0].fields.map((f) => f.name);
		expect(fieldNames).toEqual(["z_name", "a_count", "m_flag"]);
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
		if (Array.isArray(result)) {
			expect(result.some((e) => e.severity === "error")).toBe(true);
		}
	});

	test("invalid structure (missing label) returns error array", () => {
		const yaml = `
- group: things
  properties:
    name: string
`;
		const result = parseSpec(yaml, "yaml");
		expect(Array.isArray(result)).toBe(true);
		if (Array.isArray(result)) {
			expect(result.some((e) => e.severity === "error")).toBe(true);
		}
	});

	// --- Warnings ---

	test("warnings are preserved but don't block parsing", () => {
		const yaml = `
- label: Thing
  group: things
  properties:
    shape:
      __shape: point
      foo: integer
      bar: integer
    name: string
`;
		const result = parseSpec(yaml, "yaml");
		expect(isSpec(result)).toBe(true);
		if (isSpec(result)) {
			const shape = result.entities[0].fields[0] as ShapeSpecField;
			expect(shape.warnings.length).toBeGreaterThan(0);
			expect(shape.mapping).toBeNull();
		}
	});

	test("entity with no properties has empty fields", () => {
		const yaml = `
- label: Empty
  group: empties
`;
		const result = parseSpec(yaml, "yaml");
		expect(isSpec(result)).toBe(true);
		if (isSpec(result)) {
			expect(result.entities[0].fields).toHaveLength(0);
		}
	});
});
