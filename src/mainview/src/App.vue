<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from "vue";
import { DockviewVue } from "dockview-vue";
import type { DockviewReadyEvent, DockviewApi } from "dockview-core";
import { getTheme, THEME_STORAGE_KEY } from "./themes";
import {
	dirty,
	statusText,
	effectiveRoot,
	currentSheet,
	copyPixelSelection,
	cutPixelSelection,
	duplicateSelected,
	deletePixelSelection,
	deleteSelected,
	addAnnotationAtViewportCenter,
	sheets,
	addSheet,
	fulfillSheet,
	closeProject,
	saveWorkspace,
	saveWorkspaceAs,
	exportWorkspace,
	exportSpec,
	importPaletteFromPath,
	importSheetFromPath,
	pastePixelSelection,
	getCurrentSheetCanvasSize,
	resizeCurrentSheetCanvas,
	restoreWorkspace,
} from "./state";
import { loadSpec, importSpecFromPath } from "./state/specState";
import {
	hasUnsavedImageEdits,
	redoPaintEdit,
	undoPaintEdit,
} from "./state/paintHistory";
import { parseSpec } from "./spec/parse";
import { api, platform, setResetLayoutHandler, setAddPanelHandler, getResetLayoutHandler, getAddPanelHandler, setSetThemeHandler } from "./platform/adapter";
import MenuBar from "./components/MenuBar.vue";

const PANELS: Record<string, { component: string; title: string }> = {
	sheets: { component: "sheets", title: "Sheets" },
	"sprite-canvas": { component: "sprite-canvas", title: "Canvas" },
	paint: { component: "paint", title: "Paint" },
	inspector: { component: "inspector", title: "Inspector" },
	annotations: { component: "annotations", title: "Sprites In Sheet" },
	gallery: { component: "gallery", title: "Gallery" },
	"spec-editor": { component: "spec-editor", title: "Spec Editor" },
};

let dockviewApi: DockviewApi | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const statusFlash = ref(false);
const panelStateVersion = ref(0);
const currentThemeId = ref(localStorage.getItem(THEME_STORAGE_KEY) ?? "whisper");
const currentTheme = computed(() => getTheme(currentThemeId.value));

const IMAGE_EXTS = /\.(png|jpg|jpeg|gif|webp)$/i;
const SPEC_EXTS = /\.(ya?ml|json)$/i;
const SPAN_EXT = /\.span$/i;

// Flash the status bar briefly on save (dirty goes true → false)
watch(dirty, (now, was) => {
	if (was && !now) {
		statusFlash.value = true;
		setTimeout(() => { statusFlash.value = false; }, 600);
	}
});

function debouncedSaveLayout() {
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = setTimeout(async () => {
		if (!dockviewApi) return;
		const layout = dockviewApi.toJSON();
		try {
			await api.saveLayout(layout);
		} catch (e) {
			console.error("Failed to save layout", e);
		}
	}, 500);
}

function bumpPanelStateVersion() {
	panelStateVersion.value += 1;
}

function setTheme(id: string) {
	currentThemeId.value = id;
	localStorage.setItem(THEME_STORAGE_KEY, id);
}

function isPanelOpen(panelId: string): boolean {
	void panelStateVersion.value;
	return !!dockviewApi?.getPanel(panelId);
}

function normalizeWheelDelta(delta: number, mode: number): number {
	if (mode === WheelEvent.DOM_DELTA_LINE) return delta * 16;
	if (mode === WheelEvent.DOM_DELTA_PAGE) return delta * window.innerHeight;
	return delta;
}

function getInstantScroller(target: EventTarget | null): HTMLElement | null {
	if (!(target instanceof Element)) return null;
	return target.closest(".instant-scroll");
}

function onGlobalWheel(event: WheelEvent) {
	if (event.defaultPrevented || event.ctrlKey) return;

	const scroller = getInstantScroller(event.target);
	if (!scroller) return;

	const canScrollY = scroller.scrollHeight > scroller.clientHeight;
	const canScrollX = scroller.scrollWidth > scroller.clientWidth;
	if (!canScrollY && !canScrollX) return;

	const deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode);
	const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode);
	const dominantAxis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";

	event.preventDefault();

	if (dominantAxis === "x" && canScrollX) {
		scroller.scrollLeft += deltaX;
		return;
	}

	if (canScrollY) {
		scroller.scrollTop += deltaY;
		return;
	}

	if (canScrollX) {
		scroller.scrollLeft += deltaX !== 0 ? deltaX : deltaY;
	}
}

