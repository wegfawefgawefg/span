import { computed, ref, watch } from "vue";
import type { Annotation } from "./annotation";
import { createAnnotation, duplicateAnnotation, clampToImage, createAnnotationWithSize } from "./annotation";
import type { SpanSpec } from "./spec/types";
import { getEntityByLabel } from "./spec/types";
import { parseSpec } from "./spec/parse";
import { diffSpecs } from "./spec/diff";
import type { SpecError, SpecDiff } from "./spec/types";
import { DEFAULT_SPEC_RAW, DEFAULT_SPEC_FORMAT } from "./spec/default-spec";
import { api, platform } from "./platform/adapter";
import { saveImage } from "./platform/image-store";
import {
	sheets,
	currentSheet,
	workspaceReady,
	effectiveRoot,
	root,
	rootOverride,
	spanFilePath,	openSheetByPath,
	removeSheet,
	addSheet,
	resetWorkspace,
} from "./workspace";
import type { WorkspaceSheet } from "./workspace";
import { serializeWorkspace, deserializeWorkspace, debouncedSave } from "./persistence";
import type { SpanFileSpec } from "./persistence";
import { exportToString, type ExportEntry } from "./export";

// Re-export workspace state for consumers
export {
	sheets,
	currentSheet,
	workspaceReady,
	effectiveRoot,
	openSheetByPath,
	removeSheet,
	addSheet,
	resetWorkspace,
};
export type { WorkspaceSheet };

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 32;
export const ZOOM_STEP = 0.1;

// --- Core state ---

export const selectedId = ref<string | null>(null);
export const zoom = ref(2);
export const dirty = ref(false);
export const statusText = ref("Ready");
export const currentSheetImageSrc = ref<string>("");
export const imageWidth = ref(0);
export const imageHeight = ref(0);

// Initialize with built-in default spec
const _defaultParsed = parseSpec(DEFAULT_SPEC_RAW, DEFAULT_SPEC_FORMAT);
if (Array.isArray(_defaultParsed)) {
	throw new Error("Built-in default spec is invalid: " + _defaultParsed.map((e) => e.message).join("; "));
}

export const activeSpec = ref<SpanSpec | null>(_defaultParsed);
export const activeSpecRaw = ref<SpanFileSpec | null>({ raw: DEFAULT_SPEC_RAW, format: DEFAULT_SPEC_FORMAT });
export const activeTool = ref<string>("");

// Eyedropper state: when non-null, the canvas is in eyedropper mode
export const activeEyedropper = ref<{
	callback: (hex: string) => void;
	originalValue: string;
} | null>(null);

// Per-entity preview shape override (entityLabel → shapeName)
// Used by GalleryPanel to know which shape to clip for thumbnails
export const previewShapeOverride = ref<Record<string, string>>({});

/** Get the preview shape name for an entity. Returns override if set, else first rect shape. */
export function getPreviewShapeName(entityLabel: string): string | null {
	const spec = activeSpec.value;
	if (!spec) return null;
	const entity = getEntityByLabel(spec, entityLabel);
	if (!entity) return null;
	return entity.primaryShape.kind === "rect" ? "aabb" : null;
}

export function setPreviewShape(entityLabel: string, shapeName: string) {
	previewShapeOverride.value = { ...previewShapeOverride.value, [entityLabel]: shapeName };
}

// --- Derived ---

/** Annotations for the current sheet (read-only computed). Mutate via currentSheet.value.annotations directly. */
export const annotations = computed<Annotation[]>(
	() => currentSheet.value?.annotations ?? [],
);

export const selectedAnnotation = computed<Annotation | null>(
	() => annotations.value.find((a) => a.id === selectedId.value) ?? null,
);

/** Fulfill a missing sheet with image data. Replaces the object to trigger Vue reactivity. */
export function fulfillSheet(sheet: WorkspaceSheet, imageUrl: string, width: number, height: number) {
	const idx = sheets.value.indexOf(sheet);
	if (idx === -1) return;

	const fulfilled: WorkspaceSheet = {
		...sheet,
		imageUrl,
		width,
		height,
		status: "loaded",
	};
	sheets.value.splice(idx, 1, fulfilled);

	// If this was the active sheet, update canvas
	if (currentSheet.value === sheet) {
		currentSheet.value = fulfilled;
	}
}

// --- Watch currentSheet to load image ---

watch(currentSheet, async (sheet) => {
	if (!sheet) {
		currentSheetImageSrc.value = "";
		imageWidth.value = 0;
		imageHeight.value = 0;
		return;
	}

	// Use the sheet's imageUrl (already a data URL or blob URL)
	currentSheetImageSrc.value = sheet.imageUrl;
	imageWidth.value = sheet.width;
	imageHeight.value = sheet.height;

	// Update status
	markDirty(false);
});

