// src/mainview/src/spec/__tests__/infer.test.ts
import { describe, test, expect } from "bun:test";
import { inferShapeMapping } from "../infer";
import type { ShapeField } from "../types";

describe("inferShapeMapping", () => {
	// --- rect ---
	test("rect with standard names", () => {
		const fields: ShapeField[] = [
			{ name: "x", valueType: "integer" },
			{ name: "y", valueType: "integer" },
			{ name: "width", valueType: "integer" },
			{ name: "height", valueType: "integer" },
		];
		const result = inferShapeMapping("rect", fields);
		expect(result.mapping).toEqual({
			type: "rect",
			x: "x",
			y: "y",
			width: "width",
			height: "height",
		});
		expect(result.warnings).toHaveLength(0);
	});

	test("rect with w/h aliases", () => {
		const fields: ShapeField[] = [
			{ name: "x", valueType: "integer" },
			{ name: "y", valueType: "integer" },
			{ name: "w", valueType: "integer" },
			{ name: "h", valueType: "integer" },
		];
		const result = inferShapeMapping("rect", fields);
		expect(result.mapping).toEqual({
			type: "rect",
			x: "x",
			y: "y",
			width: "w",
			height: "h",
		});
	});

	test("rect with LTRB names", () => {
		const fields: ShapeField[] = [
			{ name: "left", valueType: "integer" },
			{ name: "top", valueType: "integer" },
			{ name: "right", valueType: "integer" },
			{ name: "bottom", valueType: "integer" },
		];
		const result = inferShapeMapping("rect", fields);
		expect(result.mapping).toEqual({
			type: "rect",
			x: "left",
			y: "top",
			width: "right",
			height: "bottom",
		});
	});

	test("rect with unrecognized name warns", () => {
		const fields: ShapeField[] = [
			{ name: "x", valueType: "integer" },
			{ name: "y", valueType: "integer" },
			{ name: "foo", valueType: "integer" },
			{ name: "height", valueType: "integer" },
		];
		const result = inferShapeMapping("rect", fields);
		expect(result.mapping).toBeNull();
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	// --- point ---
	test("point with standard names", () => {
		const fields: ShapeField[] = [
			{ name: "x", valueType: "integer" },
			{ name: "y", valueType: "integer" },
		];
		const result = inferShapeMapping("point", fields);
		expect(result.mapping).toEqual({ type: "point", x: "x", y: "y" });
		expect(result.warnings).toHaveLength(0);
	});

	// --- circle ---
	test("circle with cx/cy/radius", () => {
		const fields: ShapeField[] = [
			{ name: "cx", valueType: "integer" },
			{ name: "cy", valueType: "integer" },
			{ name: "radius", valueType: "integer" },
		];
		const result = inferShapeMapping("circle", fields);
		expect(result.mapping).toEqual({
			type: "circle",
			x: "cx",
			y: "cy",
			radius: "radius",
		});
	});

	test("circle with r alias", () => {
		const fields: ShapeField[] = [
			{ name: "x", valueType: "integer" },
			{ name: "y", valueType: "integer" },
			{ name: "r", valueType: "integer" },
		];
		const result = inferShapeMapping("circle", fields);
		expect(result.mapping).toEqual({
			type: "circle",
			x: "x",
			y: "y",
			radius: "r",
		});
	});

	// --- polygon ---
	test("polygon with points", () => {
		const fields: ShapeField[] = [
			{ name: "points", valueType: "integer" },
		];
		const result = inferShapeMapping("polygon", fields);
		expect(result.mapping).toEqual({ type: "polygon", points: "points" });
	});

	test("polygon with vertices alias", () => {
		const fields: ShapeField[] = [
			{ name: "vertices", valueType: "integer" },
		];
		const result = inferShapeMapping("polygon", fields);
		expect(result.mapping).toEqual({
			type: "polygon",
			points: "vertices",
		});
	});

	// --- number value type ---
	test("rect with number value types", () => {
		const fields: ShapeField[] = [
			{ name: "x", valueType: "number" },
			{ name: "y", valueType: "number" },
			{ name: "width", valueType: "number" },
			{ name: "height", valueType: "number" },
		];
		const result = inferShapeMapping("rect", fields);
		expect(result.mapping).toEqual({
			type: "rect",
			x: "x", y: "y", width: "width", height: "height",
		});
	});

	// --- col/row aliases ---
	test("point with col/row aliases", () => {
		const fields: ShapeField[] = [
			{ name: "col", valueType: "integer" },
			{ name: "row", valueType: "integer" },
		];
		const result = inferShapeMapping("point", fields);
		expect(result.mapping).toEqual({ type: "point", x: "col", y: "row" });
	});
});
