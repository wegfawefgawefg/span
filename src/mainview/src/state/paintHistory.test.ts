import { beforeEach, describe, expect, it } from "bun:test";
import { ref } from "vue";
import type { Annotation } from "../annotation";
import type { WorkspaceSheet } from "../workspace";
import { currentSheet, sheets } from "../workspace";
import {
	bindPaintHistoryRefs,
	editedSheetState,
	recordPaintUndoSnapshot,
	redoPaintEdit,
	undoPaintEdit,
} from "./paintHistory";

function makeAnnotation(
	id: string,
	overrides: Partial<Annotation> = {},
): Annotation {
	return {
		id,
		entityType: "Sprite",
		aabb: { x: 0, y: 0, w: 16, h: 16 },
		point: null,
		chromaKey: null,
		properties: { name: id },
		...overrides,
	};
}

function makeSheet(
	path: string,
	annotations: Annotation[],
	overrides: Partial<WorkspaceSheet> = {},
): WorkspaceSheet {
	return {
		path,
		absolutePath: `/tmp/${path}`,
		annotations,
		status: "loaded",
		imageUrl: "data:image/png;base64,original",
		width: 16,
		height: 16,
		...overrides,
	};
}

function bindTestHistoryRefs() {
	const currentSheetImageSrc = ref("");
	const imageWidth = ref(0);
	const imageHeight = ref(0);
	const statusText = ref("");
	const selectedId = ref<string | null>(null);
	const markDirtyCalls: boolean[] = [];

	bindPaintHistoryRefs({
		currentSheetImageSrc,
		imageWidth,
		imageHeight,
		statusText,
		selectedId,
		markDirty: (isDirty) => {
			markDirtyCalls.push(isDirty);
		},
	});

	return {
		currentSheetImageSrc,
		imageWidth,
		imageHeight,
		statusText,
		selectedId,
		markDirtyCalls,
	};
}

describe("paintHistory", () => {
	beforeEach(() => {
		editedSheetState.value = {};
		sheets.value = [];
		currentSheet.value = null;
	});

	it("undoes and redoes full sheet snapshots including size and selection", () => {
		const refs = bindTestHistoryRefs();
		const ann1 = makeAnnotation("ann-1");
		const ann2 = makeAnnotation("ann-2", {
			aabb: { x: 8, y: 4, w: 12, h: 10 },
			properties: { name: "second" },
		});
		const sheet = makeSheet("sheet.png", [ann1]);

		sheets.value = [sheet];
		currentSheet.value = sheet;
		refs.selectedId.value = ann1.id;
		refs.currentSheetImageSrc.value = sheet.imageUrl;
		refs.imageWidth.value = sheet.width;
		refs.imageHeight.value = sheet.height;

		recordPaintUndoSnapshot(sheet);
		sheet.imageUrl = "data:image/png;base64,edited";
		sheet.width = 32;
		sheet.height = 24;
		sheet.annotations = [ann1, ann2];
		refs.selectedId.value = ann2.id;

		expect(undoPaintEdit()).toBe(true);
		expect(sheet.imageUrl).toBe("data:image/png;base64,original");
		expect(sheet.width).toBe(16);
		expect(sheet.height).toBe(16);
		expect(sheet.annotations).toEqual([ann1]);
		expect(refs.selectedId.value).toBe(ann1.id);
		expect(refs.currentSheetImageSrc.value).toBe("data:image/png;base64,original");
		expect(refs.imageWidth.value).toBe(16);
		expect(refs.imageHeight.value).toBe(16);

		expect(redoPaintEdit()).toBe(true);
		expect(sheet.imageUrl).toBe("data:image/png;base64,edited");
		expect(sheet.width).toBe(32);
		expect(sheet.height).toBe(24);
		expect(sheet.annotations).toEqual([ann1, ann2]);
		expect(refs.selectedId.value).toBe(ann2.id);
		expect(refs.currentSheetImageSrc.value).toBe("data:image/png;base64,edited");
		expect(refs.imageWidth.value).toBe(32);
		expect(refs.imageHeight.value).toBe(24);
	});

	it("undos annotation-only edits on non-paintable sheets", () => {
		const refs = bindTestHistoryRefs();
		const ann1 = makeAnnotation("ann-1");
		const ann2 = makeAnnotation("ann-2");
		const sheet = makeSheet("notes.sheet", [ann1], {
			imageUrl: "data:text/plain;base64,placeholder",
			width: 1,
			height: 1,
		});

		sheets.value = [sheet];
		currentSheet.value = sheet;
		refs.selectedId.value = ann1.id;

		recordPaintUndoSnapshot(sheet);
		sheet.annotations = [ann1, ann2];
		refs.selectedId.value = ann2.id;

		expect(undoPaintEdit()).toBe(true);
		expect(sheet.annotations).toEqual([ann1]);
		expect(refs.selectedId.value).toBe(ann1.id);
		expect(refs.markDirtyCalls).toEqual([true]);
	});
});
