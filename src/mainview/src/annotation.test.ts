// src/mainview/src/annotation.test.ts
import { describe, test, expect } from "bun:test";
import {
	createAnnotation,
	migrateEntityType,
	getShapeRect,
	getShapePosition,
	getPrimaryShapeName,
	duplicateAnnotation,
	clampToImage,
} from "./annotation";
import type { SpanSpec } from "./spec/types";
import { parseSpec } from "./spec/parse";

function spec(yaml: string): SpanSpec {
	const result = parseSpec(yaml, "yaml");
	if (Array.isArray(result)) throw new Error(JSON.stringify(result));
	return result;
}

// Multi-shape spec: Sprite has slice (rect) + collision (rect) + origin (point)
// Tile has just slice (rect), Waypoint has just point
const TEST_SPEC = spec(`
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
    origin:
      __shape: point
      x: integer
      y: integer
    name: string
    frame: integer
    direction: { enum: [up, down, left, right] }
    tags: "string[]"
- label: Tile
  group: tiles
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
    point:
      __shape: point
      x: integer
      y: integer
    name: string
    order: integer
- label: Zone
  group: zones
  properties:
    area:
      __shape: circle
      cx: integer
      cy: integer
      radius: integer
    name: string
`);

describe("createAnnotation", () => {
	test("creates multi-shape entity with all shapes populated", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		expect(ann.entityType).toBe("Sprite");
		expect(ann.id).toBeTruthy();

		// Primary shape (slice) at position
		expect(ann.shapes.slice).toEqual({ x: 10, y: 20, width: 16, height: 16 });

		// Secondary shape (collision) offset by 4px (index 1)
		expect(ann.shapes.collision).toEqual({ x: 14, y: 24, width: 16, height: 16 });

		// Third shape (origin) offset by 8px (index 2)
		expect(ann.shapes.origin).toEqual({ x: 18, y: 28 });
	});

	test("creates single-shape rect entity", () => {
		const ann = createAnnotation(TEST_SPEC, "Tile", { x: 0, y: 0 });
		expect(ann.shapes.slice).toEqual({ x: 0, y: 0, width: 16, height: 16 });
		expect(Object.keys(ann.shapes)).toHaveLength(1);
	});

	test("creates single-shape point entity", () => {
		const ann = createAnnotation(TEST_SPEC, "Waypoint", { x: 50, y: 60 });
		expect(ann.shapes.point).toEqual({ x: 50, y: 60 });
		expect(Object.keys(ann.shapes)).toHaveLength(1);
	});

	test("creates circle entity with default radius", () => {
		const ann = createAnnotation(TEST_SPEC, "Zone", { x: 100, y: 100 });
		expect(ann.shapes.area).toEqual({ cx: 100, cy: 100, radius: 8 });
	});

	test("sets scalar property defaults", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 0, y: 0 });
		expect(ann.propertyData.name).toBe("");
		expect(ann.propertyData.frame).toBe(0);
		expect(ann.propertyData.direction).toBe("up");
		expect(ann.propertyData.tags).toEqual([]);
	});

	test("throws for unknown entity type", () => {
		expect(() => createAnnotation(TEST_SPEC, "Unknown", { x: 0, y: 0 })).toThrow(
			"Unknown entity type: Unknown",
		);
	});

	test("has no shapeData property (old format removed)", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 0, y: 0 });
		expect((ann as any).shapeData).toBeUndefined();
	});
});

describe("getShapeRect", () => {
	test("returns rect data for named rect shape", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 5, y: 10 });
		ann.shapes.slice.width = 32;
		ann.shapes.slice.height = 24;
		const rect = getShapeRect(ann, TEST_SPEC, "slice");
		expect(rect).toEqual({ x: 5, y: 10, width: 32, height: 24 });
	});

	test("returns rect data for collision shape", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 5, y: 10 });
		const rect = getShapeRect(ann, TEST_SPEC, "collision");
		expect(rect).toEqual({ x: 9, y: 14, width: 16, height: 16 });
	});

	test("returns null for point shape", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 5, y: 10 });
		expect(getShapeRect(ann, TEST_SPEC, "origin")).toBeNull();
	});

	test("returns null for non-existent shape name", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 5, y: 10 });
		expect(getShapeRect(ann, TEST_SPEC, "nonexistent")).toBeNull();
	});

	test("returns null for circle shape", () => {
		const ann = createAnnotation(TEST_SPEC, "Zone", { x: 50, y: 50 });
		expect(getShapeRect(ann, TEST_SPEC, "area")).toBeNull();
	});
});

