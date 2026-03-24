// src/mainview/src/export.test.ts
import { describe, expect, it } from "bun:test";
import { buildExportData, exportToString } from "./export";
import type { SpanSpec, EntityDef } from "./spec/types";
import type { Annotation } from "./annotation";

// --- Helpers ---

function makeSpriteEntity(extraFields: EntityDef["fields"] = []): EntityDef {
	return {
		label: "Sprite",
		group: "sprites",
		fields: [
			{
				kind: "shape",
				name: "slice",
				shapeType: "rect",
				shapeFields: [
					{ name: "x", valueType: "integer" },
					{ name: "y", valueType: "integer" },
					{ name: "width", valueType: "integer" },
					{ name: "height", valueType: "integer" },
				],
				mapping: { type: "rect", x: "x", y: "y", width: "width", height: "height" },
				warnings: [],
			},
			...extraFields,
		],
	};
}

function makeSpec(entities: EntityDef[], frontmatter: Record<string, unknown> = {}, format: "yaml" | "json" = "yaml"): SpanSpec {
	return { format, frontmatter, entities };
}

function makeAnnotation(
	entityType: string,
	shapes: Record<string, Record<string, number>>,
	propertyData: Record<string, unknown> = {},
	extra: Partial<Annotation> = {},
): Annotation {
	return {
		id: "test-id",
		entityType,
		shapes,
		propertyData,
		...extra,
	};
}

// --- Tests ---

