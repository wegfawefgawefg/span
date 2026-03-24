import { computed, ref, triggerRef } from "vue";
import type { Sheet, SheetWithAnnotations } from "./types";
import type { Annotation } from "./annotation";
import { createAnnotation, duplicateAnnotation, clampToImage, getShapePosition } from "./annotation";
import type { SpanSpec } from "./spec/types";
import { makeId } from "./types";
import { api } from "./platform/adapter";

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 32;
export const ZOOM_STEP = 0.1;

// --- Core state ---

export const projectSheets = ref<SheetWithAnnotations[]>([]);
export const sheets = computed<Sheet[]>(() =>
	projectSheets.value.map(({ annotations, ...sheet }) => sheet),
);
export const currentSheet = ref<SheetWithAnnotations | null>(null);
export const annotations = ref<Annotation[]>([]);
export const selectedId = ref<string | null>(null);
export const zoom = ref(2);
export const dirty = ref(false);
export const statusText = ref("Loading sheets\u2026");
export const currentSheetImageSrc = ref<string>("");
export const imageWidth = ref(0);
export const imageHeight = ref(0);

export const activeSpec = ref<SpanSpec | null>(null);
export const activeTool = ref<string>("");

// --- Derived ---

export const selectedAnnotation = computed<Annotation | null>(
	() => annotations.value.find((a) => a.id === selectedId.value) ?? null,
);

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

// --- Actions ---

export function selectAnnotation(id: string | null) {
	selectedId.value = id;
}

export function markDirty(isDirty: boolean) {
	dirty.value = isDirty;
	if (!currentSheet.value) {
		statusText.value = isDirty ? "Unsaved changes" : "No changes";
		return;
	}
	statusText.value = `${currentSheet.value.file} \u2022 ${isDirty ? "Unsaved changes" : "Saved"}`;
}

function syncCurrentSheetIntoProject() {
	const sheet = currentSheet.value;
	if (!sheet) return;
	const record = projectSheets.value.find((s) => s.file === sheet.file);
	if (!record) return;
	record.annotations = [...annotations.value];
	// Force Vue to notice the deep mutation so gallery recomputes
	triggerRef(projectSheets);
}

export async function loadProjectData() {
	statusText.value = "Loading sheets\u2026";
	const prevFile = currentSheet.value?.file ?? null;
	const prevSelection = selectedId.value;
	const result = await api.getProjectAnnotations();
	projectSheets.value = result.map((s) => ({ ...s }));

	if (prevFile && projectSheets.value.some((s) => s.file === prevFile)) {
		await openSheet(prevFile, prevSelection);
	} else if (projectSheets.value.length > 0) {
		await openSheet(projectSheets.value[0].file);
	}
}

export async function openSheet(
	file: string,
	selectId: string | null = null,
) {
	if (currentSheet.value?.file !== file && dirty.value) {
		if (!window.confirm("Discard unsaved changes to this sheet?")) {
			return;
		}
	}

	const record = projectSheets.value.find((s) => s.file === file);
	if (!record) return;

	currentSheet.value = record;
	annotations.value = [...record.annotations];
	selectedId.value =
		selectId && annotations.value.some((a) => a.id === selectId)
			? selectId
			: (annotations.value[0]?.id ?? null);
	markDirty(false);

	currentSheetImageSrc.value = await api.getSheetImage(file);
}

export function addAnnotation(x: number = 0, y: number = 0) {
	const spec = activeSpec.value;
	const tool = activeTool.value;
	if (!spec || !tool || !spec.entities[tool]) return;

	const annotation = createAnnotation(spec, tool, { x, y });
	annotations.value.push(annotation);
	selectedId.value = annotation.id;
	markDirty(true);
	syncCurrentSheetIntoProject();
}

export function duplicateSelected() {
	const ann = selectedAnnotation.value;
	const spec = activeSpec.value;
	if (!ann || !spec) return;
	const copy = duplicateAnnotation(ann, spec);
	annotations.value.push(copy);
	selectedId.value = copy.id;
	markDirty(true);
	syncCurrentSheetIntoProject();
}

export function deleteSelected() {
	if (!selectedId.value) return;
	annotations.value = annotations.value.filter(
		(a) => a.id !== selectedId.value,
	);
	selectedId.value = annotations.value[0]?.id ?? null;
	markDirty(true);
	syncCurrentSheetIntoProject();
}

export function updateShapeData(patch: Record<string, number>) {
	const ann = selectedAnnotation.value;
	if (!ann) return;
	Object.assign(ann.shapeData, patch);
	markDirty(true);
	triggerRef(annotations);
	syncCurrentSheetIntoProject();
}

export function updatePropertyData(patch: Record<string, unknown>) {
	const ann = selectedAnnotation.value;
	if (!ann) return;
	Object.assign(ann.propertyData, patch);
	markDirty(true);
	triggerRef(annotations);
	syncCurrentSheetIntoProject();
}

export async function saveCurrentAnnotations() {
	const sheet = currentSheet.value;
	if (!sheet) return;
	statusText.value = `Saving ${sheet.file}\u2026`;
	await api.saveAnnotations(
		sheet.file,
		annotations.value.map((a) => ({ ...a })),
	);
	syncCurrentSheetIntoProject();
	markDirty(false);
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