describe("getShapePosition", () => {
	test("returns position for rect shape", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 5, y: 10 });
		expect(getShapePosition(ann, TEST_SPEC, "slice")).toEqual({ x: 5, y: 10 });
	});

	test("returns position for point shape", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 5, y: 10 });
		expect(getShapePosition(ann, TEST_SPEC, "origin")).toEqual({ x: 13, y: 18 });
	});

	test("returns position for circle shape using cx/cy", () => {
		const ann = createAnnotation(TEST_SPEC, "Zone", { x: 50, y: 60 });
		expect(getShapePosition(ann, TEST_SPEC, "area")).toEqual({ x: 50, y: 60 });
	});

	test("returns null for non-existent shape", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 0, y: 0 });
		expect(getShapePosition(ann, TEST_SPEC, "nope")).toBeNull();
	});
});

describe("getPrimaryShapeName", () => {
	test("returns first shape name for multi-shape entity", () => {
		expect(getPrimaryShapeName(TEST_SPEC, "Sprite")).toBe("slice");
	});

	test("returns first shape name for single-shape entity", () => {
		expect(getPrimaryShapeName(TEST_SPEC, "Waypoint")).toBe("point");
	});

	test("returns null for unknown entity", () => {
		expect(getPrimaryShapeName(TEST_SPEC, "Unknown")).toBeNull();
	});
});

describe("duplicateAnnotation", () => {
	test("creates copy with new id", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		const copy = duplicateAnnotation(ann, TEST_SPEC);
		expect(copy.id).not.toBe(ann.id);
		expect(copy.entityType).toBe("Sprite");
	});

	test("offsets primary shape position by 4px", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		const copy = duplicateAnnotation(ann, TEST_SPEC);

		// Primary (slice) offset by 4
		expect(copy.shapes.slice.x).toBe(14);
		expect(copy.shapes.slice.y).toBe(24);
		expect(copy.shapes.slice.width).toBe(16);
		expect(copy.shapes.slice.height).toBe(16);
	});

	test("does not offset secondary shapes", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		const copy = duplicateAnnotation(ann, TEST_SPEC);

		// Secondary shapes keep their original values
		expect(copy.shapes.collision.x).toBe(ann.shapes.collision.x);
		expect(copy.shapes.collision.y).toBe(ann.shapes.collision.y);
		expect(copy.shapes.origin.x).toBe(ann.shapes.origin.x);
		expect(copy.shapes.origin.y).toBe(ann.shapes.origin.y);
	});

	test("deep copies property data", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 0, y: 0 });
		ann.propertyData.name = "original";
		ann.propertyData.tags = ["a", "b"];
		const copy = duplicateAnnotation(ann, TEST_SPEC);

		expect(copy.propertyData.name).toBe("original");
		expect(copy.propertyData.tags).toEqual(["a", "b"]);

		// Ensure deep copy — mutating copy doesn't affect original
		(copy.propertyData.tags as string[]).push("c");
		expect(ann.propertyData.tags).toEqual(["a", "b"]);
	});

	test("deep copies shapes independently", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		const copy = duplicateAnnotation(ann, TEST_SPEC);

		// Mutating copy's collision doesn't affect original
		copy.shapes.collision.x = 999;
		expect(ann.shapes.collision.x).toBe(14);
	});
});

