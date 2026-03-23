<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { DockviewVue } from "dockview-vue";
import type { DockviewReadyEvent, DockviewApi } from "dockview-core";
import {
	statusText,
	loadProjectData,
	duplicateSelected,
	deleteSelected,
	saveCurrentAnnotations,
} from "./state";
import { api, setResetLayoutHandler } from "./rpc";

let dockviewApi: DockviewApi | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

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

function applyDefaultLayout(dv: DockviewApi) {
	const sheetsPanel = dv.addPanel({
		id: "sheets",
		component: "sheets",
		title: "Sheets",
	});

	const canvasPanel = dv.addPanel({
		id: "canvas",
		component: "canvas",
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
}

function onKeydown(event: KeyboardEvent) {
	const mod = event.ctrlKey || event.metaKey;
	const tag = (document.activeElement?.tagName ?? "").toUpperCase();
	const inInput =
		tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

	if (mod && event.key.toLowerCase() === "s") {
		event.preventDefault();
		saveCurrentAnnotations().catch((e) => {
			console.error(e);
			statusText.value = "Save failed";
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

onMounted(async () => {
	window.addEventListener("keydown", onKeydown);
	try {
		await loadProjectData();
	} catch (e) {
		console.error(e);
		statusText.value = "Startup failed";
	}
});

onUnmounted(() => {
	window.removeEventListener("keydown", onKeydown);
	if (saveTimeout) clearTimeout(saveTimeout);
});
</script>

<template>
	<div class="app-shell">
		<div class="dockview-theme-dark dockview-container">
			<DockviewVue @ready="onReady" />
		</div>
		<div class="px-3 py-1 border-t border-border bg-surface-1 text-text-faint text-[11px] font-mono truncate">
			{{ statusText }}
		</div>
	</div>
</template>
