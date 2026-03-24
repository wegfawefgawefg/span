// src/mainview/src/annotation.test.ts
import { describe, test, expect } from "bun:test";
import {
	createAnnotation,
	migrateEntityType,
	getShapeRect,
	getShapePosition,
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

const TEST_SPEC = spec(`
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
      order: integer
  Circle:
    shape:
      type: circle
      cx: integer
      cy: integer
      radius: integer
    properties:
      name: string
`);

describe("createAnnotation", () => {
	test("creates rect annotation with defaults", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		expect(ann.entityType).toBe("Sprite");
		expect(ann.shapeData.x).toBe(10);
		expect(ann.shapeData.y).toBe(20);
		expect(ann.shapeData.width).toBe(16);
		expect(ann.shapeData.height).toBe(16);
		expect(ann.propertyData.name).toBe("");
		expect(ann.propertyData.frame).toBe(0);
		expect(ann.propertyData.direction).toBe("up");
		expect(ann.id).toBeTruthy();
	});

	test("creates point annotation", () => {
		const ann = createAnnotation(TEST_SPEC, "Waypoint", { x: 50, y: 60 });
		expect(ann.shapeData.x).toBe(50);
		expect(ann.shapeData.y).toBe(60);
		expect(Object.keys(ann.shapeData)).toHaveLength(2);
	});

	test("creates circle annotation with default radius", () => {
		const ann = createAnnotation(TEST_SPEC, "Circle", { x: 100, y: 100 });
		expect(ann.shapeData.cx).toBe(100);
		expect(ann.shapeData.cy).toBe(100);
		expect(ann.shapeData.radius).toBe(8);
	});
});

describe("migrateEntityType", () => {
	test("migrates Sprite to Waypoint, preserving shared properties", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		ann.propertyData.name = "hero";
		ann.propertyData.frame = 3;

		const migrated = migrateEntityType(ann, TEST_SPEC, "Waypoint");
		expect(migrated.entityType).toBe("Waypoint");
		expect(migrated.propertyData.name).toBe("hero"); // shared
		expect(migrated.propertyData.order).toBe(0); // new, default
		expect(migrated._stash?.frame).toBe(3); // stashed
		expect(migrated._stash?.direction).toBe("up"); // stashed
	});

	test("resets shape data on type change", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 99, y: 99 });
		const migrated = migrateEntityType(ann, TEST_SPEC, "Waypoint");
		expect(migrated.shapeData.x).toBe(0);
		expect(migrated.shapeData.y).toBe(0);
		expect(migrated.shapeData.width).toBeUndefined();
	});
});

describe("getShapeRect", () => {
	test("returns rect for rect shape", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 5, y: 10 });
		ann.shapeData.width = 32;
		ann.shapeData.height = 24;
		const rect = getShapeRect(ann, TEST_SPEC);
		expect(rect).toEqual({ x: 5, y: 10, width: 32, height: 24 });
	});

	test("returns null for point shape", () => {
		const ann = createAnnotation(TEST_SPEC, "Waypoint", { x: 5, y: 10 });
		expect(getShapeRect(ann, TEST_SPEC)).toBeNull();
	});
});

describe("getShapePosition", () => {
	test("returns position for rect", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 5, y: 10 });
		expect(getShapePosition(ann, TEST_SPEC)).toEqual({ x: 5, y: 10 });
	});

	test("returns position for circle using cx/cy", () => {
		const ann = createAnnotation(TEST_SPEC, "Circle", { x: 50, y: 60 });
		expect(getShapePosition(ann, TEST_SPEC)).toEqual({ x: 50, y: 60 });
	});
});

describe("duplicateAnnotation", () => {
	test("creates copy with new id and offset position", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		ann.propertyData.name = "original";
		const copy = duplicateAnnotation(ann, TEST_SPEC);
		expect(copy.id).not.toBe(ann.id);
		expect(copy.shapeData.x).toBe(14); // offset by 4
		expect(copy.shapeData.y).toBe(24);
		expect(copy.propertyData.name).toBe("original");
	});
});

describe("clampToImage", () => {
	test("clamps rect to image bounds", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: -5, y: -5 });
		ann.shapeData.width = 200;
		clampToImage(ann, TEST_SPEC, 100, 100);
		expect(ann.shapeData.x).toBe(0);
		expect(ann.shapeData.y).toBe(0);
		expect(ann.shapeData.width).toBe(100);
	});

	test("clamps point to image bounds", () => {
		const ann = createAnnotation(TEST_SPEC, "Waypoint", { x: 200, y: -10 });
		clampToImage(ann, TEST_SPEC, 100, 100);
		expect(ann.shapeData.x).toBe(100);
		expect(ann.shapeData.y).toBe(0);
	});
});
