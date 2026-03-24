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

// Base spec: one entity "Sprite" with a rect shape and two scalar fields
const BASE = `
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
  properties:
    origin:
      __shape: point
      x: integer
      y: integer
    name: string
`);
		const diff = diffSpecs(spec(BASE), newSpec);
		expect(diff.safe).toBe(true);
		expect(diff.changes).toHaveLength(1);
		expect(diff.changes[0].kind).toBe("entity_added");
		expect(diff.changes[0].entity).toBe("Waypoint");
		expect(diff.changes[0].destructive).toBe(false);
	});

	test("removing an entity is destructive", () => {
		const oldSpec = spec(BASE + `
- label: Waypoint
  group: waypoints
  properties:
    origin:
      __shape: point
      x: integer
      y: integer
    name: string
`);
		const diff = diffSpecs(oldSpec, spec(BASE));
		expect(diff.safe).toBe(false);
		expect(diff.changes.some((c) => c.kind === "entity_removed" && c.destructive)).toBe(true);
		expect(diff.changes.find((c) => c.kind === "entity_removed")?.entity).toBe("Waypoint");
	});

	test("adding a field to an entity is safe", () => {
		const newYaml = `
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
    frame: integer
    tags: string[]
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(true);
		expect(diff.changes).toHaveLength(1);
		expect(diff.changes[0].kind).toBe("field_added");
		expect(diff.changes[0].field).toBe("tags");
		expect(diff.changes[0].destructive).toBe(false);
	});

	test("removing a field from an entity is destructive", () => {
		const newYaml = `
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
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(false);
		expect(diff.changes).toHaveLength(1);
		expect(diff.changes[0].kind).toBe("field_removed");
		expect(diff.changes[0].field).toBe("frame");
		expect(diff.changes[0].destructive).toBe(true);
	});

	test("changing shape type is destructive", () => {
		const newYaml = `
- label: Sprite
  group: sprites
  properties:
    slice:
      __shape: point
      x: integer
      y: integer
    name: string
    frame: integer
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(false);
		expect(diff.changes).toHaveLength(1);
		expect(diff.changes[0].kind).toBe("shape_type_changed");
		expect(diff.changes[0].field).toBe("slice");
		expect(diff.changes[0].destructive).toBe(true);
	});

	test("adding a second shape field is safe", () => {
		const newYaml = `
- label: Sprite
  group: sprites
  properties:
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
    name: string
    frame: integer
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(true);
		expect(diff.changes).toHaveLength(1);
		expect(diff.changes[0].kind).toBe("field_added");
		expect(diff.changes[0].field).toBe("collision");
		expect(diff.changes[0].destructive).toBe(false);
	});

	test("removing a shape field is destructive", () => {
		const oldYaml = `
- label: Sprite
  group: sprites
  properties:
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
    name: string
    frame: integer
`;
		const diff = diffSpecs(spec(oldYaml), spec(BASE));
		expect(diff.safe).toBe(false);
		expect(diff.changes).toHaveLength(1);
		expect(diff.changes[0].kind).toBe("field_removed");
		expect(diff.changes[0].field).toBe("collision");
		expect(diff.changes[0].destructive).toBe(true);
	});

	test("scalar type widened integer→number is safe", () => {
		const newYaml = `
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
    frame: number
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(true);
		expect(diff.changes).toHaveLength(1);
		expect(diff.changes[0].kind).toBe("field_type_changed");
		expect(diff.changes[0].field).toBe("frame");
		expect(diff.changes[0].destructive).toBe(false);
	});

	test("scalar type changed incompatibly is destructive", () => {
		const newYaml = `
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
    frame: string
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(false);
		expect(diff.changes).toHaveLength(1);
		expect(diff.changes[0].kind).toBe("field_type_changed");
		expect(diff.changes[0].field).toBe("frame");
		expect(diff.changes[0].destructive).toBe(true);
	});

	test("kind changed from shape to scalar is destructive", () => {
		// 'slice' was a shape, now is a scalar
		const newYaml = `
- label: Sprite
  group: sprites
  properties:
    slice: string
    name: string
    frame: integer
`;
		const diff = diffSpecs(spec(BASE), spec(newYaml));
		expect(diff.safe).toBe(false);
		expect(diff.changes).toHaveLength(1);
		expect(diff.changes[0].kind).toBe("field_type_changed");
		expect(diff.changes[0].field).toBe("slice");
		expect(diff.changes[0].destructive).toBe(true);
	});

	test("entities matched by label, not array position", () => {
		// Old: [Sprite, Waypoint], New: [Waypoint, Sprite] — order swapped, should be identical
		const oldYaml = `
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
- label: Waypoint
  group: waypoints
  properties:
    origin:
      __shape: point
      x: integer
      y: integer
`;
		const newYaml = `
- label: Waypoint
  group: waypoints
  properties:
    origin:
      __shape: point
      x: integer
      y: integer
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
		const diff = diffSpecs(spec(oldYaml), spec(newYaml));
		expect(diff.safe).toBe(true);
		expect(diff.changes).toHaveLength(0);
	});

	test("enum type change not detected — known limitation", () => {
		const oldYaml = `
- label: Sprite
  group: sprites
  properties:
    slice:
      __shape: rect
      x: integer
      y: integer
      width: integer
      height: integer
    direction:
      enum: [up, down, left, right]
`;
		const newYaml = `
- label: Sprite
  group: sprites
  properties:
    slice:
      __shape: rect
      x: integer
      y: integer
      width: integer
      height: integer
    direction:
      enum: [north, south, east, west]
`;
		const diff = diffSpecs(spec(oldYaml), spec(newYaml));
		// Both are type "enum" — enum value changes are not tracked
		expect(diff.changes).toHaveLength(0);
	});
});