// --- Viewport center callback (set by CanvasView on mount) ---

let getViewportCenter: () => { x: number; y: number } = () => ({
	x: 0,
	y: 0,
});

export function registerViewportCenterFn(
	fn: () => { x: number; y: number },
) {
	getViewportCenter = fn;
}

/** Called from desktop menu handler — passes current viewport center */
export function addAnnotationAtViewportCenter() {
	const center = getViewportCenter();
	addAnnotation(center.x, center.y);
}

// --- Autosave wiring ---

function performSave() {
	const spec = activeSpec.value;
	if (!spec) {
		console.log("[performSave] no spec, skipping");
		return;
	}

	const data = serializeWorkspace(
		sheets.value,
		activeSpecRaw.value,
	);

	console.log("[performSave] platform:", platform.value, "spanFilePath:", spanFilePath.value, "data length:", data.length);

	if (platform.value === "desktop" && spanFilePath.value) {
		api.writeFile(spanFilePath.value, data).then(() => {
			markDirty(false);
			console.log("[performSave] saved to", spanFilePath.value);
		}).catch((e) => {
			console.error("[performSave] save failed:", e);
			statusText.value = "Save failed";
		});
	} else if (platform.value === "web") {
		try {
			localStorage.setItem("span-workspace", data);
			markDirty(false);
		} catch (e) {
			console.error("localStorage save failed:", e);
		}
		// Sync sheet images to IndexedDB for persistence across reloads
		syncImagesToIndexedDB();
	}
}

/** Sync current sheet images to IndexedDB (web only). */
async function syncImagesToIndexedDB() {
	try {
		for (const sheet of sheets.value) {
			if (sheet.status === "loaded" && sheet.imageUrl) {
				await saveImage(sheet.path, sheet.imageUrl);
			}
		}
	} catch (e) {
		console.error("IndexedDB image sync failed:", e);
	}
}

// --- Actions ---

export function selectAnnotation(id: string | null) {
	selectedId.value = id;
}

export function reorderAnnotation(fromId: string, toId: string) {
	const sheet = currentSheet.value;
	if (!sheet) return;
	const arr = sheet.annotations;
	const fromIdx = arr.findIndex(a => a.id === fromId);
	const toIdx = arr.findIndex(a => a.id === toId);
	if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
	const [item] = arr.splice(fromIdx, 1);
	arr.splice(toIdx, 0, item);
	markDirty(true);
}

export function markDirty(isDirty: boolean) {
	dirty.value = isDirty;
	const sheet = currentSheet.value;
	if (!sheet) {
		statusText.value = isDirty ? "Unsaved changes" : "Ready";
		return;
	}
	statusText.value = `${sheet.path} \u2022 ${isDirty ? "Unsaved changes" : "Saved"}`;

	if (isDirty) {
		debouncedSave(performSave);
	}
}

export function addAnnotation(x: number = 0, y: number = 0) {
	const spec = activeSpec.value;
	const tool = activeTool.value;
	const sheet = currentSheet.value;
	if (!spec || !tool || !getEntityByLabel(spec, tool) || !sheet) return;

	const annotation = createAnnotation(spec, tool, { x, y });
	sheet.annotations.push(annotation);
	selectedId.value = annotation.id;
	markDirty(true);
}

export function addAnnotationWithSize(
	entityType: string,
	x: number,
	y: number,
	...sizeArgs: number[]
) {
	const spec = activeSpec.value;
	const sheet = currentSheet.value;
	if (!spec || !getEntityByLabel(spec, entityType) || !sheet) return;

	const entity = getEntityByLabel(spec, entityType)!;
	const isRect = entity.primaryShape.kind === "rect";

	let annotation;
	if (isRect && sizeArgs.length >= 2) {
		annotation = createAnnotationWithSize(spec, entityType, { x, y }, {
			width: sizeArgs[0],
			height: sizeArgs[1],
		});
	} else {
		annotation = createAnnotation(spec, entityType, { x, y });
	}

	sheet.annotations.push(annotation);
	selectedId.value = annotation.id;
	markDirty(true);
}

export function duplicateSelected() {
	const ann = selectedAnnotation.value;
	const sheet = currentSheet.value;
	if (!ann || !sheet) return;
	const copy = duplicateAnnotation(ann, activeSpec.value ?? undefined);
	sheet.annotations.push(copy);
	selectedId.value = copy.id;
	markDirty(true);
}

export function deleteSelected() {
	const sheet = currentSheet.value;
	if (!selectedId.value || !sheet) return;
	sheet.annotations = sheet.annotations.filter(
		(a) => a.id !== selectedId.value,
	);
	selectedId.value = sheet.annotations[0]?.id ?? null;
	markDirty(true);
}