// --- File handling (images, specs, .span) ---

async function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

async function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
		img.onerror = () => resolve({ width: 0, height: 0 });
		img.src = dataUrl;
	});
}

async function handleImportSpec() {
	const path = await api.showOpenDialog([
		{ name: "Spec files", extensions: ["yaml", "yml", "json"] },
	]);
	if (!path) return;
	await importSpecFromPath(path);
}

async function handleImportPalette() {
	const path = await api.showOpenDialog([
		{ name: "Palette files", extensions: ["hex", "txt"] },
	]);
	if (!path) return;
	await importPaletteFromPath(path);
}

async function handleImportSheet() {
	const path = await api.showOpenDialog([
		{ name: "Images", extensions: ["png", "jpg", "gif", "webp"] },
	]);
	if (!path) return;
	await importSheetFromPath(path);
}

function handleResizeCanvas() {
	const currentSize = getCurrentSheetCanvasSize();
	resizeCanvasWidth.value = String(currentSize.width);
	resizeCanvasHeight.value = String(currentSize.height);
	showResizeCanvasDialog.value = true;
}

function closeResizeCanvasDialog() {
	showResizeCanvasDialog.value = false;
}

const showResizeCanvasDialog = ref(false);
const resizeCanvasWidth = ref("0");
const resizeCanvasHeight = ref("0");

const currentCanvasSize = computed(() => getCurrentSheetCanvasSize());
const parsedResizeWidth = computed(() => Math.max(1, Math.round(Number(resizeCanvasWidth.value) || 0)));
const parsedResizeHeight = computed(() => Math.max(1, Math.round(Number(resizeCanvasHeight.value) || 0)));

const resizeCanvasImpact = computed(() => {
	const width = parsedResizeWidth.value;
	const height = parsedResizeHeight.value;
	let affected = 0;
	let fullyOutside = 0;
	for (const annotation of currentSheet.value?.annotations ?? []) {
		if (!annotation.aabb) continue;
		const outside = annotation.aabb.x >= width || annotation.aabb.y >= height;
		const clipped =
			outside ||
			annotation.aabb.x + annotation.aabb.w > width ||
			annotation.aabb.y + annotation.aabb.h > height;
		if (clipped) affected += 1;
		if (outside) fullyOutside += 1;
	}
	return { affected, fullyOutside };
});

function applyResizeCanvasDialog() {
	const width = parsedResizeWidth.value;
	const height = parsedResizeHeight.value;
	const changed = resizeCurrentSheetCanvas(width, height);
	if (!changed) {
		statusText.value = "Resize canvas failed";
		return;
	}
	closeResizeCanvasDialog();
}

function onOpenResizeCanvasDialog() {
	const currentSize = getCurrentSheetCanvasSize();
	if (currentSize.width < 1 || currentSize.height < 1) return;
	handleResizeCanvas();
}

async function handleOpenFolder() {
	if (platform.value !== "desktop") return;
	await api.importImageDirectory("Select image folder");
}

function handleCloseProject() {
	if (sheets.value.length === 0) return;
	const hasUnsaved = dirty.value || hasUnsavedImageEdits.value;
	const confirmed = hasUnsaved
		? window.confirm("Close the current project? Unsaved changes may be lost.")
		: window.confirm("Close the current project?");
	if (!confirmed) return;
	closeProject();
}

