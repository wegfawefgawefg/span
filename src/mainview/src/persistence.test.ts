import { describe, it, expect } from "bun:test";
import {
	serializeWorkspace,
	deserializeWorkspace,
	type WorkspaceSheet,
	type SpanFileSpec,
} from "./persistence";
import type { Annotation } from "./annotation";

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
	return {
		id: "ann-1",
		entityType: "Sprite",
		aabb: { x: 10, y: 20, w: 32, h: 32 },
		point: null,
		chromaKey: null,
		properties: { name: "hero" },
		...overrides,
	};
}

function makeSheet(
	path: string,
	annotations: Annotation[] = [],
): WorkspaceSheet {
	return { path, annotations };
}

const testSpec: SpanFileSpec = {
	format: "yaml",
	raw: "- label: Sprite\n  group: sprites\n  aabb: rect\n  properties:\n    name: string\n",
};

describe("serializeWorkspace", () => {
	it("produces correct JSON structure with version 2", () => {
		const ann = makeAnnotation();
		const sheets = [makeSheet("images/hero.png", [ann])];
		const json = serializeWorkspace(sheets, testSpec);
		const parsed = JSON.parse(json);

		expect(parsed.version).toBe(2);
		expect(parsed.spec).toEqual(testSpec);
		expect(parsed.sheets).toHaveLength(1);
		expect(parsed.sheets[0].path).toBe("images/hero.png");
		expect(parsed.sheets[0].annotations[0].aabb).toEqual({ x: 10, y: 20, w: 32, h: 32 });
		expect(parsed.sheets[0].annotations[0].point).toBeNull();
		expect(parsed.sheets[0].annotations[0].properties).toEqual({ name: "hero" });
	});

	it("ends with a newline", () => {
		const json = serializeWorkspace([], null);
		expect(json.endsWith("\n")).toBe(true);
	});

	it("empty workspace serializes to correct structure", () => {
		const json = serializeWorkspace([], null);
		const parsed = JSON.parse(json);
		expect(parsed).toEqual({ version: 2, spec: null, sheets: [] });
	});

	it("preserves _stash fields in annotations", () => {
		const ann = makeAnnotation({ _stash: { oldProp: "preserved" } });
		const sheets = [makeSheet("a.png", [ann])];
		const json = serializeWorkspace(sheets, null);
		const parsed = JSON.parse(json);
		expect(parsed.sheets[0].annotations[0]._stash).toEqual({ oldProp: "preserved" });
	});

	it("omits _stash when it is empty", () => {
		const ann = makeAnnotation({ _stash: {} });
		const sheets = [makeSheet("a.png", [ann])];
		const json = serializeWorkspace(sheets, null);
		const parsed = JSON.parse(json);
		expect(parsed.sheets[0].annotations[0]._stash).toBeUndefined();
	});

	it("serializes point annotation", () => {
		const ann = makeAnnotation({ aabb: null, point: { x: 5, y: 10 } });
		const sheets = [makeSheet("a.png", [ann])];
		const json = serializeWorkspace(sheets, null);
		const parsed = JSON.parse(json);
		expect(parsed.sheets[0].annotations[0].aabb).toBeNull();
		expect(parsed.sheets[0].annotations[0].point).toEqual({ x: 5, y: 10 });
	});
});

describe("deserializeWorkspace", () => {
	it("correctly parses version 2 JSON", () => {
		const raw = JSON.stringify({
			version: 2,
			spec: testSpec,
			sheets: [{
				path: "images/hero.png",
				annotations: [{
					id: "ann-1",
					entityType: "Sprite",
					aabb: { x: 10, y: 20, w: 32, h: 32 },
					point: null,
					properties: { name: "hero" },
				}],
			}],
		});

		const result = deserializeWorkspace(raw);
		expect(result.version).toBe(2);
		expect(result.sheets[0].annotations[0].aabb).toEqual({ x: 10, y: 20, w: 32, h: 32 });
		expect(result.sheets[0].annotations[0].point).toBeNull();
		expect(result.sheets[0].annotations[0].properties).toEqual({ name: "hero" });
	});

	it("throws when version > 2", () => {
		const raw = JSON.stringify({ version: 3, spec: null, sheets: [] });
		expect(() => deserializeWorkspace(raw)).toThrow("Unsupported .span file version: 3");
	});

	it("throws when version is missing", () => {
		const raw = JSON.stringify({ spec: null, sheets: [] });
		expect(() => deserializeWorkspace(raw)).toThrow("Invalid .span file: missing version");
	});

	it("applies defaults for missing fields", () => {
		const raw = JSON.stringify({ version: 2 });
		const result = deserializeWorkspace(raw);
		expect(result.spec).toBeNull();
		expect(result.sheets).toEqual([]);
	});

	it("applies defaults for missing annotation fields", () => {
		const raw = JSON.stringify({
			version: 2,
			sheets: [{ annotations: [{}] }],
		});
		const result = deserializeWorkspace(raw);
		const ann = result.sheets[0].annotations[0];
		expect(ann.id).toBe("");
		expect(ann.entityType).toBe("");
		expect(ann.aabb).toBeNull();
		expect(ann.point).toBeNull();
		expect(ann.properties).toEqual({});
	});

	it("preserves _stash through deserialization", () => {
		const raw = JSON.stringify({
			version: 2,
			sheets: [{
				path: "a.png",
				annotations: [{
					id: "x", entityType: "T",
					aabb: null, point: null, properties: {},
					_stash: { legacy: 42 },
				}],
			}],
		});
		const result = deserializeWorkspace(raw);
		expect(result.sheets[0].annotations[0]._stash).toEqual({ legacy: 42 });
	});
});

describe("round-trip", () => {
	it("serialize → deserialize → data matches", () => {
		const ann = makeAnnotation({
			aabb: { x: 5, y: 15, w: 64, h: 48 },
			properties: { name: "enemy" },
		});
		const sheets = [makeSheet("levels/stage1.png", [ann])];
		const json = serializeWorkspace(sheets, testSpec);
		const result = deserializeWorkspace(json);

		expect(result.version).toBe(2);
		expect(result.spec).toEqual(testSpec);
		const resultAnn = result.sheets[0].annotations[0];
		expect(resultAnn.aabb).toEqual({ x: 5, y: 15, w: 64, h: 48 });
		expect(resultAnn.properties).toEqual({ name: "enemy" });
	});

	it("_stash fields preserved through round-trip", () => {
		const ann = makeAnnotation({ _stash: { removedProp: "value" } });
		const sheets = [makeSheet("img.png", [ann])];
		const json = serializeWorkspace(sheets, null);
		const result = deserializeWorkspace(json);
		expect(result.sheets[0].annotations[0]._stash).toEqual({ removedProp: "value" });
	});
});