export function updateShapeData(shapeName: string, patch: Record<string, number>) {
	const ann = selectedAnnotation.value;
	if (!ann) return;
	if (shapeName === "aabb" && ann.aabb) {
		Object.assign(ann.aabb, patch);
	} else if (shapeName === "point" && ann.point) {
		Object.assign(ann.point, patch);
	}
	markDirty(true);
}

export function updatePropertyData(patch: Record<string, unknown>) {
	const ann = selectedAnnotation.value;
	if (!ann) return;
	Object.assign(ann.properties, patch);
	markDirty(true);
}

export function clampAnnotationToImage(
	annotation: Annotation,
	imgW: number = imageWidth.value,
	imgH: number = imageHeight.value,
) {
	clampToImage(annotation, imgW, imgH);
}

// --- Spec loading ---

export function loadSpec(raw: string, format: "json" | "yaml") {
	const result = parseSpec(raw, format);
	if (Array.isArray(result)) {
		// Errors
		console.error("Spec parse errors:", result);
		statusText.value = `Spec errors: ${result.map((e) => e.message).join("; ")}`;
		return;
	}
	activeSpec.value = result;
	activeSpecRaw.value = { raw, format };
	activeTool.value = "";
	statusText.value = "Spec loaded";
	markDirty(true);
}

/**
 * Apply a spec edit from the in-app editor.
 * Returns { applied: true } on success, { applied: false, errors } on parse failure,
 * or { applied: false, destructive: true, diff } when confirmation is needed.
 */
export function applySpecFromEditor(
	raw: string,
	format: "json" | "yaml",
): { applied: true } | { applied: false; errors: SpecError[] } | { applied: false; destructive: true; diff: SpecDiff } {
	const result = parseSpec(raw, format);
	if (Array.isArray(result)) {
		return { applied: false, errors: result };
	}

	const currentSpec = activeSpec.value;
	if (currentSpec) {
		const diff = diffSpecs(currentSpec, result);
		if (!diff.safe) {
			return { applied: false, destructive: true, diff };
		}
	}

	activeSpec.value = result;
	activeSpecRaw.value = { raw, format };
	activeTool.value = "";
	markDirty(true);
	return { applied: true };
}

/** Force-apply a spec even if it has destructive changes. Called after user confirms. */
export function forceApplySpec(raw: string, format: "json" | "yaml") {
	const result = parseSpec(raw, format);
	if (Array.isArray(result)) return; // should not happen — caller already validated
	activeSpec.value = result;
	activeSpecRaw.value = { raw, format };
	activeTool.value = "";
	markDirty(true);
}

export async function importSpecFromPath(path: string) {
	try {
		const raw = await api.readFile(path);
		const format = path.endsWith(".json") ? "json" : "yaml" as const;
		loadSpec(raw, format);
	} catch (e) {
		console.error("Failed to import spec:", e);
		statusText.value = "Failed to import spec file";
	}
}

export async function importSheetFromPath(path: string) {
	try {
		const dataUrl = await api.readImageAsDataUrl(path);
		const dims = await new Promise<{ width: number; height: number }>((resolve) => {
			const img = new Image();
			img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
			img.onerror = () => resolve({ width: 0, height: 0 });
			img.src = dataUrl;
		});
		const name = path.split("/").pop() ?? path;

		// Fulfill a missing sheet if one matches
		const missing = sheets.value.find(
			(s) => s.status === "missing" && s.path.split("/").pop() === name,
		);
		if (missing) {
			fulfillSheet(missing, dataUrl, dims.width, dims.height);
		} else {
			addSheet({
				path: name,
				absolutePath: path,
				annotations: [],
				status: "loaded",
				imageUrl: dataUrl,
				width: dims.width,
				height: dims.height,
			});
		}
	} catch (e) {
		console.error("Failed to import sheet:", e);
		statusText.value = "Failed to import image";
	}
}

// --- Export ---

export async function exportWorkspace(dialogPath?: string) {
	console.log("[exportWorkspace] called, dialogPath:", dialogPath);
	const spec = activeSpec.value;
	if (!spec) {
		console.log("[exportWorkspace] no spec loaded");
		statusText.value = "No spec loaded — cannot export";
		return;
	}

	const entries: ExportEntry[] = sheets.value.flatMap((s) =>
		s.annotations.map((a) => ({
			annotation: a,
			sheetFile: s.path.split("/").pop() ?? s.path,
		})),
	);
	console.log("[exportWorkspace] entries:", entries.length, "format:", spec.format);
	const output = exportToString(entries, spec);
	console.log("[exportWorkspace] output length:", output.length);

	const ext = spec.format === "yaml" ? "yaml" : "json";
	const defaultName = `annotations.${ext}`;

	await doExportWrite(output, defaultName, dialogPath);
}

