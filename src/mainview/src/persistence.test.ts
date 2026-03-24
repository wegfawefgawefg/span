import { describe, it, expect } from "bun:test";
import {
	serializeWorkspace,
	deserializeWorkspace,
	type WorkspaceSheet,
	type SpanFile,
} from "./persistence";
import type { Annotation } from "./annotation";

// --- Helpers ---

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
	return {
		id: "ann-1",
		entityType: "Sprite",
		shapeData: { x: 10, y: 20, width: 32, height: 32 },
		propertyData: { label: "hero" },
		...overrides,
	};
}

function makeSheet(
	path: string,
	annotations: Annotation[] = [],
): WorkspaceSheet {
	return { path, annotations };
}

// --- Tests ---

describe("serializeWorkspace", () => {
	it("produces correct JSON structure", () => {
		const ann = makeAnnotation();
		const sheets = [makeSheet("images/hero.png", [ann])];
		const json = serializeWorkspace(sheets, "/project/spec.yaml", "/project");
		const parsed = JSON.parse(json);

		expect(parsed.version).toBe(1);
		expect(parsed.spec).toBe("/project/spec.yaml");
		expect(parsed.root).toBe("/project");
		expect(parsed.sheets).toHaveLength(1);
		expect(parsed.sheets[0].path).toBe("images/hero.png");
		expect(parsed.sheets[0].annotations).toHaveLength(1);
		expect(parsed.sheets[0].annotations[0].id).toBe("ann-1");
		expect(parsed.sheets[0].annotations[0].entityType).toBe("Sprite");
		expect(parsed.sheets[0].annotations[0].shapeData).toEqual({
			x: 10,
			y: 20,
			width: 32,
			height: 32,
		});
		expect(parsed.sheets[0].annotations[0].propertyData).toEqual({
			label: "hero",
		});
	});

	it("ends with a newline", () => {
		const json = serializeWorkspace([], "", "");
		expect(json.endsWith("\n")).toBe(true);
	});

	it("empty workspace serializes to correct structure", () => {
		const json = serializeWorkspace([], "", "");
		const parsed = JSON.parse(json);
		expect(parsed).toEqual({ version: 1, spec: "", root: "", sheets: [] });
	});

	it("makes spec path relative to .span file directory", () => {
		const json = serializeWorkspace(
			[],
			"/home/user/project/spec.yaml",
			"/home/user/project",
			"/home/user/project",
		);
		const parsed = JSON.parse(json);
		expect(parsed.spec).toBe("spec.yaml");
	});

	it("makes spec path relative when dir has trailing slash", () => {
		const json = serializeWorkspace(
			[],
			"/home/user/project/spec.yaml",
			"/home/user/project",
			"/home/user/project/",
		);
		const parsed = JSON.parse(json);
		expect(parsed.spec).toBe("spec.yaml");
	});

	it("keeps spec path absolute when not under .span file dir", () => {
		const json = serializeWorkspace(
			[],
			"/other/location/spec.yaml",
			"/project",
			"/home/user/project",
		);
		const parsed = JSON.parse(json);
		expect(parsed.spec).toBe("/other/location/spec.yaml");
	});

	it("keeps spec path as-is when no spanFileDir provided", () => {
		const json = serializeWorkspace(
			[],
			"/some/absolute/spec.yaml",
			"/project",
		);
		const parsed = JSON.parse(json);
		expect(parsed.spec).toBe("/some/absolute/spec.yaml");
	});

	it("preserves _stash fields in annotations", () => {
		const ann = makeAnnotation({ _stash: { oldProp: "preserved" } });
		const sheets = [makeSheet("a.png", [ann])];
		const json = serializeWorkspace(sheets, "", "");
		const parsed = JSON.parse(json);
		expect(parsed.sheets[0].annotations[0]._stash).toEqual({
			oldProp: "preserved",
		});
	});

	it("omits _stash when it is empty", () => {
		const ann = makeAnnotation({ _stash: {} });
		const sheets = [makeSheet("a.png", [ann])];
		const json = serializeWorkspace(sheets, "", "");
		const parsed = JSON.parse(json);
		expect(parsed.sheets[0].annotations[0]._stash).toBeUndefined();
	});

	it("omits _stash when not present", () => {
		const ann = makeAnnotation();
		const sheets = [makeSheet("a.png", [ann])];
		const json = serializeWorkspace(sheets, "", "");
		const parsed = JSON.parse(json);
		expect(parsed.sheets[0].annotations[0]._stash).toBeUndefined();
	});

	it("serializes multiple sheets", () => {
		const sheets = [
			makeSheet("a.png", [makeAnnotation({ id: "a1" })]),
			makeSheet("b.png", [makeAnnotation({ id: "b1" }), makeAnnotation({ id: "b2" })]),
		];
		const json = serializeWorkspace(sheets, "", "");
		const parsed = JSON.parse(json);
		expect(parsed.sheets).toHaveLength(2);
		expect(parsed.sheets[1].annotations).toHaveLength(2);
	});
});

