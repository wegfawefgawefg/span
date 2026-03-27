<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import { DockviewVue } from "dockview-vue";
import type { DockviewReadyEvent, DockviewApi } from "dockview-core";
import {
	dirty,
	statusText,
	duplicateSelected,
	deleteSelected,
	addAnnotationAtViewportCenter,
	activeSpec,
	sheets,
	addSheet,
	fulfillSheet,
	loadSpec,
	saveWorkspace,
	saveWorkspaceAs,
	openWorkspace,
	exportWorkspace,
	importSpecFromPath,
	importSheetFromPath,
	restoreWorkspace,
} from "./state";
import { parseSpec } from "./spec/parse";
import { api, platform, setResetLayoutHandler, setAddPanelHandler, getResetLayoutHandler, getAddPanelHandler } from "./platform/adapter";
import MenuBar from "./components/MenuBar.vue";

const PANELS: Record<string, { component: string; title: string }> = {
	sheets: { component: "sheets", title: "Sheets" },
	"sprite-canvas": { component: "sprite-canvas", title: "Canvas" },
	inspector: { component: "inspector", title: "Inspector" },
	annotations: { component: "annotations", title: "Sprites In Sheet" },
	gallery: { component: "gallery", title: "Gallery" },
	"spec-editor": { component: "spec-editor", title: "Spec Editor" },
};

let dockviewApi: DockviewApi | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const statusFlash = ref(false);

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

async function handleImportSheet() {
	const path = await api.showOpenDialog([
		{ name: "Images", extensions: ["png", "jpg", "gif", "webp"] },
	]);
	if (!path) return;
	await importSheetFromPath(path);
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

	dv.addPanel({
		id: "annotations",
		component: "annotations",
		title: "Sprites In Sheet",
		position: { referencePanel: inspectorPanel, direction: "below" },
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
		debouncedSaveLayout();
	});

	setResetLayoutHandler(() => {
		if (!dockviewApi) return;
		dockviewApi.clear();
		applyDefaultLayout(dockviewApi);
	});

	setAddPanelHandler((panelId: string) => {
		if (!dockviewApi) return;
		const def = PANELS[panelId];
		if (!def) return;

		// If panel already exists, focus it
		const existing = dockviewApi.getPanel(panelId);
		if (existing) {
			existing.focus();
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
	});
}

async function handleMenuAction(action: string) {
	if (action === "open") {
		await openWorkspace();
	} else if (action === "save") {
		const result = await saveWorkspace();
		if (result.needsSaveAs) {
			await saveWorkspaceAs();
		}
	} else if (action === "saveAs") {
		await saveWorkspaceAs();
	} else if (action === "importSpec") {
		await handleImportSpec();
	} else if (action === "importSheet") {
		await handleImportSheet();
	} else if (action === "export") {
		await exportWorkspace();
	} else if (action === "addAnnotation") {
		addAnnotationAtViewportCenter();
	} else if (action === "duplicateAnnotation") {
		duplicateSelected();
	} else if (action === "deleteAnnotation") {
		deleteSelected();
	} else if (action === "resetLayout") {
		getResetLayoutHandler()();
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

	if (mod && event.key.toLowerCase() === "o") {
		event.preventDefault();
		handleMenuAction("open");
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

	if (
		(event.key === "Delete" || event.key === "Backspace") &&
		!inInput
	) {
		event.preventDefault();
		deleteSelected();
	}
}

onMounted(() => {
	window.addEventListener("keydown", onKeydown);
	document.addEventListener("dragover", onGlobalDragOver);
	document.addEventListener("drop", onGlobalDrop);
});

onUnmounted(() => {
	window.removeEventListener("keydown", onKeydown);
	document.removeEventListener("dragover", onGlobalDragOver);
	document.removeEventListener("drop", onGlobalDrop);
	if (saveTimeout) clearTimeout(saveTimeout);
});
</script>

<template>
	<div class="app-shell" @contextmenu.prevent>
		<MenuBar v-if="platform === 'web'" @action="handleMenuAction" />
		<div class="dockview-theme-dark dockview-container">
			<DockviewVue @ready="onReady" />
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
			</div>
		</div>
	</div>
</template>
