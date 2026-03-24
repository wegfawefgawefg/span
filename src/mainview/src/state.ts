import { computed, ref, watch } from "vue";
import type { Annotation } from "./annotation";
import { createAnnotation, duplicateAnnotation, clampToImage, createAnnotationWithSize } from "./annotation";
import type { SpanSpec } from "./spec/types";
import { getEntityByLabel, getShapesForEntity } from "./spec/types";
import { parseSpec } from "./spec/parse";
import { api, platform } from "./platform/adapter";
import {
	sheets,
	currentSheet,
	workspaceReady,
	effectiveRoot,
	root,
	rootOverride,
	spanFilePath,
	specFilePath,
	openSheetByPath,
	removeSheet,
	addSheet,
	resetWorkspace,
} from "./workspace";
import type { WorkspaceSheet } from "./workspace";
import { serializeWorkspace, deserializeWorkspace, debouncedSave } from "./persistence";
import { exportToString } from "./export";

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

export const activeSpec = ref<SpanSpec | null>(null);
export const activeTool = ref<string>("");

// Per-entity preview shape override (entityLabel → shapeName)
// Used by GalleryPanel to know which shape to clip for thumbnails
export const previewShapeOverride = ref<Record<string, string>>({});

/** Get the preview shape name for an entity. Returns override if set, else first rect shape. */
export function getPreviewShapeName(entityLabel: string): string | null {
	const override = previewShapeOverride.value[entityLabel];
	if (override) return override;
	const spec = activeSpec.value;
	if (!spec) return null;
	const entity = getEntityByLabel(spec, entityLabel);
	if (!entity) return null;
	const firstRect = getShapesForEntity(entity).find(s => s.shapeType === "rect");
	return firstRect?.name ?? null;
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
	if (!spec) return;

	const data = serializeWorkspace(
		sheets.value,
		specFilePath.value,
		effectiveRoot.value,
		spanFilePath.value ? spanFilePath.value.replace(/\/[^/]+$/, "") : undefined,
	);

	if (platform.value === "desktop" && spanFilePath.value) {
		api.writeFile(spanFilePath.value, data).then(() => {
			markDirty(false);
			console.log("Saved to", spanFilePath.value);
		}).catch((e) => {
			console.error("Save failed:", e);
			statusText.value = "Save failed";
		});
	} else if (platform.value === "web") {
		try {
			localStorage.setItem("span-workspace", data);
			markDirty(false);
		} catch (e) {
			console.error("localStorage save failed:", e);
		}
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
	const shapes = getShapesForEntity(entity);
	const shapeType = shapes[0]?.shapeType;

	let size: { width?: number; height?: number; radius?: number } = {};
	if (shapeType === "rect") {
		size = { width: sizeArgs[0], height: sizeArgs[1] };
	} else if (shapeType === "circle") {
		size = { radius: sizeArgs[0] };
	}

	const annotation = createAnnotationWithSize(spec, entityType, { x, y }, size);
	sheet.annotations.push(annotation);
	selectedId.value = annotation.id;
	markDirty(true);
}

export function duplicateSelected() {
	const ann = selectedAnnotation.value;
	const spec = activeSpec.value;
	const sheet = currentSheet.value;
	if (!ann || !spec || !sheet) return;
	const copy = duplicateAnnotation(ann, spec);
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
	const shapeData = ann.shapes[shapeName];
	if (!shapeData) return;
	Object.assign(shapeData, patch);
	markDirty(true);
}

export function updatePropertyData(patch: Record<string, unknown>) {
	const ann = selectedAnnotation.value;
	if (!ann) return;
	Object.assign(ann.propertyData, patch);
	markDirty(true);
}

export function clampAnnotationToImage(
	annotation: Annotation,
	imgW: number = imageWidth.value,
	imgH: number = imageHeight.value,
) {
	const spec = activeSpec.value;
	if (!spec) return;
	clampToImage(annotation, spec, imgW, imgH);
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
	activeTool.value = "";
	statusText.value = "Spec loaded";
}

// --- Export ---

export async function exportWorkspace() {
	const spec = activeSpec.value;
	if (!spec) {
		statusText.value = "No spec loaded — cannot export";
		return;
	}

	const allAnnotations = sheets.value.flatMap((s) => s.annotations);
	const output = exportToString(allAnnotations, spec, effectiveRoot.value);

	const ext = spec.format === "yaml" ? "yaml" : "json";
	const defaultName = `annotations.${ext}`;

	const path = await api.showSaveDialog(defaultName, [
		{ name: `${ext.toUpperCase()} files`, extensions: [ext] },
	]);

	if (!path) return; // user cancelled

	try {
		await api.writeFile(path, output);
		statusText.value = `Exported to ${path}`;
	} catch (e) {
		console.error("Export failed:", e);
		statusText.value = "Export failed";
	}
}

// --- Save / Save As / Open ---

export async function saveWorkspace() {
	if (!spanFilePath.value) {
		return saveWorkspaceAs();
	}
	performSave();
}

export async function saveWorkspaceAs(dialogPath?: string) {
	const path = dialogPath ?? await api.showSaveDialog("workspace.span", [
		{ name: "Span files", extensions: ["span"] },
	]);
	if (!path) return;

	const savePath = path.endsWith(".span") ? path : path + ".span";
	spanFilePath.value = savePath;

	const data = serializeWorkspace(
		sheets.value,
		specFilePath.value,
		effectiveRoot.value,
		savePath.replace(/\/[^/]+$/, ""),
	);

	try {
		await api.writeFile(savePath, data);
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

	// Resolve spec path relative to .span file directory
	let specPath = data.spec;
	if (filePath && specPath && !specPath.startsWith("/")) {
		const dir = filePath.replace(/\/[^/]+$/, "");
		specPath = dir + "/" + specPath;
	}

	// Load spec
	try {
		const specRaw = await api.readFile(specPath);
		const format = specPath.endsWith(".json") ? "json" : "yaml" as const;
		loadSpec(specRaw, format);
		specFilePath.value = specPath;
	} catch (e) {
		console.error("Failed to load spec from .span file:", e);
		statusText.value = "Failed to load spec referenced by .span file";
		return;
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

		try {
			const dataUrl = await api.readImageAsDataUrl(imgPath);
			// Get image dimensions
			const dims = await new Promise<{ width: number; height: number }>((resolve) => {
				const img = new Image();
				img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
				img.onerror = () => resolve({ width: 0, height: 0 });
				img.src = dataUrl;
			});

			addSheet({
				path: sheet.path,
				absolutePath: imgPath,
				annotations: sheet.annotations,
				status: "loaded",
				imageUrl: dataUrl,
				width: dims.width,
				height: dims.height,
			});
		} catch (e) {
			console.error(`Failed to load sheet image: ${imgPath}`, e);
		}
	}

	markDirty(false);
	statusText.value = filePath
		? `Opened ${filePath.split("/").pop()}`
		: "Workspace restored";
}