describe("deserializeWorkspace", () => {
	it("correctly parses JSON back to SpanFile structure", () => {
		const raw = JSON.stringify({
			version: 1,
			spec: "spec.yaml",
			root: "/project",
			sheets: [
				{
					path: "images/hero.png",
					annotations: [
						{
							id: "ann-1",
							entityType: "Sprite",
							shapeData: { x: 10, y: 20, width: 32, height: 32 },
							propertyData: { label: "hero" },
						},
					],
				},
			],
		});

		const result = deserializeWorkspace(raw);

		expect(result.version).toBe(1);
		expect(result.spec).toBe("spec.yaml");
		expect(result.root).toBe("/project");
		expect(result.sheets).toHaveLength(1);
		expect(result.sheets[0].path).toBe("images/hero.png");
		expect(result.sheets[0].annotations[0].id).toBe("ann-1");
		expect(result.sheets[0].annotations[0].shapeData).toEqual({
			x: 10,
			y: 20,
			width: 32,
			height: 32,
		});
	});

	it("throws when version is missing", () => {
		const raw = JSON.stringify({ spec: "", root: "", sheets: [] });
		expect(() => deserializeWorkspace(raw)).toThrow(
			"Invalid .span file: missing version",
		);
	});

	it("throws when version > 1", () => {
		const raw = JSON.stringify({ version: 2, spec: "", root: "", sheets: [] });
		expect(() => deserializeWorkspace(raw)).toThrow(
			"Unsupported .span file version: 2",
		);
	});

	it("applies defaults for missing fields", () => {
		const raw = JSON.stringify({ version: 1 });
		const result = deserializeWorkspace(raw);
		expect(result.spec).toBe("");
		expect(result.root).toBe("");
		expect(result.sheets).toEqual([]);
	});

	it("applies defaults for missing annotation fields", () => {
		const raw = JSON.stringify({
			version: 1,
			spec: "",
			root: "",
			sheets: [{ annotations: [{}] }],
		});
		const result = deserializeWorkspace(raw);
		const ann = result.sheets[0].annotations[0];
		expect(ann.id).toBe("");
		expect(ann.entityType).toBe("");
		expect(ann.shapeData).toEqual({});
		expect(ann.propertyData).toEqual({});
	});

	it("applies defaults for missing sheet path", () => {
		const raw = JSON.stringify({
			version: 1,
			spec: "",
			root: "",
			sheets: [{ annotations: [] }],
		});
		const result = deserializeWorkspace(raw);
		expect(result.sheets[0].path).toBe("");
	});

	it("preserves _stash through deserialization", () => {
		const raw = JSON.stringify({
			version: 1,
			spec: "",
			root: "",
			sheets: [
				{
					path: "a.png",
					annotations: [
						{
							id: "x",
							entityType: "T",
							shapeData: {},
							propertyData: {},
							_stash: { legacy: 42 },
						},
					],
				},
			],
		});
		const result = deserializeWorkspace(raw);
		expect(result.sheets[0].annotations[0]._stash).toEqual({ legacy: 42 });
	});

	it("omits _stash key when not in source", () => {
		const raw = JSON.stringify({
			version: 1,
			spec: "",
			root: "",
			sheets: [
				{
					path: "a.png",
					annotations: [
						{
							id: "x",
							entityType: "T",
							shapeData: {},
							propertyData: {},
						},
					],
				},
			],
		});
		const result = deserializeWorkspace(raw);
		expect(result.sheets[0].annotations[0]._stash).toBeUndefined();
	});
});

