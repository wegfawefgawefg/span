// src/mainview/src/export.test.ts
import { describe, expect, it } from "bun:test";
import { buildExportData, exportToString } from "./export";
import type { SpanSpec } from "./spec/types";
import type { Annotation } from "./annotation";

// --- Helpers ---

function makeRectSpec(extraProps: SpanSpec["entities"][string]["properties"] = []): SpanSpec {
	return {
		format: "yaml",
		entities: {
			Sprite: {
				shape: {
					type: "rect",
					fields: [
						{ name: "x", valueType: "integer" },
						{ name: "y", valueType: "integer" },
						{ name: "width", valueType: "integer" },
						{ name: "height", valueType: "integer" },
					],
					mapping: { type: "rect", x: "x", y: "y", width: "width", height: "height" },
					warnings: [],
				},
				properties: extraProps,
			},
		},
	};
}

function makeAnnotation(
	entityType: string,
	shapeData: Record<string, number>,
	propertyData: Record<string, unknown> = {},
	extra: Partial<Annotation> = {},
): Annotation {
	return {
		id: "test-id",
		entityType,
		shapeData,
		propertyData,
		...extra,
	};
}

// --- Tests ---

describe("buildExportData", () => {
	it("exports a rect entity with flattened shape and property fields", () => {
		const spec = makeRectSpec([{ name: "label", type: "string" }]);
		const ann = makeAnnotation("Sprite", { x: 10, y: 20, width: 50, height: 30 }, { label: "hero" });
		const sheets = [{ path: "images/sheet1.png", annotations: [ann] }];

		const result = buildExportData(sheets, spec, "/root");

		expect(result.sheets).toHaveLength(1);
		const sheet = result.sheets[0];
		expect(sheet.file).toBe("images/sheet1.png");
		const sprites = sheet["Sprite"] as Record<string, unknown>[];
		expect(sprites).toHaveLength(1);
		expect(sprites[0]).toEqual({ x: 10, y: 20, width: 50, height: 30, label: "hero" });
	});

	it("does not include id or _stash in output", () => {
		const spec = makeRectSpec();
		const ann = makeAnnotation(
			"Sprite",
			{ x: 0, y: 0, width: 10, height: 10 },
			{},
			{ id: "abc123", _stash: { old_prop: "value" } },
		);
		const sheets = [{ path: "a.png", annotations: [ann] }];

		const result = buildExportData(sheets, spec, "");

		const sprites = result.sheets[0]["Sprite"] as Record<string, unknown>[];
		expect(sprites[0]).not.toHaveProperty("id");
		expect(sprites[0]).not.toHaveProperty("_stash");
	});

	it("excludes annotations with unknown entity types", () => {
		const spec = makeRectSpec();
		const validAnn = makeAnnotation("Sprite", { x: 0, y: 0, width: 10, height: 10 });
		const orphanAnn = makeAnnotation("Ghost", { x: 5, y: 5 });
		const sheets = [{ path: "a.png", annotations: [validAnn, orphanAnn] }];

		const result = buildExportData(sheets, spec, "");

		expect(result.sheets).toHaveLength(1);
		const sheet = result.sheets[0];
		expect(sheet["Sprite"]).toBeDefined();
		expect(sheet["Ghost"]).toBeUndefined();
	});

	it("excludes sheets with no valid annotations", () => {
		const spec = makeRectSpec();
		const orphanAnn = makeAnnotation("Unknown", { x: 0, y: 0 });
		const sheets = [
			{ path: "empty.png", annotations: [orphanAnn] },
			{ path: "valid.png", annotations: [makeAnnotation("Sprite", { x: 0, y: 0, width: 1, height: 1 })] },
		];

		const result = buildExportData(sheets, spec, "");

		expect(result.sheets).toHaveLength(1);
		expect(result.sheets[0].file).toBe("valid.png");
	});

	it("groups mixed entity types per sheet correctly", () => {
		const spec: SpanSpec = {
			format: "yaml",
			entities: {
				Sprite: {
					shape: {
						type: "rect",
						fields: [
							{ name: "x", valueType: "integer" },
							{ name: "y", valueType: "integer" },
							{ name: "width", valueType: "integer" },
							{ name: "height", valueType: "integer" },
						],
						mapping: { type: "rect", x: "x", y: "y", width: "width", height: "height" },
						warnings: [],
					},
					properties: [],
				},
				Marker: {
					shape: {
						type: "point",
						fields: [
							{ name: "px", valueType: "integer" },
							{ name: "py", valueType: "integer" },
						],
						mapping: { type: "point", x: "px", y: "py" },
						warnings: [],
					},
					properties: [],
				},
			},
		};

		const spriteAnn = makeAnnotation("Sprite", { x: 10, y: 10, width: 20, height: 20 });
		const markerAnn = makeAnnotation("Marker", { px: 5, py: 5 });
		const sheets = [{ path: "scene.png", annotations: [spriteAnn, markerAnn] }];

		const result = buildExportData(sheets, spec, "");

		expect(result.sheets).toHaveLength(1);
		const sheet = result.sheets[0];
		const sprites = sheet["Sprite"] as Record<string, unknown>[];
		const markers = sheet["Marker"] as Record<string, unknown>[];
		expect(sprites).toHaveLength(1);
		expect(markers).toHaveLength(1);
		expect(sprites[0]).toEqual({ x: 10, y: 10, width: 20, height: 20 });
		expect(markers[0]).toEqual({ px: 5, py: 5 });
	});

	it("produces shape fields first, then properties, matching spec order", () => {
		const spec = makeRectSpec([
			{ name: "label", type: "string" },
			{ name: "priority", type: "integer" },
		]);
		const ann = makeAnnotation(
			"Sprite",
			{ x: 1, y: 2, width: 3, height: 4 },
			{ label: "hero", priority: 1 },
		);
		const sheets = [{ path: "a.png", annotations: [ann] }];

		const result = buildExportData(sheets, spec, "");
		const sprite = (result.sheets[0]["Sprite"] as Record<string, unknown>[])[0];
		const keys = Object.keys(sprite);

		// Shape fields first (x, y, width, height), then properties (label, priority)
		expect(keys).toEqual(["x", "y", "width", "height", "label", "priority"]);
	});

	it("serializes string[] properties as arrays", () => {
		const spec = makeRectSpec([{ name: "tags", type: "string[]" }]);
		const ann = makeAnnotation(
			"Sprite",
			{ x: 0, y: 0, width: 10, height: 10 },
			{ tags: ["hero", "player"] },
		);
		const sheets = [{ path: "a.png", annotations: [ann] }];

		const result = buildExportData(sheets, spec, "");
		const sprite = (result.sheets[0]["Sprite"] as Record<string, unknown>[])[0];

		expect(sprite["tags"]).toEqual(["hero", "player"]);
	});

	it("returns empty sheets array for empty workspace", () => {
		const spec = makeRectSpec();
		const result = buildExportData([], spec, "");
		expect(result.sheets).toEqual([]);
	});

	it("handles multiple annotations of the same entity type on a sheet", () => {
		const spec = makeRectSpec();
		const ann1 = makeAnnotation("Sprite", { x: 0, y: 0, width: 10, height: 10 });
		const ann2 = makeAnnotation("Sprite", { x: 20, y: 20, width: 5, height: 5 });
		const sheets = [{ path: "multi.png", annotations: [ann1, ann2] }];

		const result = buildExportData(sheets, spec, "");
		const sprites = result.sheets[0]["Sprite"] as Record<string, unknown>[];
		expect(sprites).toHaveLength(2);
		expect(sprites[0]).toEqual({ x: 0, y: 0, width: 10, height: 10 });
		expect(sprites[1]).toEqual({ x: 20, y: 20, width: 5, height: 5 });
	});

	it("handles multiple sheets, each with their own annotations", () => {
		const spec = makeRectSpec();
		const sheets = [
			{ path: "a.png", annotations: [makeAnnotation("Sprite", { x: 1, y: 1, width: 2, height: 2 })] },
			{ path: "b.png", annotations: [makeAnnotation("Sprite", { x: 3, y: 3, width: 4, height: 4 })] },
		];

		const result = buildExportData(sheets, spec, "");
		expect(result.sheets).toHaveLength(2);
		expect(result.sheets[0].file).toBe("a.png");
		expect(result.sheets[1].file).toBe("b.png");
	});
});

