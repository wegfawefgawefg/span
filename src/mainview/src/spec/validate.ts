// src/mainview/src/spec/validate.ts
import type { SpecError } from "./types";

const VALID_SCALAR_TYPES = new Set<string>([
	"string", "integer", "number", "boolean", "string[]", "ainteger",
]);
const VALID_SHAPE_TYPES = new Set<string>(["rect", "point"]);
const LABEL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENUM_RE = /^enum\[(.+)\]$/;
const RESERVED_CORE_FIELDS = new Set(["name", "frame", "duration", "offset"]);

export function validateSpec(raw: unknown): SpecError[] {
	const errors: SpecError[] = [];

	if (!Array.isArray(raw)) {
		errors.push({ path: "", severity: "error", message: "Spec must be an array of entity definitions" });
		return errors;
	}

	if (raw.length === 0) {
		errors.push({ path: "", severity: "error", message: "Spec must have at least one entity" });
		return errors;
	}

	const seenLabels = new Set<string>();
	const seenGroups = new Set<string>();

	for (let i = 0; i < raw.length; i++) {
		const entity = raw[i];
		const ePath = `[${i}]`;

		if (typeof entity !== "object" || entity === null || Array.isArray(entity)) {
			errors.push({ path: ePath, severity: "error", message: "Entity must be an object" });
			continue;
		}

		const ent = entity as Record<string, unknown>;

		// --- label ---
		if (typeof ent.label !== "string" || ent.label.length === 0) {
			errors.push({ path: `${ePath}.label`, severity: "error", message: "Entity must have a 'label' string" });
		} else if (!LABEL_RE.test(ent.label)) {
			errors.push({
				path: `${ePath}.label`,
				severity: "error",
				message: `Label "${ent.label}" must be a valid identifier (alphanumeric + underscore, no spaces)`,
			});
		} else if (seenLabels.has(ent.label)) {
			errors.push({ path: `${ePath}.label`, severity: "error", message: `Duplicate label "${ent.label}"` });
		} else {
			seenLabels.add(ent.label);
		}

		// --- group ---
		if (typeof ent.group !== "string" || ent.group.length === 0) {
			errors.push({ path: `${ePath}.group`, severity: "error", message: "Entity must have a 'group' string" });
		} else if (seenGroups.has(ent.group)) {
			errors.push({ path: `${ePath}.group`, severity: "error", message: `Duplicate group "${ent.group}"` });
		} else {
			seenGroups.add(ent.group);
		}

		// --- primary shape ---
		const hasAabb = "aabb" in ent;
		const hasPoint = "point" in ent;

		if (hasAabb && hasPoint) {
			errors.push({ path: ePath, severity: "error", message: "Entity must have exactly one primary shape (aabb or point), not both" });
		} else if (!hasAabb && !hasPoint) {
			errors.push({ path: ePath, severity: "error", message: "Entity must have a primary shape (aabb or point)" });
		} else if (hasAabb && ent.aabb !== "rect") {
			errors.push({ path: `${ePath}.aabb`, severity: "error", message: `aabb value must be "rect"` });
		} else if (hasPoint && ent.point !== "point") {
			errors.push({ path: `${ePath}.point`, severity: "error", message: `point value must be "point"` });
		}

		const isAabbEntity = hasAabb && ent.aabb === "rect";

		// --- path ---
		if ("path" in ent) {
			if (ent.path !== "file_name") {
				errors.push({ path: `${ePath}.path`, severity: "error", message: `path value must be "file_name"` });
			}
		}

		// --- required sprite/core fields ---
		if ("name" in ent && ent.name !== "string") {
			errors.push({ path: `${ePath}.name`, severity: "error", message: `name value must be "string"` });
		}
		if ("frame" in ent && ent.frame !== "integer" && ent.frame !== "ainteger") {
			errors.push({ path: `${ePath}.frame`, severity: "error", message: `frame value must be "integer" or "ainteger"` });
		}
		if ("duration" in ent && ent.duration !== "integer" && ent.duration !== "ainteger" && ent.duration !== "number") {
			errors.push({ path: `${ePath}.duration`, severity: "error", message: `duration value must be "integer", "ainteger", or "number"` });
		}
		if ("offset" in ent) {
			if (ent.offset !== "point") {
				errors.push({ path: `${ePath}.offset`, severity: "error", message: `offset value must be "point"` });
			} else if (!isAabbEntity) {
				errors.push({ path: `${ePath}.offset`, severity: "error", message: `offset requires the entity to have "aabb: rect" as primary shape` });
			}
		}

		// --- properties ---
		if (ent.properties !== undefined && (typeof ent.properties !== "object" || ent.properties === null || Array.isArray(ent.properties))) {
			errors.push({ path: `${ePath}.properties`, severity: "error", message: "Properties must be an object" });
			continue;
		}

		if (ent.properties === undefined) continue;

		const properties = ent.properties as Record<string, unknown>;
		const fieldNames = new Set<string>();

		for (const [fieldName, fieldValue] of Object.entries(properties)) {
			const fPath = `${ePath}.properties.${fieldName}`;

			if (RESERVED_CORE_FIELDS.has(fieldName) && fieldName in ent) {
				errors.push({ path: fPath, severity: "error", message: `Field "${fieldName}" is defined both at top level and under properties` });
				continue;
			}

			// Reserved __ prefix
			if (fieldName.startsWith("__")) {
				errors.push({ path: fPath, severity: "error", message: `Field name "${fieldName}" is reserved (__ prefix)` });
				continue;
			}

			// Duplicate field name
			if (fieldNames.has(fieldName)) {
				errors.push({ path: fPath, severity: "error", message: `Duplicate field name "${fieldName}"` });
				continue;
			}
			fieldNames.add(fieldName);

			if (typeof fieldValue !== "string") {
				errors.push({ path: fPath, severity: "error", message: `Invalid field value for "${fieldName}" — must be a type string` });
				continue;
			}

			// Parse the type string
			if (VALID_SCALAR_TYPES.has(fieldValue) || fieldValue === "color") {
				// Valid scalar or color type
				continue;
			}

			// Shape types: rect, point, rect[], point[]
			const arrayMatch = fieldValue.match(/^(rect|point)\[\]$/);
			if (arrayMatch || VALID_SHAPE_TYPES.has(fieldValue)) {
				// Shape property — must be on an aabb entity
				if (!isAabbEntity) {
					errors.push({
						path: fPath,
						severity: "error",
						message: `Shape properties require the entity to have "aabb: rect" as primary shape`,
					});
				}
				continue;
			}

			// Enum: enum[val1, val2, ...]
			const enumMatch = fieldValue.match(ENUM_RE);
			if (enumMatch) {
				const values = enumMatch[1].split(",").map((v) => v.trim()).filter((v) => v.length > 0);
				if (values.length < 2) {
					errors.push({ path: fPath, severity: "error", message: `Enum must have at least 2 values, got ${values.length}` });
				}
				continue;
			}

			// Check for empty enum
			if (fieldValue === "enum[]") {
				errors.push({ path: fPath, severity: "error", message: `Enum must have at least 2 values, got 0` });
				continue;
			}

			// Unknown type
			errors.push({
				path: fPath,
				severity: "error",
				message: `Unknown type "${fieldValue}". Valid types: string, integer, number, boolean, string[], color, rect, point, rect[], point[], enum[...]`,
			});
		}
	}

	return errors;
}
