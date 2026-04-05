// src/mainview/src/spec/__tests__/validate.test.ts
import { describe, test, expect } from "bun:test";
import { validateSpec } from "../validate";

function errors(result: ReturnType<typeof validateSpec>) {
	return result.filter((e) => e.severity === "error");
}
function warnings(result: ReturnType<typeof validateSpec>) {
	return result.filter((e) => e.severity === "warning");
}

/** Minimal valid entity with aabb */
function entity(overrides: Record<string, unknown> = {}) {
	return {
		label: "Sprite",
		group: "sprites",
		aabb: "rect",
		properties: { name: "string" },
		...overrides,
	};
}

/** Minimal valid point entity */
function pointEntity(overrides: Record<string, unknown> = {}) {
	return {
		label: "Waypoint",
		group: "waypoints",
		point: "point",
		properties: { name: "string" },
		...overrides,
	};
}

describe("validateSpec", () => {
	// --- Structure ---

	test("valid spec with single aabb entity", () => {
		expect(errors(validateSpec([entity()]))).toHaveLength(0);
	});

	test("valid spec with single point entity", () => {
		expect(errors(validateSpec([pointEntity()]))).toHaveLength(0);
	});

	test("valid spec with multiple entities", () => {
		const raw = [entity(), pointEntity()];
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("input must be an array", () => {
		expect(errors(validateSpec({}))).toHaveLength(1);
		expect(errors(validateSpec({}))[0].message).toContain("array");
	});

	test("input must be an array — not null", () => {
		expect(errors(validateSpec(null))).toHaveLength(1);
	});

	test("input must be an array — not string", () => {
		expect(errors(validateSpec("hello"))).toHaveLength(1);
	});

	test("empty array is error", () => {
		const result = errors(validateSpec([]));
		expect(result).toHaveLength(1);
		expect(result[0].message).toContain("at least one");
	});

	test("entity must be an object", () => {
		expect(errors(validateSpec(["not_an_object"]))).toHaveLength(1);
	});

	// --- label ---

	test("missing label → error", () => {
		const raw = [{ group: "sprites", aabb: "rect", properties: {} }];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("label"))).toBe(true);
	});

	test("empty label → error", () => {
		expect(errors(validateSpec([entity({ label: "" })])).some((e) => e.message.includes("label"))).toBe(true);
	});

	test("label with spaces → error", () => {
		expect(errors(validateSpec([entity({ label: "My Sprite" })])).some((e) => e.message.includes("identifier"))).toBe(true);
	});

	test("duplicate label → error", () => {
		const raw = [entity(), entity({ group: "tiles" })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("Duplicate label"))).toBe(true);
	});

	// --- group ---

	test("missing group → error", () => {
		const raw = [{ label: "Sprite", aabb: "rect", properties: {} }];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("group"))).toBe(true);
	});

	test("empty group → error", () => {
		expect(errors(validateSpec([entity({ group: "" })])).some((e) => e.message.includes("group"))).toBe(true);
	});

	test("duplicate group → error", () => {
		const raw = [entity(), entity({ label: "Tile" })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("Duplicate group"))).toBe(true);
	});

	// --- primary shape ---

	test("entity must have exactly one primary shape", () => {
		const raw = [{ label: "Sprite", group: "sprites", properties: { name: "string" } }];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("primary shape"))).toBe(true);
	});

	test("entity cannot have both aabb and point", () => {
		const raw = [{ label: "Sprite", group: "sprites", aabb: "rect", point: "point", properties: {} }];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("primary shape"))).toBe(true);
	});

	test("aabb value must be 'rect'", () => {
		expect(errors(validateSpec([entity({ aabb: "circle" })])).some((e) => e.message.includes("rect"))).toBe(true);
	});

	test("point value must be 'point'", () => {
		const raw = [pointEntity({ point: "rect" })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("point"))).toBe(true);
	});

	// --- path ---

	test("path: file_name is valid", () => {
		expect(errors(validateSpec([entity({ path: "file_name" })]))).toHaveLength(0);
	});

	test("path with invalid value → error", () => {
		expect(errors(validateSpec([entity({ path: "something_else" })])).some((e) => e.message.includes("file_name"))).toBe(true);
	});

	// --- chroma_key ---

	test("chroma_key: color is valid", () => {
		expect(errors(validateSpec([entity({ chroma_key: "color" })]))).toHaveLength(0);
	});

	test("chroma_key with invalid value → error", () => {
		expect(errors(validateSpec([entity({ chroma_key: "hex" })])).some((e) => e.message.includes("color"))).toBe(true);
	});

	// --- properties ---

	test("entity with no properties key is valid", () => {
		const raw = [{ label: "Sprite", group: "sprites", aabb: "rect" }];
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("entity with empty properties is valid", () => {
		expect(errors(validateSpec([entity({ properties: {} })]))).toHaveLength(0);
	});

	test("properties must be an object", () => {
		expect(errors(validateSpec([entity({ properties: "bad" })])).some((e) => e.message.includes("Properties"))).toBe(true);
	});

	test("properties as array → error", () => {
		expect(errors(validateSpec([entity({ properties: [1, 2] })])).some((e) => e.message.includes("Properties"))).toBe(true);
	});

	// --- scalar types ---

	test("valid scalar types", () => {
		for (const type of ["string", "integer", "number", "boolean", "string[]"]) {
			expect(errors(validateSpec([entity({ properties: { f: type } })]))).toHaveLength(0);
		}
	});

	test("ainteger type is valid", () => {
		expect(errors(validateSpec([entity({ properties: { seq: "ainteger" } })]))).toHaveLength(0);
	});

	test("unknown type → error", () => {
		expect(errors(validateSpec([entity({ properties: { f: "blob" } })])).some((e) => e.message.includes("blob"))).toBe(true);
	});

	// --- color ---

	test("color type is valid", () => {
		expect(errors(validateSpec([entity({ properties: { c: "color" } })]))).toHaveLength(0);
	});

	// --- enum ---

	test("valid inline enum", () => {
		expect(errors(validateSpec([entity({ properties: { dir: "enum[up, down, left, right]" } })]))).toHaveLength(0);
	});

	test("enum with fewer than 2 values → error", () => {
		expect(errors(validateSpec([entity({ properties: { dir: "enum[up]" } })])).some((e) => e.message.includes("at least 2"))).toBe(true);
	});

	test("enum with no values → error", () => {
		expect(errors(validateSpec([entity({ properties: { dir: "enum[]" } })])).some((e) => e.message.includes("at least 2"))).toBe(true);
	});

	// --- shape properties ---

	test("rect shape property is valid", () => {
		expect(errors(validateSpec([entity({ properties: { bounds: "rect" } })]))).toHaveLength(0);
	});

	test("point shape property is valid", () => {
		expect(errors(validateSpec([entity({ properties: { offset: "point" } })]))).toHaveLength(0);
	});

	test("rect[] shape property is valid", () => {
		expect(errors(validateSpec([entity({ properties: { collision: "rect[]" } })]))).toHaveLength(0);
	});

	test("point[] shape property is valid", () => {
		expect(errors(validateSpec([entity({ properties: { hotspots: "point[]" } })]))).toHaveLength(0);
	});

	test("shape property on point entity → error", () => {
		const raw = [pointEntity({ properties: { bounds: "rect" } })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("aabb"))).toBe(true);
	});

	// --- reserved prefix ---

	test("field name with __ prefix → error", () => {
		expect(errors(validateSpec([entity({ properties: { __hidden: "string" } })])).some((e) => e.message.includes("reserved"))).toBe(true);
	});

	// --- non-string non-object field value ---

	test("numeric field value → error", () => {
		expect(errors(validateSpec([entity({ properties: { bad: 42 } })])).some((e) => e.message.includes("Invalid"))).toBe(true);
	});

	test("boolean field value → error", () => {
		expect(errors(validateSpec([entity({ properties: { bad: true } })])).some((e) => e.message.includes("Invalid"))).toBe(true);
	});

	test("null field value → error", () => {
		expect(errors(validateSpec([entity({ properties: { bad: null } })])).some((e) => e.message.includes("Invalid"))).toBe(true);
	});

	test("array field value → error", () => {
		expect(errors(validateSpec([entity({ properties: { bad: [1, 2] } })])).some((e) => e.message.includes("Invalid"))).toBe(true);
	});
});
