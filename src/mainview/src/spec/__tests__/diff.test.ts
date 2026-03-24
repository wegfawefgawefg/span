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