async function handleDroppedFiles(files: File[]) {
	// Sort: process images first, then specs, then .span files last.
	// This ensures images are available when the .span file restores and looks for them.
	const spanFiles: File[] = [];
	const specFiles: File[] = [];
	const imageFiles: File[] = [];
	const other: File[] = [];

	for (const file of files) {
		const name = file.name;
		if (SPAN_EXT.test(name)) spanFiles.push(file);
		else if (SPEC_EXTS.test(name)) specFiles.push(file);
		else if (IMAGE_EXTS.test(name)) imageFiles.push(file);
		else other.push(file);
	}

	// Register all files in the platform adapter so readFile/readImageAsDataUrl can find them (web)
	for (const file of files) {
		api.registerFile?.(file.name, file);
	}

	// Process .span first (creates missing sheets), then specs, then images (fulfill missing sheets).
	const ordered = [...spanFiles, ...specFiles, ...imageFiles, ...other];

	for (const file of ordered) {
		const name = file.name;

		if (SPAN_EXT.test(name)) {
			try {
				const text = await file.text();
				await restoreWorkspace(text);
			} catch (e) {
				console.error("Failed to read .span file:", e);
				statusText.value = "Failed to read .span file";
			}
			continue;
		}

		if (SPEC_EXTS.test(name)) {
			try {
				const text = await file.text();
				const format = name.endsWith(".json") ? "json" : "yaml";
				const result = parseSpec(text, format);
				if (Array.isArray(result)) {
					console.error("Spec parse errors:", result);
					statusText.value = `Spec errors: ${result.map((e) => e.message).join("; ")}`;
				} else {
					loadSpec(text, format);
				}
			} catch (e) {
				console.error("Failed to read spec file:", e);
				statusText.value = "Failed to read spec file";
			}
			continue;
		}

		if (IMAGE_EXTS.test(name)) {
			try {
				const dataUrl = await fileToDataUrl(file);
				const dims = await loadImageDimensions(dataUrl);

				// Check if this fulfills a missing sheet
				const missing = sheets.value.find(
					(s) => s.status === "missing" && s.path.split("/").pop() === name,
				);
				if (missing) {
					fulfillSheet(missing, dataUrl, dims.width, dims.height);
				} else {
					addSheet({
						path: name,
						absolutePath: name,
						annotations: [],
						status: "loaded",
						imageUrl: dataUrl,
						width: dims.width,
						height: dims.height,
					});
				}
			} catch (e) {
				console.error("Failed to load image:", e);
				statusText.value = "Failed to load image";
			}
			continue;
		}
	}
}

// --- Global drag-and-drop ---

function onGlobalDragOver(e: DragEvent) {
	e.preventDefault();
}

function onGlobalDrop(e: DragEvent) {
	e.preventDefault();
	const dt = e.dataTransfer;
	if (!dt?.files?.length) return;
	handleDroppedFiles(Array.from(dt.files));
}

// --- Dockview ---

function applyDefaultLayout(dv: DockviewApi) {
	const sheetsPanel = dv.addPanel({
		id: "sheets",
		component: "sheets",
		title: "Sheets",
	});

	const canvasPanel = dv.addPanel({
		id: "sprite-canvas",
		component: "sprite-canvas",
		title: "Canvas",
		position: { referencePanel: sheetsPanel, direction: "right" },
	});

	const inspectorPanel = dv.addPanel({
		id: "inspector",
		component: "inspector",
		title: "Inspector",
		position: { referencePanel: canvasPanel, direction: "right" },
	});

	const paintPanel = dv.addPanel({
		id: "paint",
		component: "paint",
		title: "Paint",
		position: { referencePanel: inspectorPanel, direction: "below" },
	});

	dv.addPanel({
		id: "annotations",
		component: "annotations",
		title: "Sprites In Sheet",
		position: { referencePanel: paintPanel, direction: "below" },
	});

	dv.addPanel({
		id: "gallery",
		component: "gallery",
		title: "Gallery",
		position: { referencePanel: canvasPanel, direction: "below" },
	});

	sheetsPanel.group?.api.setSize({ width: 280 });
	inspectorPanel.group?.api.setSize({ width: 340 });
}