describe("migrateEntityType", () => {
	test("resets all shapes for new entity type", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 99, y: 99 });
		const migrated = migrateEntityType(ann, TEST_SPEC, "Waypoint");

		expect(migrated.entityType).toBe("Waypoint");
		expect(migrated.shapes.point).toEqual({ x: 0, y: 0 });
		expect(migrated.shapes.slice).toBeUndefined();
		expect(migrated.shapes.collision).toBeUndefined();
		expect(migrated.shapes.origin).toBeUndefined();
	});

	test("preserves shared scalar properties", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		ann.propertyData.name = "hero";
		ann.propertyData.frame = 3;

		const migrated = migrateEntityType(ann, TEST_SPEC, "Waypoint");
		expect(migrated.propertyData.name).toBe("hero"); // shared
		expect(migrated.propertyData.order).toBe(0); // new, default
	});

	test("stashes removed properties", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		ann.propertyData.frame = 3;
		ann.propertyData.direction = "left";
		ann.propertyData.tags = ["a"];

		const migrated = migrateEntityType(ann, TEST_SPEC, "Waypoint");
		expect(migrated._stash?.frame).toBe(3);
		expect(migrated._stash?.direction).toBe("left");
		expect(migrated._stash?.tags).toEqual(["a"]);
	});

	test("restores stashed properties when migrating back", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		ann.propertyData.frame = 5;
		ann.propertyData.direction = "right";

		const toWaypoint = migrateEntityType(ann, TEST_SPEC, "Waypoint");
		const backToSprite = migrateEntityType(toWaypoint, TEST_SPEC, "Sprite");

		expect(backToSprite.propertyData.frame).toBe(5); // restored from stash
		expect(backToSprite.propertyData.direction).toBe("right"); // restored from stash
	});

	test("preserves annotation id", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 0, y: 0 });
		const migrated = migrateEntityType(ann, TEST_SPEC, "Tile");
		expect(migrated.id).toBe(ann.id);
	});

	test("throws for unknown entity type", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 0, y: 0 });
		expect(() => migrateEntityType(ann, TEST_SPEC, "Unknown")).toThrow(
			"Unknown entity type: Unknown",
		);
	});

	test("omits _stash when empty", () => {
		const ann = createAnnotation(TEST_SPEC, "Tile", { x: 0, y: 0 });
		ann.propertyData.name = "test";
		// Tile → Waypoint: "name" is shared, no stashed properties
		const migrated = migrateEntityType(ann, TEST_SPEC, "Waypoint");
		expect(migrated._stash).toBeUndefined();
	});
});

describe("clampToImage", () => {
	test("clamps rect shape to image bounds", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: -5, y: -5 });
		ann.shapes.slice.width = 200;
		clampToImage(ann, TEST_SPEC, 100, 100);

		expect(ann.shapes.slice.x).toBe(0);
		expect(ann.shapes.slice.y).toBe(0);
		expect(ann.shapes.slice.width).toBe(100);
	});

	test("clamps all shapes independently", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: -5, y: -5 });
		// Put collision way out of bounds
		ann.shapes.collision.x = 200;
		ann.shapes.collision.y = 200;

		clampToImage(ann, TEST_SPEC, 100, 100);

		// Both rect shapes clamped
		expect(ann.shapes.slice.x).toBeGreaterThanOrEqual(0);
		expect(ann.shapes.collision.x).toBeLessThanOrEqual(100);
		expect(ann.shapes.collision.y).toBeLessThanOrEqual(100);
	});

	test("clamps point to image bounds", () => {
		const ann = createAnnotation(TEST_SPEC, "Waypoint", { x: 200, y: -10 });
		clampToImage(ann, TEST_SPEC, 100, 100);

		expect(ann.shapes.point.x).toBe(100);
		expect(ann.shapes.point.y).toBe(0);
	});

	test("clamps circle considering radius", () => {
		const ann = createAnnotation(TEST_SPEC, "Zone", { x: 2, y: 2 });
		// radius is 8, so center must be at least 8 from edges
		clampToImage(ann, TEST_SPEC, 100, 100);

		expect(ann.shapes.area.cx).toBeGreaterThanOrEqual(8);
		expect(ann.shapes.area.cy).toBeGreaterThanOrEqual(8);
	});

	test("clamps point shape (origin) in multi-shape entity", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 0, y: 0 });
		ann.shapes.origin.x = 500;
		ann.shapes.origin.y = -20;

		clampToImage(ann, TEST_SPEC, 100, 100);

		expect(ann.shapes.origin.x).toBe(100);
		expect(ann.shapes.origin.y).toBe(0);
	});
});
