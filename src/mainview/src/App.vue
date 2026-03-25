<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import { DockviewVue } from "dockview-vue";
import type { DockviewReadyEvent, DockviewApi } from "dockview-core";
import {
	dirty,
	statusText,
	duplicateSelected,
	deleteSelected,
	activeSpec,
	sheets,
	addSheet,
	loadSpec,
	exportWorkspace,
	restoreWorkspace,
} from "./state";
import { parseSpec } from "./spec/parse";
import { api, setResetLayoutHandler, setAddPanelHandler } from "./platform/adapter";

const PANELS: Record<string, { component: string; title: string }> = {
	sheets: { component: "sheets", title: "Sheets" },
	"sprite-canvas": { component: "sprite-canvas", title: "Canvas" },
	inspector: { component: "inspector", title: "Inspector" },
	annotations: { component: "annotations", title: "Sprites In Sheet" },
	gallery: { component: "gallery", title: "Gallery" },
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

async function handleDroppedFiles(files: File[]) {
	for (const file of files) {
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
					missing.imageUrl = dataUrl;
					missing.width = dims.width;
					missing.height = dims.height;
					missing.status = "loaded";
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

function onKeydown(event: KeyboardEvent) {
	const mod = event.ctrlKey || event.metaKey;
	const tag = (document.activeElement?.tagName ?? "").toUpperCase();
	const inInput =
		tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

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
				<span v-if="!activeSpec" class="text-danger shrink-0">No spec file</span>
			</div>
		</div>
	</div>
</template>