async function onReady(event: DockviewReadyEvent) {
	dockviewApi = event.api;

	try {
		const saved = await api.loadLayout();
		if (saved) {
			event.api.fromJSON(saved as any);
		} else {
			applyDefaultLayout(event.api);
		}
	} catch {
		applyDefaultLayout(event.api);
	}

	event.api.onDidLayoutChange(() => {
		bumpPanelStateVersion();
		debouncedSaveLayout();
	});

	setResetLayoutHandler(() => {
		if (!dockviewApi) return;
		dockviewApi.clear();
		applyDefaultLayout(dockviewApi);
		bumpPanelStateVersion();
	});

	setAddPanelHandler((panelId: string) => {
		if (!dockviewApi) return;
		const def = PANELS[panelId];
		if (!def) return;

		// If panel already exists, focus it
		const existing = dockviewApi.getPanel(panelId);
		if (existing) {
			existing.focus();
			bumpPanelStateVersion();
			return;
		}

		// Add to the active group, or create standalone if no active group
		const activeGroup = dockviewApi.activeGroup;
		dockviewApi.addPanel({
			id: panelId,
			component: def.component,
			title: def.title,
			...(activeGroup
				? { position: { referenceGroup: activeGroup } }
				: {}),
		});
		bumpPanelStateVersion();
	});

	setSetThemeHandler((themeId: string) => setTheme(themeId));
}

async function handleMenuAction(action: string) {
	if (action === "openFolder") {
		await handleOpenFolder();
	} else if (action === "reloadWindow") {
		window.location.reload();
	} else if (action === "save") {
		const result = await saveWorkspace();
		if (result.needsSaveAs) {
			await saveWorkspaceAs();
		}
	} else if (action === "saveAs") {
		await saveWorkspaceAs();
	} else if (action === "importSpec") {
		await handleImportSpec();
	} else if (action === "exportSpec") {
		await exportSpec();
	} else if (action === "importPalette") {
		await handleImportPalette();
	} else if (action === "importSheet") {
		await handleImportSheet();
	} else if (action === "closeProject") {
		handleCloseProject();
	} else if (action === "export") {
		await exportWorkspace();
	} else if (action === "addAnnotation") {
		addAnnotationAtViewportCenter();
	} else if (action === "duplicateAnnotation") {
		duplicateSelected();
	} else if (action === "deleteAnnotation") {
		deleteSelected();
	} else if (action === "undo") {
		undoPaintEdit();
	} else if (action === "redo") {
		redoPaintEdit();
	} else if (action === "copyPixels") {
		copyPixelSelection();
	} else if (action === "cutPixels") {
		cutPixelSelection();
	} else if (action === "pastePixels") {
		pastePixelSelection();
	} else if (action === "deletePixels") {
		deletePixelSelection();
	} else if (action === "resizeCanvas") {
		handleResizeCanvas();
	} else if (action === "resetLayout") {
		getResetLayoutHandler()();
	} else if (action.startsWith("setTheme:")) {
		setTheme(action.slice("setTheme:".length));
	} else if (action.startsWith("addPanel:")) {
		getAddPanelHandler()(action.slice("addPanel:".length));
	}
}

function onKeydown(event: KeyboardEvent) {
	const mod = event.ctrlKey || event.metaKey;
	const tag = (document.activeElement?.tagName ?? "").toUpperCase();
	const inInput =
		tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

	if (mod && event.key.toLowerCase() === "s" && !event.shiftKey) {
		event.preventDefault();
		handleMenuAction("save");
		return;
	}

	if (mod && event.shiftKey && event.key.toLowerCase() === "s") {
		event.preventDefault();
		handleMenuAction("saveAs");
		return;
	}

	if (mod && event.key.toLowerCase() === "o" && !event.shiftKey) {
		event.preventDefault();
		handleMenuAction("openFolder");
		return;
	}

	if ((event.key === "F5" || (mod && event.key.toLowerCase() === "r")) && !inInput) {
		event.preventDefault();
		handleMenuAction("reloadWindow");
		return;
	}

	if (event.key === "Escape" && showResizeCanvasDialog.value) {
		event.preventDefault();
		closeResizeCanvasDialog();
		return;
	}

	if (mod && event.key.toLowerCase() === "e" && !inInput) {
		event.preventDefault();
		exportWorkspace().catch((e) => {
			console.error(e);
			statusText.value = "Export failed";
		});
		return;
	}

	if (mod && event.key.toLowerCase() === "d" && !inInput) {
		event.preventDefault();
		duplicateSelected();
		return;
	}

	if (mod && event.key.toLowerCase() === "c" && !inInput) {
		if (copyPixelSelection()) {
			event.preventDefault();
			return;
		}
	}

	if (mod && event.key.toLowerCase() === "x" && !inInput) {
		if (cutPixelSelection()) {
			event.preventDefault();
			return;
		}
	}

	if (mod && event.key.toLowerCase() === "v" && !inInput) {
		if (pastePixelSelection()) {
			event.preventDefault();
			return;
		}
	}

	if (mod && event.key.toLowerCase() === "z" && !inInput) {
		event.preventDefault();
		if (event.shiftKey) {
			redoPaintEdit();
		} else {
			undoPaintEdit();
		}
		return;
	}

	if (mod && event.key.toLowerCase() === "y" && !inInput) {
		event.preventDefault();
		redoPaintEdit();
		return;
	}

	if (
		(event.key === "Delete" || event.key === "Backspace") &&
		!inInput
	) {
		if (deletePixelSelection()) {
			event.preventDefault();
			return;
		}
		event.preventDefault();
		deleteSelected();
	}
}

