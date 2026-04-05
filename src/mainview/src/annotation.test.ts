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
  name: string
  frame: integer
  duration: integer
  offset: point
  properties:
    collision: rect[]
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
		expect(ann.properties.duration).toBe(1);
		expect(ann.properties.direction).toBe("up");
		expect(ann.properties.tags).toEqual([]);
	});

	test("sets shape property defaults", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 0, y: 0 });
		expect(ann.properties.collision).toEqual([]);
		expect(ann.properties.offset).toEqual({ x: 0, y: 0 });
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

	test("auto-increments ainteger fields on duplicate", () => {
		const specWithAint = spec(`
- label: Sprite
  group: sprites
  aabb: rect
  properties:
    name: string
    seq: ainteger
`);
		const ann = createAnnotation(specWithAint, "Sprite", { x: 0, y: 0 });
		ann.properties.seq = 1;
		const copy = duplicateAnnotation(ann, specWithAint);
		expect(copy.properties.seq).toBe(2);
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
		ann.properties.offset = { x: 5, y: 3 };
		const pos = resolveShapePropertyPosition(ann, ann.properties.offset as { x: number; y: number });
		expect(pos).toEqual({ x: 15, y: 23 });
	});
});
