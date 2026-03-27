import { describe, test, expect, beforeEach } from "bun:test";
import { saveImage, loadImage, deleteImage, clear } from "../image-store";

// Note: These tests require a DOM environment with IndexedDB.
// They will be skipped if indexedDB is not available (e.g. in pure Bun).

const hasIndexedDB = typeof globalThis.indexedDB !== "undefined";

describe.skipIf(!hasIndexedDB)("image-store", () => {
	beforeEach(async () => {
		await clear();
	});

	test("saveImage and loadImage round-trip", async () => {
		await saveImage("sheet.png", "data:image/png;base64,abc123");
		const result = await loadImage("sheet.png");
		expect(result).toBe("data:image/png;base64,abc123");
	});

	test("loadImage returns null for missing key", async () => {
		const result = await loadImage("nonexistent.png");
		expect(result).toBeNull();
	});

	test("deleteImage removes entry", async () => {
		await saveImage("sheet.png", "data:image/png;base64,abc123");
		await deleteImage("sheet.png");
		const result = await loadImage("sheet.png");
		expect(result).toBeNull();
	});

	test("clear removes all entries", async () => {
		await saveImage("a.png", "data:a");
		await saveImage("b.png", "data:b");
		await clear();
		expect(await loadImage("a.png")).toBeNull();
		expect(await loadImage("b.png")).toBeNull();
	});

	test("saveImage overwrites existing entry", async () => {
		await saveImage("sheet.png", "data:old");
		await saveImage("sheet.png", "data:new");
		const result = await loadImage("sheet.png");
		expect(result).toBe("data:new");
	});
});