describe("round-trip", () => {
	it("serialize → deserialize → data matches", () => {
		const ann = makeAnnotation({
			shapeData: { x: 5, y: 15, width: 64, height: 48 },
			propertyData: { label: "enemy", count: 3 },
		});
		const sheets = [makeSheet("levels/stage1.png", [ann])];
		const json = serializeWorkspace(sheets, "/project/spec.yaml", "/project");
		const result = deserializeWorkspace(json);

		expect(result.version).toBe(1);
		expect(result.spec).toBe("/project/spec.yaml");
		expect(result.root).toBe("/project");
		expect(result.sheets[0].path).toBe("levels/stage1.png");

		const resultAnn = result.sheets[0].annotations[0];
		expect(resultAnn.id).toBe("ann-1");
		expect(resultAnn.entityType).toBe("Sprite");
		expect(resultAnn.shapeData).toEqual({ x: 5, y: 15, width: 64, height: 48 });
		expect(resultAnn.propertyData).toEqual({ label: "enemy", count: 3 });
	});

	it("_stash fields preserved through round-trip", () => {
		const ann = makeAnnotation({ _stash: { removedProp: "value", num: 99 } });
		const sheets = [makeSheet("img.png", [ann])];
		const json = serializeWorkspace(sheets, "", "");
		const result = deserializeWorkspace(json);
		expect(result.sheets[0].annotations[0]._stash).toEqual({
			removedProp: "value",
			num: 99,
		});
	});

	it("empty _stash is not preserved (omitted)", () => {
		const ann = makeAnnotation({ _stash: {} });
		const sheets = [makeSheet("img.png", [ann])];
		const json = serializeWorkspace(sheets, "", "");
		const result = deserializeWorkspace(json);
		expect(result.sheets[0].annotations[0]._stash).toBeUndefined();
	});

	it("multiple sheets and annotations survive round-trip", () => {
		const sheets: WorkspaceSheet[] = [
			makeSheet("a.png", [
				makeAnnotation({ id: "a1", entityType: "Hero" }),
				makeAnnotation({ id: "a2", entityType: "Enemy" }),
			]),
			makeSheet("b.png", [makeAnnotation({ id: "b1", entityType: "Coin" })]),
		];
		const json = serializeWorkspace(sheets, "spec.yaml", "/root");
		const result = deserializeWorkspace(json);

		expect(result.sheets).toHaveLength(2);
		expect(result.sheets[0].annotations).toHaveLength(2);
		expect(result.sheets[0].annotations[0].entityType).toBe("Hero");
		expect(result.sheets[0].annotations[1].entityType).toBe("Enemy");
		expect(result.sheets[1].annotations[0].entityType).toBe("Coin");
	});

	it("spec path relative to span dir survives round-trip", () => {
		const spanFileDir = "/home/user/saves";
		const specPath = "/home/user/saves/spec.yaml";
		const json = serializeWorkspace([], specPath, "/home/user/project", spanFileDir);
		// After serialization, spec should be relative ("spec.yaml")
		const parsed = JSON.parse(json);
		expect(parsed.spec).toBe("spec.yaml");
		// Deserialize back
		const result = deserializeWorkspace(json);
		expect(result.spec).toBe("spec.yaml");
	});
});
