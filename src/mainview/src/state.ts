import { computed, ref, watch } from "vue";
import type { Annotation } from "./annotation";
import { createAnnotation, duplicateAnnotation, clampToImage } from "./annotation";
import type { SpanSpec } from "./spec/types";
import { getEntityByLabel } from "./spec/types";
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
import { serializeWorkspace, debouncedSave } from "./persistence";
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
		}).catch((e) => {
			console.error("Autosave failed:", e);
			statusText.value = "Autosave failed";
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
	// Set first entity as active tool
	if (result.entities.length > 0) {
		activeTool.value = result.entities[0].label;
	}
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
