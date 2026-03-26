// src/mainview/src/export.test.ts
import { describe, expect, it } from "bun:test";
import { buildExportData, exportToString, type ExportEntry } from "./export";
import type { SpanSpec, EntityDef } from "./spec/types";
import type { Annotation } from "./annotation";

function makeSpriteEntity(extraProperties: EntityDef["properties"] = []): EntityDef {
	return {
		label: "Sprite",
		group: "sprites",
		primaryShape: { kind: "rect" },
		hasPath: true,
		properties: [
			{ kind: "scalar", name: "name", type: "string" },
			...extraProperties,
		],
	};
}

function makeSpec(entities: EntityDef[], format: "yaml" | "json" = "yaml"): SpanSpec {
	return { format, entities };
}

function makeAnnotation(
	entityType: string,
	aabb: Annotation["aabb"],
	point: Annotation["point"] = null,
	properties: Record<string, unknown> = {},
	extra: Partial<Annotation> = {},
): Annotation {
	return { id: "test-id", entityType, aabb, point, properties, ...extra };
}

function entry(ann: Annotation, sheetFile = "sheet.png"): ExportEntry {
	return { annotation: ann, sheetFile };
}

function entries(...anns: Annotation[]): ExportEntry[] {
	return anns.map((a) => entry(a));
}

