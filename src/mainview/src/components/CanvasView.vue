<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import type { Annotation } from "../types";
import {
	zoom,
	annotations,
	selectedId,
	selectAnnotation,
	colorPickArmed,
	currentSheetImageSrc,
	imageWidth,
	imageHeight,
	registerViewportCenterFn,
	updateSelectedAnnotation,
	addAnnotation,
	duplicateSelected,
	deleteSelected,
	selectedAnnotation,
} from "../state";
import { ZOOM_FACTOR } from "../state";
import { useCanvas } from "../composables/useCanvas";
import ContextMenu from "./ContextMenu.vue";
import type { MenuEntry } from "./ContextMenu.vue";

const scroller = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const sheetImg = ref<HTMLImageElement | null>(null);
const { zoomTo, startDrag, onPointerMove, endDrag } = useCanvas();

const stageWidth = computed(() => Math.round(imageWidth.value * zoom.value));
const stageHeight = computed(() => Math.round(imageHeight.value * zoom.value));
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`);

// Chroma sampling canvas
const sampleCanvas = document.createElement("canvas");
const sampleCtx = sampleCanvas.getContext("2d", {
	willReadFrequently: true,
})!;

// --- Panning state ---
const isPanning = ref(false);
const spaceHeld = ref(false);
let panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };

function onKeyDown(e: KeyboardEvent) {
	if (e.code === "Space") {
		const tag = (document.activeElement?.tagName ?? "").toUpperCase();
		if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
		e.preventDefault();
		spaceHeld.value = true;
	}
}

function onKeyUp(e: KeyboardEvent) {
	if (e.code === "Space") {
		spaceHeld.value = false;
		if (isPanning.value) {
			isPanning.value = false;
		}
	}
}

function handleScrollerPointerDown(event: PointerEvent) {
	// MMB (button 1) always pans
	// Space+LMB pans
	const isMMB = event.button === 1;
	const isSpaceLMB = spaceHeld.value && event.button === 0;

	if (!isMMB && !isSpaceLMB) return;

	event.preventDefault();
	event.stopPropagation();
	isPanning.value = true;

	const el = scroller.value!;
	panStart = {
		x: event.clientX,
		y: event.clientY,
		scrollLeft: el.scrollLeft,
		scrollTop: el.scrollTop,
	};

	el.setPointerCapture(event.pointerId);
}

function handleScrollerPointerMove(event: PointerEvent) {
	if (!isPanning.value) return;
	const el = scroller.value!;
	el.scrollLeft = panStart.scrollLeft - (event.clientX - panStart.x);
	el.scrollTop = panStart.scrollTop - (event.clientY - panStart.y);
}

function handleScrollerPointerUp(event: PointerEvent) {
	if (!isPanning.value) return;
	isPanning.value = false;
	scroller.value?.releasePointerCapture(event.pointerId);
}

onMounted(() => {
	registerViewportCenterFn(() => {
		const el = scroller.value;
		if (!el) return { x: 0, y: 0 };
		const x = (el.scrollLeft + el.clientWidth / 2) / zoom.value;
		const y = (el.scrollTop + el.clientHeight / 2) / zoom.value;
		return { x, y };
	});

	window.addEventListener("keydown", onKeyDown);
	window.addEventListener("keyup", onKeyUp);
});

onUnmounted(() => {
	window.removeEventListener("keydown", onKeyDown);
	window.removeEventListener("keyup", onKeyUp);
});

function onImageLoad() {
	const img = sheetImg.value;
	if (!img) return;
	imageWidth.value = img.naturalWidth;
	imageHeight.value = img.naturalHeight;
	sampleCanvas.width = img.naturalWidth;
	sampleCanvas.height = img.naturalHeight;
	sampleCtx.clearRect(0, 0, img.naturalWidth, img.naturalHeight);
	sampleCtx.drawImage(img, 0, 0);
}

function handleWheel(event: WheelEvent) {
	if (!imageWidth.value) return;
	event.preventDefault();
	const factor = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
	zoomTo(
		zoom.value * factor,
		scroller.value!,
		stage.value!,
		event.clientX,
		event.clientY,
	);
}

function handleZoomIn() {
	zoomTo(zoom.value * ZOOM_FACTOR, scroller.value!, stage.value!);
}

function handleZoomOut() {
	zoomTo(zoom.value / ZOOM_FACTOR, scroller.value!, stage.value!);
}

function handleBoxPointerDown(event: PointerEvent, annotation: Annotation) {
	if (isPanning.value || spaceHeld.value) return;
	event.preventDefault();
	event.stopPropagation();

	if (colorPickArmed.value) {
		sampleColorAt(event.clientX, event.clientY);
		return;
	}

	selectAnnotation(annotation.id);
	const target = event.target as HTMLElement;
	const isResize = target.dataset.resize === "true";
	startDrag(event, annotation, isResize);

	const box = event.currentTarget as HTMLElement;
	box.setPointerCapture(event.pointerId);
}

function handleBoxPointerMove(event: PointerEvent) {
	onPointerMove(event, imageWidth.value, imageHeight.value);
}

function handleBoxPointerUp(event: PointerEvent) {
	const box = event.currentTarget as HTMLElement;
	box.releasePointerCapture(event.pointerId);
	endDrag();
}

function handleLayerPointerDown(event: PointerEvent) {
	if (isPanning.value || spaceHeld.value) return;
	if (!colorPickArmed.value) return;
	event.preventDefault();
	event.stopPropagation();
	sampleColorAt(event.clientX, event.clientY);
}

function sampleColorAt(clientX: number, clientY: number) {
	const layer = stage.value;
	if (!layer) return;
	const rect = layer.getBoundingClientRect();
	const x = Math.floor((clientX - rect.left) / zoom.value);
	const y = Math.floor((clientY - rect.top) / zoom.value);
	if (x < 0 || y < 0 || x >= imageWidth.value || y >= imageHeight.value)
		return;

	const pixel = sampleCtx.getImageData(x, y, 1, 1).data;
	const hex = (v: number) => v.toString(16).padStart(2, "0");
	const color = `#${hex(pixel[0])}${hex(pixel[1])}${hex(pixel[2])}`;
	updateSelectedAnnotation({ chroma_key: color });
	colorPickArmed.value = false;
}

