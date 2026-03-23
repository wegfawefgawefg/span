import { computed, ref } from "vue";
import type { Annotation, Sheet, SheetWithAnnotations } from "./types";
import { makeId, normalizeAnnotation } from "./types";
import { api, setCanCloseHandler } from "./rpc";

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

// --- Derived ---

export const selectedAnnotation = computed<Annotation | null>(
	() => annotations.value.find((a) => a.id === selectedId.value) ?? null,
);

// --- Dirty guard for quit ---

setCanCloseHandler(() => {
	if (!dirty.value) return true;
	return window.confirm("You have unsaved changes. Quit anyway?");
});

// --- Actions ---

export function selectAnnotation(id: string | null) {
	selectedId.value = id;
	colorPickArmed.value = false;
}

export function markDirty(isDirty: boolean) {
	dirty.value = isDirty;
	if (!currentSheet.value) {
		statusText.value = isDirty ? "Unsaved changes" : "Ready";
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
		if (!window.confirm("Discard unsaved changes on the current sheet?")) {
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
	viewportCenterX: number,
	viewportCenterY: number,
	imageWidth: number,
	imageHeight: number,
) {
	const w = Math.min(16, imageWidth || 16);
	const h = Math.min(16, imageHeight || 16);
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
	imageWidth: number,
	imageHeight: number,
) {
	annotation.frame = Math.max(0, Math.round(annotation.frame));
	annotation.x = Math.max(0, Math.round(annotation.x));
	annotation.y = Math.max(0, Math.round(annotation.y));
	annotation.width = Math.max(1, Math.round(annotation.width));
	annotation.height = Math.max(1, Math.round(annotation.height));
	annotation.width = Math.min(annotation.width, imageWidth);
	annotation.height = Math.min(annotation.height, imageHeight);
	annotation.x = Math.min(
		annotation.x,
		Math.max(0, imageWidth - annotation.width),
	);
	annotation.y = Math.min(
		annotation.y,
		Math.max(0, imageHeight - annotation.height),
	);
}
