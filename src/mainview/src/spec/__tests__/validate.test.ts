// src/mainview/src/spec/__tests__/validate.test.ts
import { describe, test, expect } from "bun:test";
import { validateSpec } from "../validate";

function errors(result: ReturnType<typeof validateSpec>) {
	return result.filter((e) => e.severity === "error");
}
function warnings(result: ReturnType<typeof validateSpec>) {
	return result.filter((e) => e.severity === "warning");
}

describe("validateSpec", () => {
	test("valid minimal spec", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "rect", x: "integer", y: "integer", width: "integer", height: "integer" },
					properties: { name: "string" },
				},
			},
		};
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("missing entities", () => {
		expect(errors(validateSpec({}))).toHaveLength(1);
		expect(errors(validateSpec({}))[0].message).toContain("entities");
	});

	test("empty entities", () => {
		expect(errors(validateSpec({ entities: {} }))).toHaveLength(1);
	});

	test("invalid entity name with spaces", () => {
		const raw = {
			entities: {
				"My Sprite": {
					shape: { type: "rect", x: "integer", y: "integer", width: "integer", height: "integer" },
				},
			},
		};
		expect(errors(validateSpec(raw)).length).toBeGreaterThan(0);
	});

	test("invalid shape type", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "hexagon", x: "integer", y: "integer" },
				},
			},
		};
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("hexagon"))).toBe(true);
	});

	test("wrong number of shape fields", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "rect", x: "integer", y: "integer" },
				},
			},
		};
		expect(errors(validateSpec(raw)).length).toBeGreaterThan(0);
	});

	test("invalid shape field type", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", x: "string", y: "integer" },
				},
			},
		};
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("string"))).toBe(true);
	});

	test("invalid property type", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", x: "integer", y: "integer" },
					properties: { name: "blob" },
				},
			},
		};
		expect(errors(validateSpec(raw)).length).toBeGreaterThan(0);
	});

	test("duplicate property name", () => {
		// JS objects can't have duplicate keys, but we test shape/prop collision
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", x: "integer", y: "integer" },
					properties: { x: "string" },
				},
			},
		};
		expect(errors(validateSpec(raw)).some((e) => e.message.includes("collision"))).toBe(true);
	});

	test("enum with fewer than 2 values", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", x: "integer", y: "integer" },
					properties: { dir: { enum: ["up"] } },
				},
			},
		};
		expect(errors(validateSpec(raw)).length).toBeGreaterThan(0);
	});

	test("empty properties section is valid", () => {
		const raw = {
			entities: {
				HitBox: {
					shape: { type: "rect", x: "integer", y: "integer", width: "integer", height: "integer" },
				},
			},
		};
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("unrecognized shape field name produces warning", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", foo: "integer", bar: "integer" },
				},
			},
		};
		const result = validateSpec(raw);
		expect(errors(result)).toHaveLength(0); // inference failure is warning
		expect(warnings(result).length).toBeGreaterThan(0);
	});

	test("enum with non-string values", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", x: "integer", y: "integer" },
					properties: { dir: { enum: [1, 2, 3] } },
				},
			},
		};
		expect(errors(validateSpec(raw)).length).toBeGreaterThan(0);
	});

	test("polygon with invalid nested structure", () => {
		const raw = {
			entities: {
				Region: {
					shape: { type: "polygon", points: { garbage: true } },
				},
			},
		};
		expect(errors(validateSpec(raw)).length).toBeGreaterThan(0);
	});

	test("number shape field type is valid", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", x: "number", y: "number" },
					properties: { name: "string" },
				},
			},
		};
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});

	test("string[] property type is valid", () => {
		const raw = {
			entities: {
				Sprite: {
					shape: { type: "point", x: "integer", y: "integer" },
					properties: { tags: "string[]" },
				},
			},
		};
		expect(errors(validateSpec(raw))).toHaveLength(0);
	});
});