describe("exportToString", () => {
	it("produces JSON output when spec format is json", () => {
		const spec = makeRectSpec();
		spec.format = "json";
		const ann = makeAnnotation("Sprite", { x: 5, y: 6, width: 7, height: 8 });
		const sheets = [{ path: "img.png", annotations: [ann] }];

		const output = exportToString(sheets, spec, "");
		const parsed = JSON.parse(output);

		expect(parsed.sheets).toHaveLength(1);
		expect(parsed.sheets[0].file).toBe("img.png");
		const sprite = parsed.sheets[0]["Sprite"][0];
		expect(sprite).toEqual({ x: 5, y: 6, width: 7, height: 8 });
	});

	it("produces YAML output when spec format is yaml", () => {
		const spec = makeRectSpec();
		const ann = makeAnnotation("Sprite", { x: 1, y: 2, width: 3, height: 4 });
		const sheets = [{ path: "img.png", annotations: [ann] }];

		const output = exportToString(sheets, spec, "");

		// Should not be parseable as JSON (it's YAML)
		expect(() => JSON.parse(output)).toThrow();
		// Should contain YAML-formatted data
		expect(output).toContain("sheets:");
		expect(output).toContain("Sprite:");
	});

	it("JSON output ends with a newline", () => {
		const spec = makeRectSpec();
		spec.format = "json";
		const sheets = [{ path: "x.png", annotations: [makeAnnotation("Sprite", { x: 0, y: 0, width: 1, height: 1 })] }];

		const output = exportToString(sheets, spec, "");
		expect(output.endsWith("\n")).toBe(true);
	});

	it("JSON output is properly indented", () => {
		const spec = makeRectSpec();
		spec.format = "json";
		const sheets = [{ path: "x.png", annotations: [makeAnnotation("Sprite", { x: 0, y: 0, width: 1, height: 1 })] }];

		const output = exportToString(sheets, spec, "");
		// Verify it's formatted JSON (has indentation)
		expect(output).toContain("  ");
	});

	it("exports empty workspace as empty sheets array in JSON", () => {
		const spec = makeRectSpec();
		spec.format = "json";

		const output = exportToString([], spec, "");
		const parsed = JSON.parse(output);
		expect(parsed.sheets).toEqual([]);
	});

	it("exports empty workspace as empty sheets array in YAML", () => {
		const spec = makeRectSpec();

		const output = exportToString([], spec, "");
		expect(output).toContain("sheets:");
	});
});
