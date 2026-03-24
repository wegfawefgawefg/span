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
