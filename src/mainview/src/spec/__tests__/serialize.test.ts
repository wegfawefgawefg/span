import { describe, test, expect } from "bun:test";
import { serializeSpecRaw } from "../serialize";
import { parseSpec } from "../parse";

describe("serializeSpecRaw", () => {
	const YAML_INPUT = `\
- label: Sprite
  group: sprites
  aabb: rect
  properties:
    name: string
    frame: ainteger
`;

	test("round-trips YAML → JSON → YAML without data loss", () => {
		const spec1 = parseSpec(YAML_INPUT, "yaml");
		if (Array.isArray(spec1)) throw new Error("parse failed");

		const json = serializeSpecRaw(YAML_INPUT, "yaml", "json");
		const spec2 = parseSpec(json, "json");
		if (Array.isArray(spec2)) throw new Error("json parse failed");

		expect(spec2.entities).toHaveLength(spec1.entities.length);
		expect(spec2.entities[0].label).toBe("Sprite");
		expect(spec2.entities[0].properties.map((p) => p.name)).toEqual(["name", "frame"]);
	});

	test("round-trips JSON → YAML → JSON without data loss", () => {
		const jsonInput = JSON.stringify([{
			label: "Tile",
			group: "tiles",
			aabb: "rect",
			properties: { name: "string", solid: "boolean" },
		}]);

		const yaml = serializeSpecRaw(jsonInput, "json", "yaml");
		const spec = parseSpec(yaml, "yaml");
		if (Array.isArray(spec)) throw new Error("yaml parse failed");

		expect(spec.entities[0].label).toBe("Tile");
		expect(spec.entities[0].properties.map((p) => p.name)).toEqual(["name", "solid"]);
	});

	test("returns null when source is unparseable", () => {
		const result = serializeSpecRaw("{{invalid", "yaml", "json");
		expect(result).toBeNull();
	});

	test("preserves path and chroma_key fields", () => {
		const yaml = `\
- label: Sprite
  group: sprites
  aabb: rect
  path: file_name
  chroma_key: color
  properties:
    name: string
`;
		const json = serializeSpecRaw(yaml, "yaml", "json");
		expect(json).not.toBeNull();
		const parsed = JSON.parse(json!);
		expect(parsed[0].path).toBe("file_name");
		expect(parsed[0].chroma_key).toBe("color");
	});

	test("preserves enum values", () => {
		const yaml = `\
- label: Thing
  group: things
  aabb: rect
  properties:
    dir: "enum[up, down, left, right]"
`;
		const json = serializeSpecRaw(yaml, "yaml", "json");
		expect(json).not.toBeNull();
		const parsed = JSON.parse(json!);
		expect(parsed[0].properties.dir).toBe("enum[up, down, left, right]");
	});
});
