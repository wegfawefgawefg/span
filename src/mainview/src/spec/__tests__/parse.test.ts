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
  chroma_key: color
  properties:
    name: string
    frame: integer
    collision: rect[]
    origin: point
    direction: enum[up, down, left, right]
    variant: string
    tags: string[]

- label: Tile
  group: tiles
  aabb: rect
  path: file_name
  chroma_key: color
  properties:
    name: string
    solid: boolean
    layer: enum[background, foreground, overlay]
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
		expect(names).toEqual(["name", "frame", "collision", "origin", "direction", "variant", "tags"]);
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

	test("hasChromaKey is true when chroma_key: color is set", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		if (!isSpec(result)) return;
		expect(result.entities[0].hasChromaKey).toBe(true);
		expect(result.entities[1].hasChromaKey).toBe(true);
		expect(result.entities[2].hasChromaKey).toBe(false);
	});

	test("enum property parsed correctly", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		if (!isSpec(result)) return;
		const sprite = result.entities[0];
		const dir = sprite.properties[4] as EnumPropertyField;
		expect(dir.kind).toBe("enum");
		expect(dir.values).toEqual(["up", "down", "left", "right"]);
	});

	test("string[] property parsed correctly", () => {
		const result = parseSpec(EXAMPLE_SPEC_YAML, "yaml");
		if (!isSpec(result)) return;
		const sprite = result.entities[0];
		const tags = sprite.properties[6] as ScalarPropertyField;
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

	test("parses JSON spec", () => {
		const json = JSON.stringify([{
			label: "Tile",
			group: "tiles",
			aabb: "rect",
			properties: { solid: "boolean" },
		}]);
		const result = parseSpec(json, "json");
		expect(isSpec(result)).toBe(true);
		if (!isSpec(result)) return;
		expect(result.format).toBe("json");
		expect(result.entities).toHaveLength(1);
		expect(result.entities[0].primaryShape).toEqual({ kind: "rect" });
	});

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

	test("entity with chroma_key has hasChromaKey true", () => {
		const yaml = `
- label: Sprite
  group: sprites
  aabb: rect
  chroma_key: color
  properties:
    name: string
`;
		const result = parseSpec(yaml, "yaml");
		expect(isSpec(result)).toBe(true);
		if (isSpec(result)) {
			expect(result.entities[0].hasChromaKey).toBe(true);
		}
	});

	test("entity without chroma_key has hasChromaKey false", () => {
		const yaml = `
- label: Waypoint
  group: waypoints
  point: point
  properties:
    name: string
`;
		const result = parseSpec(yaml, "yaml");
		expect(isSpec(result)).toBe(true);
		if (isSpec(result)) {
			expect(result.entities[0].hasChromaKey).toBe(false);
		}
	});

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