/** Write export output — on desktop uses a dialog path passed from backend, on web triggers download. */
export async function doExportWrite(output: string, defaultName: string, dialogPath?: string) {
	let savePath: string;
	if (platform.value === "web") {
		savePath = defaultName;
	} else if (dialogPath) {
		savePath = dialogPath;
	} else {
		// Fallback: show dialog from webview (used if called directly)
		const path = await api.showSaveDialog(defaultName, []);
		if (!path) return;
		savePath = path;
	}

	try {
		await api.writeFile(savePath, output);
		statusText.value = `Exported to ${savePath.split("/").pop()}`;
	} catch (e) {
		console.error("Export failed:", e);
		statusText.value = "Export failed";
	}
}

// --- Save / Save As / Open ---

export async function saveWorkspace(): Promise<{ needsSaveAs: boolean }> {
	// On web, always save to localStorage (no file path needed)
	if (platform.value === "web") {
		performSave();
		return { needsSaveAs: false };
	}
	if (!spanFilePath.value) {
		return { needsSaveAs: true };
	}
	performSave();
	return { needsSaveAs: false };
}

export async function saveWorkspaceAs(dialogPath?: string) {
	console.log("[saveWorkspaceAs] called, dialogPath:", dialogPath);
	let savePath = dialogPath;
	if (!savePath) {
		if (platform.value === "web") {
			// Web: trigger download with default name
			savePath = "workspace.span";
		} else {
			const selected = await api.showSaveDialog("workspace.span", [
				{ name: "Span files", extensions: ["span"] },
			]);
			if (!selected) return;
			savePath = selected;
		}
	}

	savePath = savePath.endsWith(".span") ? savePath : savePath + ".span";
	spanFilePath.value = savePath;
	console.log("[saveWorkspaceAs] saving to:", savePath);

	const data = serializeWorkspace(
		sheets.value,
		activeSpecRaw.value,
	);
	console.log("[saveWorkspaceAs] data length:", data.length);

	try {
		await api.writeFile(savePath, data);
		console.log("[saveWorkspaceAs] write succeeded");
		markDirty(false);
		statusText.value = `Saved to ${savePath.split("/").pop()}`;
	} catch (e) {
		console.error("Save As failed:", e);
		statusText.value = "Save failed";
	}
}

export async function openWorkspace(dialogPath?: string) {
	const path = dialogPath ?? await api.showOpenDialog([
		{ name: "Span files", extensions: ["span"] },
	]);
	if (!path) return;
	await loadWorkspaceFromPath(path);
}

export async function loadWorkspaceFromPath(path: string) {
	try {
		const raw = await api.readFile(path);
		await restoreWorkspace(raw, path);
	} catch (e) {
		console.error("Failed to open .span file:", e);
		statusText.value = "Failed to open .span file";
	}
}

export async function restoreWorkspace(raw: string, filePath?: string) {
	const data = deserializeWorkspace(raw);

	// Load inline spec if present
	if (data.spec) {
		loadSpec(data.spec.raw, data.spec.format);
	}

	// Reset and load sheets
	resetWorkspace();
	if (filePath) {
		spanFilePath.value = filePath;
	}

	const dir = filePath ? filePath.replace(/\/[^/]+$/, "") : "";

	for (const sheet of data.sheets) {
		// Resolve sheet path relative to .span file
		let imgPath = sheet.path;
		if (dir && !imgPath.startsWith("/")) {
			imgPath = dir + "/" + imgPath;
		}

		let loaded = false;
		// Try direct path, then filename search in .span file directory
		const candidates = [imgPath];
		if (dir) {
			const filename = sheet.path.split("/").pop() ?? sheet.path;
			const searchPath = dir + "/" + filename;
			if (searchPath !== imgPath) candidates.push(searchPath);
		}

		for (const candidate of candidates) {
			try {
				const dataUrl = await api.readImageAsDataUrl(candidate);
				const dims = await new Promise<{ width: number; height: number }>((resolve) => {
					const img = new Image();
					img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
					img.onerror = () => resolve({ width: 0, height: 0 });
					img.src = dataUrl;
				});

				addSheet({
					path: sheet.path,
					absolutePath: candidate,
					annotations: sheet.annotations,
					status: "loaded",
					imageUrl: dataUrl,
					width: dims.width,
					height: dims.height,
				});
				loaded = true;
				break;
			} catch {
				// Try next candidate
			}
		}

		if (!loaded) {
			addSheet({
				path: sheet.path,
				absolutePath: imgPath,
				annotations: sheet.annotations,
				status: "missing",
				imageUrl: "",
				width: 0,
				height: 0,
			});
		}
	}

	markDirty(false);
	statusText.value = filePath
		? `Opened ${filePath.split("/").pop()}`
		: "Workspace restored";
}