describe("buildExportData", () => {
	it("groups annotations by entity group key", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation("Sprite", { x: 0, y: 0, w: 16, h: 16 }, null, { name: "hero" });
		const result = buildExportData(entries(ann), spec);
		expect(result["sprites"]).toBeDefined();
		expect(Array.isArray(result["sprites"])).toBe(true);
	});

	it("exports aabb as top-level field with default field names", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation("Sprite", { x: 10, y: 20, w: 32, h: 32 }, null, { name: "hero" });
		const result = buildExportData(entries(ann), spec);
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];
		expect(sprite["aabb"]).toEqual({ x: 10, y: 20, w: 32, h: 32 });
	});

	it("exports point as top-level field", () => {
		const waypointEntity: EntityDef = {
			label: "Waypoint", group: "waypoints",
			primaryShape: { kind: "point" }, hasPath: false,
			properties: [{ kind: "scalar", name: "name", type: "string" }],
		};
		const spec = makeSpec([waypointEntity]);
		const ann = makeAnnotation("Waypoint", null, { x: 5, y: 10 }, { name: "start" });
		const result = buildExportData(entries(ann), spec);
		const wp = (result["waypoints"] as Record<string, unknown>[])[0];
		expect(wp["point"]).toEqual({ x: 5, y: 10 });
	});

	it("exports path field from sheet filename when entity hasPath", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation("Sprite", { x: 0, y: 0, w: 16, h: 16 }, null, { name: "hero" });
		const result = buildExportData([entry(ann, "spritesheet.png")], spec);
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];
		expect(sprite["path"]).toBe("spritesheet.png");
	});

	it("does not export path when entity has no hasPath", () => {
		const entity: EntityDef = {
			label: "Waypoint", group: "waypoints",
			primaryShape: { kind: "point" }, hasPath: false, properties: [],
		};
		const spec = makeSpec([entity]);
		const ann = makeAnnotation("Waypoint", null, { x: 5, y: 10 });
		const result = buildExportData(entries(ann), spec);
		const wp = (result["waypoints"] as Record<string, unknown>[])[0];
		expect(wp["path"]).toBeUndefined();
	});

	it("exports scalar properties in spec order", () => {
		const entity = makeSpriteEntity([
			{ kind: "scalar", name: "frame", type: "integer" },
		]);
		const spec = makeSpec([entity]);
		const ann = makeAnnotation("Sprite", { x: 0, y: 0, w: 16, h: 16 }, null, { name: "link_idle", frame: 3 });
		const result = buildExportData(entries(ann), spec);
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];
		expect(sprite["name"]).toBe("link_idle");
		expect(sprite["frame"]).toBe(3);
	});

	it("exports shape properties as objects (single) or arrays", () => {
		const entity: EntityDef = {
			label: "Sprite", group: "sprites",
			primaryShape: { kind: "rect" }, hasPath: false,
			properties: [
				{ kind: "shape", name: "origin", shapeType: "point", array: false },
				{ kind: "shape", name: "collision", shapeType: "rect", array: true },
			],
		};
		const spec = makeSpec([entity]);
		const ann = makeAnnotation("Sprite", { x: 0, y: 0, w: 32, h: 32 }, null, {
			origin: { x: 16, y: 16 },
			collision: [{ x: 2, y: 4, w: 28, h: 24 }, { x: 0, y: 0, w: 32, h: 32 }],
		});
		const result = buildExportData(entries(ann), spec);
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];
		expect(sprite["origin"]).toEqual({ x: 16, y: 16 });
		expect(sprite["collision"]).toEqual([
			{ x: 2, y: 4, w: 28, h: 24 }, { x: 0, y: 0, w: 32, h: 32 },
		]);
	});

	it("applies workspace shape field overrides on export", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation("Sprite", { x: 10, y: 20, w: 32, h: 32 }, null, { name: "hero" });
		const shapeFields = { rect: ["left", "top", "width", "height"] as [string, string, string, string] };
		const result = buildExportData(entries(ann), spec, shapeFields);
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];
		expect(sprite["aabb"]).toEqual({ left: 10, top: 20, width: 32, height: 32 });
	});

	it("applies workspace point field overrides on export", () => {
		const waypointEntity: EntityDef = {
			label: "Waypoint", group: "waypoints",
			primaryShape: { kind: "point" }, hasPath: false, properties: [],
		};
		const spec = makeSpec([waypointEntity]);
		const ann = makeAnnotation("Waypoint", null, { x: 5, y: 10 });
		const shapeFields = { point: ["px", "py"] as [string, string] };
		const result = buildExportData(entries(ann), spec, shapeFields);
		const wp = (result["waypoints"] as Record<string, unknown>[])[0];
		expect(wp["point"]).toEqual({ px: 5, py: 10 });
	});

	it("excludes id and _stash from output", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation("Sprite", { x: 0, y: 0, w: 16, h: 16 }, null, { name: "hero" },
			{ id: "abc123", _stash: { old_prop: "value" } });
		const result = buildExportData(entries(ann), spec);
		const sprite = (result["sprites"] as Record<string, unknown>[])[0];
		expect(sprite).not.toHaveProperty("id");
		expect(sprite).not.toHaveProperty("_stash");
	});

	it("omits group key when entity type has no annotations", () => {
		const tileEntity: EntityDef = {
			label: "Tile", group: "tiles",
			primaryShape: { kind: "rect" }, hasPath: false, properties: [],
		};
		const spec = makeSpec([makeSpriteEntity(), tileEntity]);
		const ann = makeAnnotation("Sprite", { x: 0, y: 0, w: 16, h: 16 }, null, { name: "hero" });
		const result = buildExportData(entries(ann), spec);
		expect(result["sprites"]).toBeDefined();
		expect(result["tiles"]).toBeUndefined();
	});

	it("skips annotations with unknown entity types", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const validAnn = makeAnnotation("Sprite", { x: 0, y: 0, w: 16, h: 16 }, null, { name: "hero" });
		const orphanAnn = makeAnnotation("Ghost", null, null, {});
		const result = buildExportData(entries(validAnn, orphanAnn), spec);
		expect((result["sprites"] as unknown[]).length).toBe(1);
	});

	it("returns empty object for empty annotations", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const result = buildExportData([], spec);
		expect(result["sprites"]).toBeUndefined();
	});
});

describe("exportToString", () => {
	it("produces YAML output when spec format is yaml", () => {
		const spec = makeSpec([makeSpriteEntity()]);
		const ann = makeAnnotation("Sprite", { x: 1, y: 2, w: 3, h: 4 }, null, { name: "hero" });
		const output = exportToString(entries(ann), spec);
		expect(() => JSON.parse(output)).toThrow();
		expect(output).toContain("sprites:");
	});

	it("produces JSON output when spec format is json", () => {
		const spec = makeSpec([makeSpriteEntity()], "json");
		const ann = makeAnnotation("Sprite", { x: 5, y: 6, w: 7, h: 8 }, null, { name: "hero" });
		const output = exportToString(entries(ann), spec);
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed["sprites"])).toBe(true);
	});

	it("JSON output ends with a newline", () => {
		const spec = makeSpec([makeSpriteEntity()], "json");
		const ann = makeAnnotation("Sprite", { x: 0, y: 0, w: 16, h: 16 }, null, { name: "" });
		const output = exportToString(entries(ann), spec);
		expect(output.endsWith("\n")).toBe(true);
	});
});
