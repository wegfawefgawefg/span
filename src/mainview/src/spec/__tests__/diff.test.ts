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
