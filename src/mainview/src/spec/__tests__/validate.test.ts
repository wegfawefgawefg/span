// src/mainview/src/spec/__tests__/validate.test.ts
import { describe, test, expect } from "bun:test";
import { validateSpec } from "../validate";

function errors(result: ReturnType<typeof validateSpec>) {
	return result.filter((e) => e.severity === "error");
}
function warnings(result: ReturnType<typeof validateSpec>) {
	return result.filter((e) => e.severity === "warning");
}

/** Helper: minimal valid entity */
function entity(overrides: Record<string, unknown> = {}) {
	return {
		label: "Sprite",
		group: "sprites",
		properties: {
			slice: { __shape: "rect", x: "integer", y: "integer", width: "integer", height: "integer" },
			name: "string",
		},
		...overrides,
	};
}

describe("validateSpec", () => {
	// --- Structure ---

	test("valid spec with single entity", () => {
		expect(errors(validateSpec([entity()]))).toHaveLength(0);
	});

	test("valid spec with multiple entities", () => {
		const raw = [
			entity(),
			entity({ label: "Tile", group: "tiles", properties: { pos: { __shape: "point", x: "integer", y: "integer" } } }),
		];
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
		const raw = [{ group: "sprites", properties: {} }];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("label"))).toBe(true);
	});

	test("empty label → error", () => {
		const raw = [entity({ label: "" })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("label"))).toBe(true);
	});

	test("label with spaces → error", () => {
		const raw = [entity({ label: "My Sprite" })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("identifier"))).toBe(true);
	});

	test("label with leading digit → error", () => {
		const raw = [entity({ label: "3D" })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("identifier"))).toBe(true);
	});

	test("duplicate label → error", () => {
		const raw = [entity(), entity({ group: "tiles" })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("Duplicate label"))).toBe(true);
	});

	// --- group ---

	test("missing group → error", () => {
		const raw = [{ label: "Sprite", properties: {} }];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("group"))).toBe(true);
	});

	test("empty group → error", () => {
		const raw = [entity({ group: "" })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("group"))).toBe(true);
	});

	test("duplicate group → error", () => {
		const raw = [entity(), entity({ label: "Tile" })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("Duplicate group"))).toBe(true);
	});

	// --- properties ---

	test("entity with no properties key is valid", () => {
		const raw = [{ label: "Sprite", group: "sprites" }];
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("entity with empty properties is valid", () => {
		const raw = [entity({ properties: {} })];
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("properties must be an object", () => {
		const raw = [entity({ properties: "bad" })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("Properties"))).toBe(true);
	});

	test("properties as array → error", () => {
		const raw = [entity({ properties: [1, 2] })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("Properties"))).toBe(true);
	});

	// --- reserved __ prefix ---

	test("field name with __ prefix → error", () => {
		const raw = [entity({ properties: { __hidden: "string" } })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("reserved"))).toBe(true);
	});

	test("field named __shape at top level → error", () => {
		const raw = [entity({ properties: { __shape: "string" } })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("reserved"))).toBe(true);
	});

	// --- Shape fields ---

	test("valid rect shape", () => {
		const raw = [entity({
			properties: {
				box: { __shape: "rect", x: "integer", y: "integer", width: "integer", height: "integer" },
			},
		})];
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("valid point shape", () => {
		const raw = [entity({
			properties: {
				origin: { __shape: "point", x: "integer", y: "integer" },
			},
		})];
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("valid circle shape", () => {
		const raw = [entity({
			properties: {
				area: { __shape: "circle", x: "integer", y: "integer", radius: "integer" },
			},
		})];
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("valid polygon shape", () => {
		const raw = [entity({
			properties: {
				region: {
					__shape: "polygon",
					points: { type: "array", items: { x: "integer", y: "integer" } },
				},
			},
		})];
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("unknown __shape type → error", () => {
		const raw = [entity({
			properties: {
				thing: { __shape: "hexagon", a: "integer" },
			},
		})];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("hexagon"))).toBe(true);
	});

	test("wrong number of shape fields for rect", () => {
		const raw = [entity({
			properties: {
				box: { __shape: "rect", x: "integer", y: "integer" },
			},
		})];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("requires exactly 4"))).toBe(true);
	});

	test("wrong number of shape fields for point", () => {
		const raw = [entity({
			properties: {
				pos: { __shape: "point", x: "integer", y: "integer", z: "integer" },
			},
		})];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("requires exactly 2"))).toBe(true);
	});

	test("invalid shape field type → error", () => {
		const raw = [entity({
			properties: {
				pos: { __shape: "point", x: "string", y: "integer" },
			},
		})];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes('"string"'))).toBe(true);
	});

	test("number shape field type is valid", () => {
		const raw = [entity({
			properties: {
				pos: { __shape: "point", x: "number", y: "number" },
			},
		})];
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("unrecognized shape field names produce warnings", () => {
		const raw = [entity({
			properties: {
				pos: { __shape: "point", foo: "integer", bar: "integer" },
			},
		})];
		const result = validateSpec(raw);
		expect(errors(result)).toHaveLength(0);
		expect(warnings(result).length).toBeGreaterThan(0);
	});

	test("multiple shapes on one entity", () => {
		const raw = [entity({
			properties: {
				slice: { __shape: "rect", x: "integer", y: "integer", width: "integer", height: "integer" },
				collision: { __shape: "rect", x: "integer", y: "integer", width: "integer", height: "integer" },
				origin: { __shape: "point", x: "integer", y: "integer" },
			},
		})];
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	// --- Scalar types ---

	test("valid scalar types", () => {
		for (const type of ["string", "integer", "number", "boolean", "string[]"]) {
			const raw = [entity({ properties: { f: type } })];
			expect(errors(validateSpec(raw))).toHaveLength(0);
		}
	});

	test("unknown scalar type → error", () => {
		const raw = [entity({ properties: { f: "blob" } })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("blob"))).toBe(true);
	});

	// --- Path types ---

	test("Path type is valid", () => {
		const raw = [entity({ properties: { file: "Path" } })];
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("RelativePath type is valid", () => {
		const raw = [entity({ properties: { file: "RelativePath" } })];
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	// --- Enum ---

	test("valid enum", () => {
		const raw = [entity({ properties: { dir: { enum: ["up", "down", "left", "right"] } } })];
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("enum with fewer than 2 values → error", () => {
		const raw = [entity({ properties: { dir: { enum: ["up"] } } })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("at least 2"))).toBe(true);
	});

	test("enum with 0 values → error", () => {
		const raw = [entity({ properties: { dir: { enum: [] } } })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("at least 2"))).toBe(true);
	});

	test("enum with non-string values → error", () => {
		const raw = [entity({ properties: { dir: { enum: [1, 2, 3] } } })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("strings"))).toBe(true);
	});

	// --- Invalid field values ---

	test("object without __shape or enum → error", () => {
		const raw = [entity({ properties: { weird: { foo: "bar" } } })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("__shape"))).toBe(true);
	});

	test("non-string non-object field value → error", () => {
		const raw = [entity({ properties: { bad: 42 } })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("Invalid field"))).toBe(true);
	});

	test("array field value → error", () => {
		const raw = [entity({ properties: { bad: [1, 2] } })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("Invalid field"))).toBe(true);
	});

	test("null field value → error", () => {
		const raw = [entity({ properties: { bad: null } })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("Invalid field"))).toBe(true);
	});

	test("boolean field value → error", () => {
		const raw = [entity({ properties: { bad: true } })];
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("Invalid field"))).toBe(true);
	});

	// --- Polygon edge cases ---

	test("polygon with invalid nested structure → error", () => {
		const raw = [entity({
			properties: {
				region: { __shape: "polygon", points: { garbage: true } },
			},
		})];
		expect(errors(validateSpec(raw)).length).toBeGreaterThan(0);
	});

	test("polygon items with wrong number of fields → error", () => {
		const raw = [entity({
			properties: {
				region: {
					__shape: "polygon",
					points: { type: "array", items: { x: "integer" } },
				},
			},
		})];
		expect(errors(validateSpec(raw)).length).toBeGreaterThan(0);
	});

	// --- Full example spec shape ---

	test("full multi-shape entity with all field types", () => {
		const raw = [
			{
				label: "Sprite",
				group: "sprites",
				properties: {
					path: "RelativePath",
					slice: { __shape: "rect", x: "integer", y: "integer", width: "integer", height: "integer" },
					collision: { __shape: "rect", x: "integer", y: "integer", width: "integer", height: "integer" },
					origin: { __shape: "point", x: "integer", y: "integer" },
					name: "string",
					frame: "integer",
					direction: { enum: ["up", "down", "left", "right"] },
					variant: "string",
					tags: "string[]",
				},
			},
			{
				label: "Tile",
				group: "tiles",
				properties: {
					pos: { __shape: "point", x: "integer", y: "integer" },
					walkable: "boolean",
				},
			},
		];
		const result = validateSpec(raw);
		expect(errors(result)).toHaveLength(0);
	});
});