describe("buildExportData", () => {
	it("hoists frontmatter __properties to top level of output", () => {
		const spec = makeSpec([makeSpriteEntity()], { path: "assets", version: 2 });
		const ann = makeAnnotation("Sprite", { slice: { x: 0, y: 0, width: 16, height: 16 } });

		const result = buildExportData([ann], spec, "/root");

		expect(result["path"]).toBe("assets");
		expect(result["version"]).toBe(2);
	});

	it("groups annotations by entity group key", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation("Sprite", { slice: { x: 0, y: 0, width: 16, height: 16 } });

		const result = buildExportData([ann], spec, "/root");

		expect(result["sprites"]).toBeDefined();
		expect(Array.isArray(result["sprites"])).toBe(true);
	});

	it("nests shape data under shape name", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation("Sprite", { slice: { x: 10, y: 20, width: 32, height: 32 } });

		const result = buildExportData([ann], spec, "/root");
		const sprites = result["sprites"] as Record<string, unknown>[];

		expect(sprites[0]["slice"]).toEqual({ x: 10, y: 20, width: 32, height: 32 });
	});

	it("places scalar properties as flat values in spec field order", () => {
		const entity = makeSpriteEntity([
			{ kind: "scalar", name: "name", type: "string" },
			{ kind: "scalar", name: "frame", type: "integer" },
		]);
		const spec = makeSpec([entity]);
		const ann = makeAnnotation(
			"Sprite",
			{ slice: { x: 0, y: 0, width: 16, height: 16 } },
			{ name: "link_idle", frame: 3 },
		);

		const result = buildExportData([ann], spec, "/root");
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];

		expect(sprite["name"]).toBe("link_idle");
		expect(sprite["frame"]).toBe(3);
	});

	it("preserves spec field order (slice shape first, then scalars)", () => {
		const entity = makeSpriteEntity([
			{ kind: "scalar", name: "name", type: "string" },
			{ kind: "scalar", name: "frame", type: "integer" },
		]);
		const spec = makeSpec([entity]);
		const ann = makeAnnotation(
			"Sprite",
			{ slice: { x: 0, y: 0, width: 16, height: 16 } },
			{ name: "hero", frame: 1 },
		);

		const result = buildExportData([ann], spec, "/root");
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];
		const keys = Object.keys(sprite);

		expect(keys).toEqual(["slice", "name", "frame"]);
	});

	it("handles multiple named shapes per annotation", () => {
		const entity: EntityDef = {
			label: "Sprite",
			group: "sprites",
			fields: [
				{
					kind: "shape",
					name: "slice",
					shapeType: "rect",
					shapeFields: [
						{ name: "x", valueType: "integer" },
						{ name: "y", valueType: "integer" },
						{ name: "width", valueType: "integer" },
						{ name: "height", valueType: "integer" },
					],
					mapping: { type: "rect", x: "x", y: "y", width: "width", height: "height" },
					warnings: [],
				},
				{
					kind: "shape",
					name: "collision",
					shapeType: "rect",
					shapeFields: [
						{ name: "x", valueType: "integer" },
						{ name: "y", valueType: "integer" },
						{ name: "width", valueType: "integer" },
						{ name: "height", valueType: "integer" },
					],
					mapping: { type: "rect", x: "x", y: "y", width: "width", height: "height" },
					warnings: [],
				},
				{
					kind: "shape",
					name: "origin",
					shapeType: "point",
					shapeFields: [
						{ name: "x", valueType: "integer" },
						{ name: "y", valueType: "integer" },
					],
					mapping: { type: "point", x: "x", y: "y" },
					warnings: [],
				},
			],
		};
		const spec = makeSpec([entity]);
		const ann = makeAnnotation("Sprite", {
			slice: { x: 0, y: 0, width: 16, height: 16 },
			collision: { x: 2, y: 4, width: 12, height: 12 },
			origin: { x: 8, y: 16 },
		});

		const result = buildExportData([ann], spec, "/root");
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];

		expect(sprite["slice"]).toEqual({ x: 0, y: 0, width: 16, height: 16 });
		expect(sprite["collision"]).toEqual({ x: 2, y: 4, width: 12, height: 12 });
		expect(sprite["origin"]).toEqual({ x: 8, y: 16 });
	});

	it("exports Path field as absolute path string", () => {
		const entity: EntityDef = {
			label: "Sprite",
			group: "sprites",
			fields: [
				{ kind: "path", name: "src", pathType: "Path" },
			],
		};
		const spec = makeSpec([entity]);
		const ann = makeAnnotation("Sprite", {}, { src: "/absolute/path/to/link.png" });

		const result = buildExportData([ann], spec, "/workspace");
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];

		expect(sprite["src"]).toBe("/absolute/path/to/link.png");
	});

	it("exports RelativePath field as path relative to workspace root", () => {
		const entity: EntityDef = {
			label: "Sprite",
			group: "sprites",
			fields: [
				{ kind: "path", name: "path", pathType: "RelativePath" },
			],
		};
		const spec = makeSpec([entity]);
		const ann = makeAnnotation("Sprite", {}, { path: "/workspace/assets/link.png" });

		const result = buildExportData([ann], spec, "/workspace");
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];

		expect(sprite["path"]).toBe("./assets/link.png");
	});

	it("excludes id and _stash from output", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation(
			"Sprite",
			{ slice: { x: 0, y: 0, width: 10, height: 10 } },
			{},
			{ id: "abc123", _stash: { old_prop: "value" } },
		);

		const result = buildExportData([ann], spec, "");
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];

		expect(sprite).not.toHaveProperty("id");
		expect(sprite).not.toHaveProperty("_stash");
	});

	it("omits group key when entity type has no annotations", () => {
		const tileEntity: EntityDef = {
			label: "Tile",
			group: "tiles",
			fields: [
				{
					kind: "shape",
					name: "slice",
					shapeType: "rect",
					shapeFields: [
						{ name: "x", valueType: "integer" },
						{ name: "y", valueType: "integer" },
						{ name: "width", valueType: "integer" },
						{ name: "height", valueType: "integer" },
					],
					mapping: { type: "rect", x: "x", y: "y", width: "width", height: "height" },
					warnings: [],
				},
			],
		};
		const spec = makeSpec([makeSpriteEntity(), tileEntity]);
		const ann = makeAnnotation("Sprite", { slice: { x: 0, y: 0, width: 16, height: 16 } });

		const result = buildExportData([ann], spec, "/root");

		expect(result["sprites"]).toBeDefined();
		expect(result["tiles"]).toBeUndefined();
	});

	it("skips annotations with unknown entity types", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const validAnn = makeAnnotation("Sprite", { slice: { x: 0, y: 0, width: 16, height: 16 } });
		const orphanAnn = makeAnnotation("Ghost", {});

		const result = buildExportData([validAnn, orphanAnn], spec, "/root");

		expect((result["sprites"] as unknown[]).length).toBe(1);
		expect(result["Ghost"]).toBeUndefined();
	});

	it("returns empty object with only frontmatter for empty annotations list", () => {
		const spec = makeSpec([makeSpriteEntity()], { path: "assets" });

		const result = buildExportData([], spec, "/root");

		expect(result["path"]).toBe("assets");
		expect(result["sprites"]).toBeUndefined();
	});

	it("groups multiple entity types by their respective group keys", () => {
		const spriteEntity = makeSpriteEntity();
		const tileEntity: EntityDef = {
			label: "Tile",
			group: "tiles",
			fields: [
				{
					kind: "shape",
					name: "slice",
					shapeType: "rect",
					shapeFields: [
						{ name: "x", valueType: "integer" },
						{ name: "y", valueType: "integer" },
						{ name: "width", valueType: "integer" },
						{ name: "height", valueType: "integer" },
					],
					mapping: { type: "rect", x: "x", y: "y", width: "width", height: "height" },
					warnings: [],
				},
			],
		};
		const spec = makeSpec([spriteEntity, tileEntity]);
		const spriteAnn = makeAnnotation("Sprite", { slice: { x: 0, y: 0, width: 16, height: 16 } });
		const tileAnn = makeAnnotation("Tile", { slice: { x: 32, y: 0, width: 16, height: 16 } });

		const result = buildExportData([spriteAnn, tileAnn], spec, "/root");

		expect(Array.isArray(result["sprites"])).toBe(true);
		expect(Array.isArray(result["tiles"])).toBe(true);
		expect((result["sprites"] as unknown[]).length).toBe(1);
		expect((result["tiles"] as unknown[]).length).toBe(1);
	});

	it("handles multiple annotations of the same entity type", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann1 = makeAnnotation("Sprite", { slice: { x: 0, y: 0, width: 16, height: 16 } });
		const ann2 = makeAnnotation("Sprite", { slice: { x: 16, y: 0, width: 16, height: 16 } });

		const result = buildExportData([ann1, ann2], spec, "/root");
		const sprites = result["sprites"] as Record<string, unknown>[];

		expect(sprites).toHaveLength(2);
		expect((sprites[0]["slice"] as Record<string, number>).x).toBe(0);
		expect((sprites[1]["slice"] as Record<string, number>).x).toBe(16);
	});

	it("handles annotations from multiple sheets (all flattened into group)", () => {
		// The new export is flat — all annotations across sheets are in one list per group
		const spec = makeSpec([makeSpriteEntity()]);
		const ann1 = makeAnnotation("Sprite", { slice: { x: 0, y: 0, width: 16, height: 16 } });
		const ann2 = makeAnnotation("Sprite", { slice: { x: 0, y: 16, width: 16, height: 16 } });

		// Pass annotations from both sheets combined
		const result = buildExportData([ann1, ann2], spec, "/root");
		const sprites = result["sprites"] as Record<string, unknown>[];

		expect(sprites).toHaveLength(2);
	});

	it("serializes string[] scalar properties as arrays", () => {
		const entity = makeSpriteEntity([
			{ kind: "scalar", name: "tags", type: "string[]" },
		]);
		const spec = makeSpec([entity]);
		const ann = makeAnnotation(
			"Sprite",
			{ slice: { x: 0, y: 0, width: 16, height: 16 } },
			{ tags: ["hero", "player"] },
		);

		const result = buildExportData([ann], spec, "/root");
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];

		expect(sprite["tags"]).toEqual(["hero", "player"]);
	});

	it("outputs zero for missing shape field values", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation("Sprite", { slice: {} }); // no values

		const result = buildExportData([ann], spec, "/root");
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];

		expect(sprite["slice"]).toEqual({ x: 0, y: 0, width: 0, height: 0 });
	});
});

