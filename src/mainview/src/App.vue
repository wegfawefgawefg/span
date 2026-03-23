<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import SheetSidebar from "./components/SheetSidebar.vue";
import CanvasView from "./components/CanvasView.vue";
import Inspector from "./components/Inspector.vue";
import AnnotationList from "./components/AnnotationList.vue";
import GalleryPanel from "./components/GalleryPanel.vue";
import {
	zoom,
	dirty,
	statusText,
	selectedAnnotation,
	loadProjectData,
	addAnnotation,
	duplicateSelected,
	deleteSelected,
	saveCurrentAnnotations,
	colorPickArmed,
	updateSelectedAnnotation,
} from "./state";
import { ZOOM_FACTOR } from "./state";

const canvasView = ref<InstanceType<typeof CanvasView> | null>(null);
const imageWidth = ref(0);
const imageHeight = ref(0);

const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`);

function handleAdd() {
	const center = canvasView.value?.getViewportCenter() ?? { x: 0, y: 0 };
	addAnnotation(center.x, center.y, imageWidth.value, imageHeight.value);
}

async function handleSave() {
	try {
		await saveCurrentAnnotations();
	} catch (e) {
		console.error(e);
		statusText.value = "Save failed";
	}
}

function handleChromaSampled(color: string) {
	updateSelectedAnnotation({ chroma_key: color });
	colorPickArmed.value = false;
}

function onKeydown(event: KeyboardEvent) {
	const mod = event.ctrlKey || event.metaKey;
	const tag = (document.activeElement?.tagName ?? "").toUpperCase();
	const inInput =
		tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

	if (mod && event.key.toLowerCase() === "s") {
		event.preventDefault();
		handleSave();
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
});
</script>

<template>
	<div class="app">
		<SheetSidebar />

		<main class="workspace">
			<div class="toolbar">
				<div class="toolbar-group">
					<button type="button" @click="handleAdd">Add Sprite</button>
					<button
						type="button"
						:disabled="!selectedAnnotation"
						@click="duplicateSelected"
					>
						Duplicate
					</button>
					<button
						type="button"
						:disabled="!selectedAnnotation"
						@click="deleteSelected"
					>
						Delete
					</button>
					<button
						type="button"
						:disabled="!dirty"
						@click="handleSave"
					>
						Save
					</button>
				</div>
				<div class="toolbar-group">
					<button
						type="button"
						@click="canvasView?.handleZoomOut?.()"
					>
						-
					</button>
					<span class="zoom-label">{{ zoomLabel }}</span>
					<button
						type="button"
						@click="canvasView?.handleZoomIn?.()"
					>
						+
					</button>
					<span class="toolbar-help"
						>Wheel in the sheet view to zoom at the cursor.</span
					>
				</div>
				<div class="status-label">{{ statusText }}</div>
			</div>

			<CanvasView
				ref="canvasView"
				:image-width="imageWidth"
				:image-height="imageHeight"
				@chroma-sampled="handleChromaSampled"
				@image-loaded="
					(w: number, h: number) => {
						imageWidth = w;
						imageHeight = h;
					}
				"
			/>

			<GalleryPanel />
		</main>

		<aside class="inspector">
			<Inspector />
			<AnnotationList />
		</aside>
	</div>
</template>