const ctxMenu = ref<InstanceType<typeof ContextMenu> | null>(null);

function onBoxContextMenu(event: MouseEvent, annotation: Annotation) {
	selectAnnotation(annotation.id);
	const entries: MenuEntry[] = [
		{ label: "Duplicate", action: () => duplicateSelected() },
		{ label: "Delete", action: () => deleteSelected() },
		{ separator: true },
		{
			label: "Pick chroma from sheet",
			action: () => { colorPickArmed.value = true; },
		},
	];
	ctxMenu.value?.show(event, entries);
}

function onCanvasContextMenu(event: MouseEvent) {
	const el = scroller.value;
	if (!el) return;
	const cx = (el.scrollLeft + el.clientWidth / 2) / zoom.value;
	const cy = (el.scrollTop + el.clientHeight / 2) / zoom.value;
	const entries: MenuEntry[] = [
		{
			label: "Add sprite here",
			action: () => addAnnotation(cx, cy),
		},
		{ separator: true },
		{
			label: "Pick chroma from sheet",
			action: () => { colorPickArmed.value = true; },
			disabled: !selectedAnnotation.value,
		},
	];
	ctxMenu.value?.show(event, entries);
}

function boxStyle(annotation: Annotation, index: number) {
	const isSelected = annotation.id === selectedId.value;
	return {
		left: `${annotation.x * zoom.value}px`,
		top: `${annotation.y * zoom.value}px`,
		width: `${annotation.width * zoom.value}px`,
		height: `${annotation.height * zoom.value}px`,
		zIndex: isSelected ? annotations.value.length + 10 : index + 1,
	};
}
</script>

<template>
	<div class="canvas-shell">
		<div
			class="absolute top-4 right-4 z-50 flex items-center gap-0.5 p-1 bg-surface-0/90 border border-border rounded-sm backdrop-blur-sm">
			<button type="button"
				class="w-6 h-6 flex items-center justify-center text-text-dim hover:text-copper border border-transparent hover:border-copper/40 rounded-sm transition-colors cursor-pointer bg-transparent text-xs font-mono"
				@click="handleZoomOut">-</button>
			<span class="min-w-10.5 text-center text-[10px] font-mono text-text-faint select-none">{{ zoomLabel }}</span>
			<button type="button"
				class="w-6 h-6 flex items-center justify-center text-text-dim hover:text-copper border border-transparent hover:border-copper/40 rounded-sm transition-colors cursor-pointer bg-transparent text-xs font-mono"
				@click="handleZoomIn">+</button>
		</div>
		<div
			ref="scroller"
			class="canvas-scroller"
			:class="{ 'cursor-grab': spaceHeld && !isPanning, 'cursor-grabbing': isPanning }"
			@wheel.prevent="handleWheel"
			@pointerdown="handleScrollerPointerDown"
			@pointermove="handleScrollerPointerMove"
			@pointerup="handleScrollerPointerUp"
			@pointercancel="handleScrollerPointerUp"
			@contextmenu="onCanvasContextMenu"
		>
			<div ref="stage" class="canvas-stage" :style="{ width: stageWidth + 'px', height: stageHeight + 'px' }">
				<img ref="sheetImg" class="sheet-image" :src="currentSheetImageSrc" alt="" :style="{
					width: stageWidth + 'px',
					height: stageHeight + 'px',
				}" draggable="false" @load="onImageLoad" />
				<div class="annotation-layer" :class="{ 'color-pick-armed': colorPickArmed }" :style="{
					width: stageWidth + 'px',
					height: stageHeight + 'px',
				}" @pointerdown="handleLayerPointerDown">
					<button v-for="(annotation, index) in annotations" :key="annotation.id" type="button"
						class="annotation-box" :class="{ selected: annotation.id === selectedId }"
						:style="boxStyle(annotation, index)" @pointerdown="handleBoxPointerDown($event, annotation)"
						@pointermove="handleBoxPointerMove" @pointerup="handleBoxPointerUp"
						@pointercancel="handleBoxPointerUp"
						@contextmenu.stop="onBoxContextMenu($event, annotation)">
						<div class="annotation-label">
							{{ annotation.name }} [{{ annotation.frame }}]
						</div>
						<div class="resize-handle" data-resize="true"></div>
					</button>
				</div>
			</div>
		</div>
		<ContextMenu ref="ctxMenu" />
	</div>
</template>