onMounted(() => {
	window.addEventListener("keydown", onKeydown);
	window.addEventListener("wheel", onGlobalWheel, { passive: false });
	window.addEventListener("span:open-resize-canvas-dialog", onOpenResizeCanvasDialog as EventListener);
	document.addEventListener("dragover", onGlobalDragOver);
	document.addEventListener("drop", onGlobalDrop);
});

onUnmounted(() => {
	window.removeEventListener("keydown", onKeydown);
	window.removeEventListener("wheel", onGlobalWheel);
	window.removeEventListener("span:open-resize-canvas-dialog", onOpenResizeCanvasDialog as EventListener);
	document.removeEventListener("dragover", onGlobalDragOver);
	document.removeEventListener("drop", onGlobalDrop);
	if (saveTimeout) clearTimeout(saveTimeout);
});
</script>

<template>
	<div :class="['app-shell', ...(currentTheme.cssClasses ?? [])]" @contextmenu.prevent>
		<MenuBar :is-panel-open="isPanelOpen" :current-theme-id="currentThemeId" @action="handleMenuAction" />
		<div class="dockview-container">
			<DockviewVue :theme="currentTheme.dockviewTheme" :class-name="(currentTheme.cssClasses ?? []).join(' ')" @ready="onReady" />
		</div>
		<div v-if="showResizeCanvasDialog" class="app-modal-backdrop">
			<form class="app-modal-card" @submit.prevent="applyResizeCanvasDialog">
				<div class="app-modal-title">Resize Canvas</div>
				<div class="app-modal-copy">
					<div>Current: {{ currentCanvasSize.width }} × {{ currentCanvasSize.height }}</div>
					<div>New space is transparent. Existing pixels stay top-left anchored.</div>
					<div v-if="resizeCanvasImpact.affected > 0">
						{{ resizeCanvasImpact.affected }} sprite box{{ resizeCanvasImpact.affected === 1 ? "" : "es" }} will be clamped into the new bounds.
					</div>
					<div v-if="resizeCanvasImpact.fullyOutside > 0">
						{{ resizeCanvasImpact.fullyOutside }} will end up pinned to the new edge because it would otherwise fall fully outside.
					</div>
				</div>
				<div class="app-modal-grid">
					<label class="app-modal-field">
						<span>Width</span>
						<input v-model="resizeCanvasWidth" type="number" min="1" step="1" autofocus />
					</label>
					<label class="app-modal-field">
						<span>Height</span>
						<input v-model="resizeCanvasHeight" type="number" min="1" step="1" />
					</label>
				</div>
				<div class="app-modal-actions">
					<button type="button" class="app-modal-button ghost" @click="closeResizeCanvasDialog">Cancel</button>
					<button type="submit" class="app-modal-button primary">Apply</button>
				</div>
			</form>
		</div>
		<div
			class="px-3 py-1 border-t text-[11px] font-mono truncate transition-all duration-300 ease-out"
			:class="
				statusFlash
					? 'border-copper/40 bg-copper-glow text-copper-bright'
					: 'border-border bg-surface-1 text-text-faint'
			"
		>
			<div class="flex justify-between">
				<span class="truncate">{{ statusText }}</span>
				<span
					v-if="effectiveRoot"
					class="ml-4 shrink-0 max-w-[45%] truncate text-right text-text-faint"
					:title="effectiveRoot"
				>
					{{ effectiveRoot }}
				</span>
			</div>
		</div>
	</div>
</template>
