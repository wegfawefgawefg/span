import { describe, test, expect } from "bun:test";
import { DEFAULT_SPEC_RAW, DEFAULT_SPEC_FORMAT } from "../default-spec";
import { parseSpec } from "../parse";

describe("default spec", () => {
	test("DEFAULT_SPEC_RAW is valid YAML that parses without errors", () => {
		const result = parseSpec(DEFAULT_SPEC_RAW, DEFAULT_SPEC_FORMAT);
		expect(Array.isArray(result)).toBe(false);
	});

	test("default spec has a Sprite entity with rect shape", () => {
		const result = parseSpec(DEFAULT_SPEC_RAW, DEFAULT_SPEC_FORMAT);
		if (Array.isArray(result)) throw new Error("parse failed");
		const sprite = result.entities.find((e) => e.label === "Sprite");
		expect(sprite).toBeDefined();
		expect(sprite!.primaryShape.kind).toBe("rect");
	});

	test("default spec Sprite has name, frame, duration, and offset properties", () => {
		const result = parseSpec(DEFAULT_SPEC_RAW, DEFAULT_SPEC_FORMAT);
		if (Array.isArray(result)) throw new Error("parse failed");
		const sprite = result.entities[0];
		expect(sprite.nameField?.name).toBe("name");
		expect(sprite.frameField?.name).toBe("frame");
		expect(sprite.durationField?.name).toBe("duration");
		expect(sprite.offsetField?.name).toBe("offset");
	});

	test("frame property is ainteger type", () => {
		const result = parseSpec(DEFAULT_SPEC_RAW, DEFAULT_SPEC_FORMAT);
		if (Array.isArray(result)) throw new Error("parse failed");
		const sprite = result.entities[0];
		const frame = sprite.frameField;
		expect(frame).toBeDefined();
		expect(frame!.kind).toBe("scalar");
		if (frame!.kind === "scalar") {
			expect(frame!.type).toBe("ainteger");
		}
	});
});
