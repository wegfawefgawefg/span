import YAML from "yaml";

/**
 * Convert raw spec text from one format to another.
 * Returns the converted string, or null if the source can't be parsed.
 */
export function serializeSpecRaw(
	raw: string,
	fromFormat: "json" | "yaml",
	toFormat: "json" | "yaml",
): string | null {
	let data: unknown;
	try {
		data = fromFormat === "json" ? JSON.parse(raw) : YAML.parse(raw);
	} catch {
		return null;
	}

	if (toFormat === "json") {
		return JSON.stringify(data, null, 2);
	}
	return YAML.stringify(data, { indent: 2 });
}
