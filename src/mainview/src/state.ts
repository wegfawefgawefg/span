import { computed, ref, triggerRef } from "vue";
import type { Annotation, Sheet, SheetWithAnnotations } from "./types";
import { makeId, normalizeAnnotation } from "./types";
import { api, setCanCloseHandler, setMenuHandlers } from "./rpc";

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 12;
export const ZOOM_FACTOR = 1.15;

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
export const colorPickArmed = ref(false);
export const statusText = ref("Loading sheets\u2026");
export const currentSheetImageSrc = ref<string>("");
export const imageWidth = ref(0);
export const imageHeight = ref(0);

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

// --- Dirty guard for quit ---

setCanCloseHandler(() => {
	if (!dirty.value) return true;
	return window.confirm("You have unsaved changes. Quit without saving?");
});

// --- Menu handlers ---

setMenuHandlers({
	addSprite: () => {
		const center = getViewportCenter();
		addAnnotation(center.x, center.y);
	},
	duplicateSprite: () => duplicateSelected(),
	deleteSprite: () => deleteSelected(),
	triggerSave: () => {
		saveCurrentAnnotations().catch((e) => {
			console.error(e);
			statusText.value = "Save failed \u2014 check disk permissions";
		});
	},
});

// --- Actions ---

export function selectAnnotation(id: string | null) {
	selectedId.value = id;
	colorPickArmed.value = false;
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
	record.annotations = annotations.value.map((a) =>
		normalizeAnnotation(a as unknown as Record<string, unknown>),
	);
	// Force Vue to notice the deep mutation so gallery recomputes
	triggerRef(projectSheets);
}

export async function loadProjectData() {
	statusText.value = "Loading sheets\u2026";
	const prevFile = currentSheet.value?.file ?? null;
	const prevSelection = selectedId.value;
	const result = await api.getProjectAnnotations();
	projectSheets.value = result.map((s) => ({
		...s,
		annotations: s.annotations.map((a) =>
			normalizeAnnotation(a as unknown as Record<string, unknown>),
		),
	}));

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
	annotations.value = record.annotations.map((a) =>
		normalizeAnnotation(a as unknown as Record<string, unknown>),
	);
	selectedId.value =
		selectId && annotations.value.some((a) => a.id === selectId)
			? selectId
			: (annotations.value[0]?.id ?? null);
	markDirty(false);

	currentSheetImageSrc.value = await api.getSheetImage(file);
}

export function addAnnotation(
	viewportCenterX: number = 0,
	viewportCenterY: number = 0,
) {
	const w = Math.min(16, imageWidth.value || 16);
	const h = Math.min(16, imageHeight.value || 16);
	const x = Math.max(0, Math.round(viewportCenterX - w / 2));
	const y = Math.max(0, Math.round(viewportCenterY - h / 2));
	const annotation: Annotation = {
		id: makeId(),
		name: "new_sprite",
		type: "sprite",
		frame: 0,
		x,
		y,
		width: w,
		height: h,
		direction: "",
		variant: "",
		chroma_key: "",
		tags: "",
		notes: "",
	};
	annotations.value.push(annotation);
	selectedId.value = annotation.id;
	markDirty(true);
	syncCurrentSheetIntoProject();
}

export function duplicateSelected() {
	const ann = selectedAnnotation.value;
	if (!ann) return;
	const copy: Annotation = {
		...ann,
		id: makeId(),
		frame: ann.frame + 1,
		x: ann.x + 4,
		y: ann.y + 4,
	};
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

export function updateSelectedAnnotation(patch: Partial<Annotation>) {
	const ann = selectedAnnotation.value;
	if (!ann) return;
	Object.assign(ann, patch);
	markDirty(true);
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
	annotation.frame = Math.max(0, Math.round(annotation.frame));
	annotation.x = Math.max(0, Math.round(annotation.x));
	annotation.y = Math.max(0, Math.round(annotation.y));
	annotation.width = Math.max(1, Math.round(annotation.width));
	annotation.height = Math.max(1, Math.round(annotation.height));
	annotation.width = Math.min(annotation.width, imgW);
	annotation.height = Math.min(annotation.height, imgH);
	annotation.x = Math.min(annotation.x, Math.max(0, imgW - annotation.width));
	annotation.y = Math.min(
		annotation.y,
		Math.max(0, imgH - annotation.height),
	);
}
