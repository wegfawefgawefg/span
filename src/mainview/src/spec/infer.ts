// src/mainview/src/spec/infer.ts
import type { ShapeType, ShapeField, ShapeMapping } from "./types";

// Alias tables: role → recognized field names
const RECT_ALIASES: Record<string, string[]> = {
	x: ["x", "left", "col"],
	y: ["y", "top", "row"],
	width: ["width", "w", "right"],
	height: ["height", "h", "bottom"],
};

const POINT_ALIASES: Record<string, string[]> = {
	x: ["x", "col"],
	y: ["y", "row"],
};

const CIRCLE_ALIASES: Record<string, string[]> = {
	x: ["x", "cx"],
	y: ["y", "cy"],
	radius: ["radius", "r"],
};

const POLYGON_ALIASES: Record<string, string[]> = {
	points: ["points", "vertices", "verts"],
};

const ALIAS_TABLES: Record<ShapeType, Record<string, string[]>> = {
	rect: RECT_ALIASES,
	point: POINT_ALIASES,
	circle: CIRCLE_ALIASES,
	polygon: POLYGON_ALIASES,
};

const EXPECTED_FIELD_COUNT: Record<ShapeType, number> = {
	rect: 4,
	point: 2,
	circle: 3,
	polygon: 1,
};

export function inferShapeMapping(
	type: ShapeType,
	fields: ShapeField[],
): { mapping: ShapeMapping | null; warnings: string[] } {
	const warnings: string[] = [];
	const aliases = ALIAS_TABLES[type];
	const expected = EXPECTED_FIELD_COUNT[type];

	if (fields.length !== expected) {
		warnings.push(
			`Shape type "${type}" expects ${expected} field(s), got ${fields.length}`,
		);
		return { mapping: null, warnings };
	}

	// For each role, find which field matches
	const roleToFieldName: Record<string, string> = {};
	const usedFields = new Set<string>();

	for (const [role, names] of Object.entries(aliases)) {
		const match = fields.find(
			(f) => names.includes(f.name) && !usedFields.has(f.name),
		);
		if (match) {
			roleToFieldName[role] = match.name;
			usedFields.add(match.name);
		}
	}

	// Check for unrecognized fields
	for (const field of fields) {
		if (!usedFields.has(field.name)) {
			warnings.push(
				`Unrecognized field name "${field.name}" for shape type "${type}"`,
			);
		}
	}

	// Check all roles are filled
	const roles = Object.keys(aliases);
	const missingRoles = roles.filter((r) => !(r in roleToFieldName));
	if (missingRoles.length > 0) {
		warnings.push(
			`Could not infer role(s): ${missingRoles.join(", ")} for shape type "${type}"`,
		);
		return { mapping: null, warnings };
	}

	// Build the mapping
	const r = roleToFieldName;
	let mapping: ShapeMapping;
	switch (type) {
		case "rect":
			mapping = {
				type: "rect",
				x: r.x,
				y: r.y,
				width: r.width,
				height: r.height,
			};
			break;
		case "point":
			mapping = { type: "point", x: r.x, y: r.y };
			break;
		case "circle":
			mapping = { type: "circle", x: r.x, y: r.y, radius: r.radius };
			break;
		case "polygon":
			mapping = { type: "polygon", points: r.points };
			break;
	}

	return { mapping, warnings };
}