describe("exportToString", () => {
	it("produces YAML output when spec format is yaml", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation("Sprite", { slice: { x: 1, y: 2, width: 3, height: 4 } });

		const output = exportToString([ann], spec, "/root");

		expect(() => JSON.parse(output)).toThrow();
		expect(output).toContain("sprites:");
		expect(output).toContain("slice:");
	});

	it("produces JSON output when spec format is json", () => {
		const spec = makeSpec([makeSpriteEntity()], {}, "json");
		const ann = makeAnnotation("Sprite", { slice: { x: 5, y: 6, width: 7, height: 8 } });

		const output = exportToString([ann], spec, "/root");
		const parsed = JSON.parse(output);

		expect(Array.isArray(parsed["sprites"])).toBe(true);
		const sprite = parsed["sprites"][0];
		expect(sprite["slice"]).toEqual({ x: 5, y: 6, width: 7, height: 8 });
	});

	it("JSON output ends with a newline", () => {
		const spec = makeSpec([makeSpriteEntity()], {}, "json");
		const ann = makeAnnotation("Sprite", { slice: { x: 0, y: 0, width: 16, height: 16 } });

		const output = exportToString([ann], spec, "/root");
		expect(output.endsWith("\n")).toBe(true);
	});

	it("JSON output is properly indented", () => {
		const spec = makeSpec([makeSpriteEntity()], {}, "json");
		const ann = makeAnnotation("Sprite", { slice: { x: 0, y: 0, width: 16, height: 16 } });

		const output = exportToString([ann], spec, "/root");
		expect(output).toContain("  ");
	});

	it("YAML output includes frontmatter values at top level", () => {
		const spec = makeSpec([makeSpriteEntity()], { path: "assets", version: 2 });
		const ann = makeAnnotation("Sprite", { slice: { x: 0, y: 0, width: 16, height: 16 } });

		const output = exportToString([ann], spec, "/root");

		expect(output).toContain("path:");
		expect(output).toContain("version:");
	});

	it("JSON output includes frontmatter values at top level", () => {
		const spec = makeSpec([makeSpriteEntity()], { path: "assets", version: 2 }, "json");
		const ann = makeAnnotation("Sprite", { slice: { x: 0, y: 0, width: 16, height: 16 } });

		const output = exportToString([ann], spec, "/root");
		const parsed = JSON.parse(output);

		expect(parsed["path"]).toBe("assets");
		expect(parsed["version"]).toBe(2);
	});

	it("produces empty object with frontmatter for empty annotations in JSON", () => {
		const spec = makeSpec([makeSpriteEntity()], { path: "assets" }, "json");

		const output = exportToString([], spec, "/root");
		const parsed = JSON.parse(output);

		expect(parsed["path"]).toBe("assets");
		expect(parsed["sprites"]).toBeUndefined();
	});

	it("RelativePath becomes relative in YAML output", () => {
		const entity: EntityDef = {
			label: "Sprite",
			group: "sprites",
			fields: [
				{ kind: "path", name: "path", pathType: "RelativePath" },
			],
		};
		const spec = makeSpec([entity]);
		const ann = makeAnnotation("Sprite", {}, { path: "/workspace/assets/link.png" });

		const output = exportToString([ann], spec, "/workspace");

		expect(output).toContain("./assets/link.png");
	});
});
